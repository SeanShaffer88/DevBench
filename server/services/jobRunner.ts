import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { redactSensitiveText } from '../../shared/redaction';
import { BackgroundJob } from '../../shared/types';
import { scanWorkspaceSecrets } from './securityScanner';
import { probeAllToolchains } from './toolchainProbe';
import { analyzeDirectorySizes, resolveSafeWorkspacePath, WORKSPACE_ROOT } from './workspaceFs';

const jobs = new Map<string, BackgroundJob>();
const controllers = new Map<string, AbortController>();

function makeId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function listJobs(): BackgroundJob[] {
  return Array.from(jobs.values())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 30);
}

export function getJob(id: string): BackgroundJob | undefined {
  return jobs.get(id);
}

export function cancelJob(id: string): BackgroundJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  const ctrl = controllers.get(id);
  if (ctrl) ctrl.abort();
  if (job.status === 'running') {
    job.status = 'cancelled';
    job.detail = 'Cancelled by user';
    job.finishedAt = new Date().toISOString();
    job.logs.push(`[${new Date().toISOString()}] Job cancelled by user.`);
  }
  return job;
}

export function startBackgroundScan(kind: 'secret-scan' | 'disk-cache-scan' | 'toolchain-probe'): BackgroundJob {
  const id = makeId();
  const ctrl = new AbortController();
  controllers.set(id, ctrl);

  const titles: Record<typeof kind, string> = {
    'secret-scan': 'Workspace Secret & Credential Scan',
    'disk-cache-scan': 'Build Cache & Folder Size Analysis',
    'toolchain-probe': 'SDK, Compiler & Toolchain Discovery',
  };

  const job: BackgroundJob = {
    id,
    name: titles[kind],
    category: kind === 'toolchain-probe' ? 'diagnostics' : 'scan',
    status: 'running',
    progress: 10,
    detail: 'Initializing background worker...',
    startedAt: new Date().toISOString(),
    logs: [`[${new Date().toISOString()}] Started ${titles[kind]}...`],
  };

  jobs.set(id, job);

  (async () => {
    try {
      await new Promise((r) => setTimeout(r, 250));
      if (ctrl.signal.aborted) return;
      job.progress = 40;
      job.detail = 'Scanning workspace artifacts...';

      if (kind === 'secret-scan') {
        const res = scanWorkspaceSecrets();
        await new Promise((r) => setTimeout(r, 250));
        if (ctrl.signal.aborted) return;
        job.progress = 100;
        job.status = 'completed';
        job.detail = `Scanned ${res.scannedFiles} files — ${res.findings.length} potential secret(s) flagged.`;
        job.logs.push(`Scanned ${res.scannedFiles} files across workspace.`);
        job.logs.push(`Findings count: ${res.findings.length}`);
      } else if (kind === 'disk-cache-scan') {
        const dirs = analyzeDirectorySizes();
        await new Promise((r) => setTimeout(r, 250));
        if (ctrl.signal.aborted) return;
        const totalMb = Math.round(dirs.reduce((acc, d) => acc + d.bytes, 0) / 1024 / 1024 * 10) / 10;
        job.progress = 100;
        job.status = 'completed';
        job.detail = `Analyzed ${dirs.length} top-level folders (${totalMb} MB total).`;
        for (const d of dirs) {
          job.logs.push(`${d.name.padEnd(18)} ${(d.bytes / 1024).toFixed(1)} KB (${d.category})`);
        }
      } else {
        const probe = await probeAllToolchains();
        if (ctrl.signal.aborted) return;
        const found = probe.results.filter((r) => r.installed).length;
        job.progress = 100;
        job.status = 'completed';
        job.detail = `Detected ${found} of ${probe.results.length} probed SDKs/tools on ${probe.hostPlatform}.`;
        for (const r of probe.results.filter((x) => x.installed)) {
          job.logs.push(`[OK] ${r.name}: ${r.detectedVersion} (${r.path})`);
        }
      }
      job.finishedAt = new Date().toISOString();
    } catch (err) {
      if (!ctrl.signal.aborted) {
        job.status = 'failed';
        job.detail = (err as Error).message;
        job.finishedAt = new Date().toISOString();
        job.logs.push(`[ERROR] ${(err as Error).message}`);
      }
    } finally {
      controllers.delete(id);
    }
  })();

  return job;
}

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\/(?:\s|$)/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bgit\s+(?:checkout|switch|branch\s+-[mMdD])\b/i,
];

