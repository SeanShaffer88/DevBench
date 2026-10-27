import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { BUILTIN_PLUGINS } from '../../shared/catalog/plugins';
import { PluginPermission } from '../../shared/types';
import { redactSensitiveText } from '../../shared/redaction';
import { resolveSafeWorkspacePath } from './workspaceFs';

export interface CapabilityAuditEntry {
  capability: PluginPermission;
  target: string;
  decision: 'ALLOWED' | 'DENIED';
  timestamp: string;
}

export interface PluginSandboxExecutionResult {
  pluginId: string;
  pluginName: string;
  action: string;
  isolatedThreadId: number;
  durationMs: number;
  timedOut: boolean;
  ok: boolean;
  grantedPermissions: PluginPermission[];
  auditLog: CapabilityAuditEntry[];
  outputSummary: string;
  structuredOutput?: Record<string, unknown>;
}

const WORKER_SCRIPT = `
const { parentPort, workerData, threadId } = require('node:worker_threads');
const vm = require('node:vm');

let reqCounter = 0;
const pending = new Map();

parentPort.on('message', (msg) => {
  if (msg && msg.type === 'cap-response' && pending.has(msg.reqId)) {
    const { resolve, reject } = pending.get(msg.reqId);
    pending.delete(msg.reqId);
    if (msg.allowed) resolve(msg.data);
    else reject(new Error(msg.error || 'PermissionDenied'));
  }
});

function requestCapability(capability, target, payload) {
  const reqId = ++reqCounter;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    parentPort.postMessage({ type: 'cap-request', reqId, capability, target, payload });
  });
}

(async () => {
  const { pluginId, action, targetPath } = workerData;
  const sandboxGlobal = Object.freeze({
    pluginId,
    action,
    targetPath,
    host: Object.freeze({ requestCapability }),
  });

  const pluginCode = \`
    (async () => {
      if (action === 'test-unauthorized-write') {
        await host.requestCapability('filesystem:write', '.devbench/unauthorized-probe.txt', { content: 'blocked' });
        return { message: 'Unexpectedly wrote file' };
      }
      if (action === 'infinite-loop-probe') {
        while (true) {}
      }
      if (pluginId === 'plugin.msix-packager') {
        const xml = await host.requestCapability('filesystem:read', targetPath || 'windows/Package.appxmanifest');
        const hasIdentity = /<Identity\\\\b/i.test(xml);
        const hasVisual = /<uap:VisualElements\\\\b/i.test(xml);
        return {
          message: 'Validated MSIX AppxManifest inside isolated worker_thread.',
          hasIdentity,
          hasVisualElements: hasVisual,
          manifestBytes: xml.length,
        };
      }
      if (pluginId === 'plugin.windows-sandbox') {
        const wsb = await host.requestCapability('filesystem:read', targetPath || 'windows/DevBench.wsb');
        const readOnlyMapped = /<ReadOnly>true<\\\\/ReadOnly>/i.test(wsb);
        return {
          message: 'Audited Windows Sandbox (.wsb) clean-room configuration in worker_thread.',
          readOnlyHostMapping: readOnlyMapped,
          bytes: wsb.length,
        };
      }
      if (pluginId === 'plugin.enterprise-legacy-sdk') {
        const raw = await host.requestCapability('filesystem:read', targetPath || 'devbench.adapter.json');
        const parsed = JSON.parse(raw);
        return {
          message: 'Validated enterprise custom toolchain adapter manifest in worker_thread.',
          adapterId: parsed.id || 'custom',
          commandsCount: Array.isArray(parsed.commands) ? parsed.commands.length : Object.keys(parsed).length,
        };
      }
      // Generic adapter inspection using filesystem:read + optional env:read
      const pkgRaw = await host.requestCapability('filesystem:read', targetPath || 'package.json');
      let osArch = 'isolated';
      try {
        osArch = await host.requestCapability('env:read', 'PROCESSOR_ARCHITECTURE');
      } catch {
        osArch = 'env:read not granted (enforced)';
      }
      const parsed = JSON.parse(pkgRaw);
      return {
        message: 'Executed isolated plugin inspection in worker_threads VM compartment.',
        workspaceName: parsed.name || 'workspace',
        hostArchProbe: osArch,
      };
    })()
  \`;

  try {
    const context = vm.createContext(sandboxGlobal, {
      codeGeneration: { strings: false, wasm: false },
    });
    const result = await vm.runInContext(pluginCode, context, { timeout: 1000 });
    parentPort.postMessage({ type: 'done', ok: true, threadId, result });
  } catch (err) {
    parentPort.postMessage({
      type: 'done',
      ok: false,
      threadId,
      error: err && err.message ? err.message : String(err),
    });
  }
})();
`;