export function runConsentedCommand(opts: {
  label: string;
  command: string;
  category: BackgroundJob['category'];
  consentConfirmed: boolean;
  cwd?: string;
  shellProfile?: string;
  envOverrides?: Record<string, string>;
}): BackgroundJob {
  if (!opts.consentConfirmed) {
    throw new Error('Explicit user consent is required before running external commands.');
  }

  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(opts.command)) {
      throw new Error('Command blocked by DevBench workspace safety policy.');
    }
  }

  // Safely resolve working directory inside WORKSPACE_ROOT (fall back to WORKSPACE_ROOT for virtual Windows paths)
  let execCwd = WORKSPACE_ROOT;
  if (opts.cwd && opts.cwd.trim() && opts.cwd !== '.' && !/^[A-Za-z]:\\/.test(opts.cwd)) {
    const candidate = resolveSafeWorkspacePath(opts.cwd);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      execCwd = candidate;
    }
  }
  const relCwd = path.relative(WORKSPACE_ROOT, execCwd) || '.';

  // Sanitize envOverrides: never pass raw vault:// references into child env
  const safeEnvOverrides: Record<string, string> = {};
  if (opts.envOverrides) {
    for (const [k, v] of Object.entries(opts.envOverrides)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
      if (typeof v !== 'string' || v.startsWith('vault://')) continue;
      safeEnvOverrides[k] = v;
    }
  }

  const profileLabel = opts.shellProfile || 'auto';
  const id = makeId();
  const ctrl = new AbortController();
  controllers.set(id, ctrl);

  const initialLogs = [
    `[Shell: ${profileLabel} | CWD: ${relCwd}${
      Object.keys(safeEnvOverrides).length > 0
        ? ` | Injected Env: ${Object.keys(safeEnvOverrides).join(', ')}`
        : ''
    }]`,
    `$ ${redactSensitiveText(opts.command)}`,
  ];

  const job: BackgroundJob = {
    id,
    name: opts.label || opts.command,
    category: opts.category || 'build',
    status: 'running',
    progress: 15,
    detail: `[${relCwd}] $ ${opts.command}`,
    startedAt: new Date().toISOString(),
    logs: initialLogs,
  };

  jobs.set(id, job);

  let shellBin = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  let shellArgs =
    process.platform === 'win32' ? ['/d', '/s', '/c', opts.command] : ['-c', opts.command];

  if (process.platform === 'win32' && (opts.shellProfile === 'pwsh' || opts.shellProfile === 'winps')) {
    shellBin = opts.shellProfile === 'pwsh' ? 'pwsh.exe' : 'powershell.exe';
    shellArgs = ['-NoLogo', '-NoProfile', '-Command', opts.command];
  } else if (process.platform !== 'win32' && fs.existsSync('/bin/bash')) {
    shellBin = '/bin/bash';
    shellArgs = ['-c', opts.command];
  }

  const child = spawn(shellBin, shellArgs, {
    cwd: execCwd,
    env: { ...process.env, ...safeEnvOverrides },
    signal: ctrl.signal,
  });

  const appendLines = (chunk: Buffer) => {
    const text = redactSensitiveText(chunk.toString('utf8'));
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const l of lines) {
      job.logs.push(l);
      if (job.logs.length > 500) job.logs.shift();
    }
    job.progress = Math.min(92, job.progress + 8);
  };

  child.stdout.on('data', appendLines);
  child.stderr.on('data', appendLines);

  child.on('close', (code) => {
    controllers.delete(id);
    if (job.status === 'cancelled') return;
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    if (code === 0) {
      job.status = 'completed';
      job.detail = `Completed (exit code 0)`;
      job.logs.push('[Process exited with code 0]');
    } else {
      job.status = 'failed';
      job.detail = `Exited with code ${code ?? 1}`;
      job.logs.push(`[Process exited with code ${code ?? 1}]`);
    }
  });

  child.on('error', (err) => {
    controllers.delete(id);
    if (job.status === 'cancelled') return;
    job.status = 'failed';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.detail = err.message;
    job.logs.push(`[Spawn Error] ${err.message}`);
  });

  return job;
}