export async function runPluginInWorkerSandbox(opts: {
  pluginId: string;
  action?: string;
  targetPath?: string;
  overridePermissions?: PluginPermission[];
  timeoutMs?: number;
}): Promise<PluginSandboxExecutionResult> {
  const started = Date.now();
  const manifest = BUILTIN_PLUGINS.find((p) => p.id === opts.pluginId);
  if (!manifest) {
    throw new Error(`Unknown plugin "${opts.pluginId}".`);
  }

  const grantedPermissions = opts.overridePermissions ?? manifest.permissions;
  const action = opts.action || 'inspect-workspace';
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 1500, 100), 5000);
  const auditLog: CapabilityAuditEntry[] = [];

  return new Promise<PluginSandboxExecutionResult>((resolve) => {
    let settled = false;
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: {
        pluginId: manifest.id,
        action,
        targetPath: opts.targetPath,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: 48,
        maxYoungGenerationSizeMb: 16,
      },
    });

    const threadId = worker.threadId;

    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await worker.terminate();
      resolve({
        pluginId: manifest.id,
        pluginName: manifest.name,
        action,
        isolatedThreadId: threadId,
        durationMs: Date.now() - started,
        timedOut: true,
        ok: false,
        grantedPermissions,
        auditLog,
        outputSummary: `Plugin worker terminated after exceeding ${timeoutMs}ms execution budget.`,
      });
    }, timeoutMs);

    worker.on('message', (msg: Record<string, unknown>) => {
      if (settled) return;
      if (msg.type === 'cap-request') {
        const capability = msg.capability as PluginPermission;
        const target = String(msg.target || '');
        const reqId = Number(msg.reqId);
        const allowed = grantedPermissions.includes(capability);

        auditLog.push({
          capability,
          target,
          decision: allowed ? 'ALLOWED' : 'DENIED',
          timestamp: new Date().toISOString(),
        });

        if (!allowed) {
          worker.postMessage({
            type: 'cap-response',
            reqId,
            allowed: false,
            error: `PermissionDenied: Plugin "${manifest.id}" lacks required permission "${capability}" for target "${target}".`,
          });
          return;
        }

        try {
          let data: unknown = null;
          if (capability === 'filesystem:read') {
            const abs = resolveSafeWorkspacePath(target);
            data = redactSensitiveText(fs.readFileSync(abs, 'utf8').slice(0, 64_000));
          } else if (capability === 'env:read') {
            const safeEnvKeys = new Set([
              'PROCESSOR_ARCHITECTURE',
              'OS',
              'NODE_ENV',
              'WINDIR',
            ]);
            data = safeEnvKeys.has(target)
              ? process.env[target] || process.arch
              : '[REDACTED_ENV_KEY]';
          } else if (capability === 'filesystem:write') {
            // Even when granted in sandbox preview, restrict to .devbench/sandbox-out/
            const safeRel = `.devbench/sandbox-out/${target.replace(/[^A-Za-z0-9._-]/g, '_')}`;
            const abs = resolveSafeWorkspacePath(safeRel);
            fs.mkdirSync(resolveSafeWorkspacePath('.devbench/sandbox-out'), { recursive: true });
            const payload = (msg.payload as { content?: string })?.content ?? '';
            fs.writeFileSync(abs, payload, 'utf8');
            data = { writtenTo: safeRel };
          } else {
            data = { granted: capability };
          }

          worker.postMessage({
            type: 'cap-response',
            reqId,
            allowed: true,
            data,
          });
        } catch (err) {
          worker.postMessage({
            type: 'cap-response',
            reqId,
            allowed: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (msg.type === 'done') {
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        const ok = Boolean(msg.ok);
        const resultObj = (msg.result as Record<string, unknown>) || undefined;
        const summary = ok
          ? redactSensitiveText(String(resultObj?.message || 'Plugin task succeeded.'))
          : redactSensitiveText(String(msg.error || 'Plugin task failed.'));
        resolve({
          pluginId: manifest.id,
          pluginName: manifest.name,
          action,
          isolatedThreadId: threadId,
          durationMs: Date.now() - started,
          timedOut: false,
          ok,
          grantedPermissions,
          auditLog,
          outputSummary: summary,
          structuredOutput: resultObj,
        });
      }
    });

    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        pluginId: manifest.id,
        pluginName: manifest.name,
        action,
        isolatedThreadId: threadId,
        durationMs: Date.now() - started,
        timedOut: false,
        ok: false,
        grantedPermissions,
        auditLog,
        outputSummary: redactSensitiveText(`Worker error: ${err.message}`),
      });
    });
  });
}
