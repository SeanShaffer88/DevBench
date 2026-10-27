import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSensitiveText } from '../shared/redaction';
import {
  captureLiveInspectorSnapshot,
  parseWindowsMinidumpBuffer,
  parseWorkspaceMinidump,
  synthesizeSampleWindowsMinidump,
} from './services/debugMinidumpService';
import {
  executeWorkspaceGitAction,
  getGitBlame,
  getGitFileDiff,
  getGitOverview,
  runGitPreCommitGate,
} from './services/gitAdapter';
import {
  generateMsixVisualAssetsSuite,
  generateMultiSizeIco,
  generateWin32ResourceRc,
} from './services/icoResourceService';
import { cancelJob, listJobs, runConsentedCommand, startBackgroundScan } from './services/jobRunner';
import { buildLockfileDependencyGraph } from './services/lockfileGraphService';
import { runPluginInWorkerSandbox } from './services/pluginWorkerSandbox';
import {
  deleteScaffoldedWorkspace,
  executeProjectScaffold,
  listScaffoldedWorkspaces,
  previewProjectScaffold,
  ScaffoldConsentError,
} from './services/projectScaffolder';
import {
  buildRedactedDiagnosticBundle,
  generateCycloneDxSbom,
  generateSarifReport,
  inspectProjectDependencies,
  scanWorkspaceSecrets,
} from './services/securityScanner';
import { validateComposeSpec, validateOpenApiSpec } from './services/specComposeValidator';
import { parseCoverageReport, runLiveVitestJson } from './services/testCoverageService';
import {
  applySqliteMigration,
  getSqliteSchema,
  insertSqliteTableRow,
  runSqliteQuery,
} from './services/sqliteService';
import {
  checkLocalPort,
  generateWindowsSandboxWsb,
  getSystemResourceSnapshot,
  inspectTlsCertificate,
  lookupDnsHost,
  validateWindowsManifestXml,
} from './services/systemDiagnostics';
import { inspectPathEntries, probeAllToolchains } from './services/toolchainProbe';
import { probeWindowsHostDiagnostics, validateAppxManifestXml } from './services/windowsHostBridge';
import {
  analyzeDirectorySizes,
  compareWorkspaceDirectories,
  executeWorkspaceReplace,
  listWorkspaceFiles,
  previewWorkspaceReplace,
  readWorkspaceFile,
  resolveSafeWorkspacePath,
  searchInWorkspace,
  undoWorkspaceReplace,
  WORKSPACE_ROOT,
  writeWorkspaceFile,
} from './services/workspaceFs';
import { attachDevBenchWebSocket } from './services/wsEchoServer';

export interface StructuredLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
  module: string;
  message: string;
}

const serverLogs: StructuredLogEntry[] = [
  {
    id: 'boot-1',
    timestamp: new Date().toISOString(),
    level: 'INFO',
    module: 'CoreHost',
    message: `DevBench Modular Host initialized at workspace ${WORKSPACE_ROOT}`,
  },
  {
    id: 'boot-2',
    timestamp: new Date().toISOString(),
    level: 'SECURITY',
    module: 'ConsentGate',
    message: 'Explicit command execution approval and credential redaction policies active.',
  },
  {
    id: 'boot-3',
    timestamp: new Date().toISOString(),
    level: 'INFO',
    module: 'PluginSandbox',
    message: 'Loaded 3 active isolated plugins; 3 optional legacy adapters remain unloaded on standby.',
  },
];

function recordLog(level: StructuredLogEntry['level'], module: string, message: string) {
  serverLogs.push({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    module,
    message: redactSensitiveText(message),
  });
  if (serverLogs.length > 300) serverLogs.shift();
}

export function createServerApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'DevBench Modular Workbench Core',
      version: '1.4.0',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      workspaceRoot: WORKSPACE_ROOT,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/logs', (_req, res) => {
    res.json({ logs: [...serverLogs].reverse() });
  });

  app.post('/api/logs/clear', (_req, res) => {
    serverLogs.length = 0;
    recordLog('INFO', 'Diagnostics', 'Structured log buffer cleared by user.');
    res.json({ ok: true, logs: [...serverLogs] });
  });

  app.get('/api/toolchains', async (_req, res) => {
    try {
      const [probe, pathInfo] = await Promise.all([probeAllToolchains(), Promise.resolve(inspectPathEntries())]);
      res.json({ ...probe, pathInfo });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/files', (_req, res) => {
    try {
      res.json({ root: WORKSPACE_ROOT, files: listWorkspaceFiles(450) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/files/read', (req, res) => {
    try {
      const filePath = String(req.query.path || '');
      if (!filePath) {
        res.status(400).json({ error: 'Query parameter `path` is required.' });
        return;
      }
      res.json(readWorkspaceFile(filePath));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/write', (req, res) => {
    try {
      const { path: filePath, content, lineEndings, withBom } = req.body || {};
      if (!filePath || typeof content !== 'string') {
        res.status(400).json({ error: '`path` and string `content` are required.' });
        return;
      }
      const saved = writeWorkspaceFile(filePath, content, { lineEndings, withBom });
      recordLog('INFO', 'CodeEditor', `Saved ${saved.savedPath} (${saved.bytesWritten} bytes)`);
      res.json(saved);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/search', (req, res) => {
    try {
      const { query, isRegex } = req.body || {};
      const hits = searchInWorkspace(String(query || ''), Boolean(isRegex));
      res.json({ hits });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/bulk-rename', (req, res) => {
    try {
      const { directory = '', findText = '', replaceText = '', execute = false, consentConfirmed = false } =
        req.body || {};
      if (!findText) {
        res.json({ previews: [] });
        return;
      }
      const targetDir = directory ? resolveSafeWorkspacePath(directory) : WORKSPACE_ROOT;
      const items = fs.readdirSync(targetDir, { withFileTypes: true }).filter((d) => d.isFile());
      const previews = items
        .filter((d) => d.name.includes(findText))
        .map((d) => ({
          oldName: d.name,
          newName: d.name.split(findText).join(replaceText),
        }))
        .filter((p) => p.oldName !== p.newName);

      if (execute) {
        if (!consentConfirmed) {
          res.status(403).json({ error: 'Explicit user consent is required to execute bulk rename.' });
          return;
        }
        for (const p of previews) {
          const src = resolveSafeWorkspacePath(path.join(directory, p.oldName));
          const dst = resolveSafeWorkspacePath(path.join(directory, p.newName));
          fs.renameSync(src, dst);
        }
        recordLog('WARN', 'BulkRename', `Renamed ${previews.length} file(s) in ${directory || '/'}`);
      }

      res.json({ executed: Boolean(execute), previews });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/disk-usage', (_req, res) => {
    res.json({ directories: analyzeDirectorySizes() });
  });

  app.get('/api/git/overview', async (_req, res) => {
    res.json(await getGitOverview());
  });

  app.get('/api/git/diff', async (req, res) => {
    const filePath = req.query.path ? String(req.query.path) : undefined;
    res.json({ diff: await getGitFileDiff(filePath) });
  });

  app.get('/api/git/blame', async (req, res) => {
    try {
      const filePath = String(req.query.path || 'README.md');
      res.json({ rows: await getGitBlame(filePath) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/git/precommit-check', async (req, res) => {
    try {
      const repoDir = req.body?.repoDir ? String(req.body.repoDir) : '.';
      res.json(await runGitPreCommitGate(repoDir));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/git/workspace-action', async (req, res) => {
    try {
      const out = await executeWorkspaceGitAction({
        workspaceSlug: String(req.body?.workspaceSlug || ''),
        action: req.body?.action,
        message: req.body?.message ? String(req.body.message) : undefined,
        branchName: req.body?.branchName ? String(req.body.branchName) : undefined,
        consentConfirmed: Boolean(req.body?.consentConfirmed),
      });
      recordLog('SECURITY', 'GitWorkspace', `Executed consented Git ${out.action}`);
      res.json(out);
    } catch (err) {
      if ((err as Error).name === 'GitConsentError') {
        res.status(403).json({ error: (err as Error).message });
        return;
      }
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/sqlite/schema', (_req, res) => {
    try {
      res.json(getSqliteSchema());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/sqlite/query', (req, res) => {
    try {
      const { sql, allowMutation } = req.body || {};
      const out = runSqliteQuery(String(sql || ''), Boolean(allowMutation));
      recordLog('INFO', 'SQLite', `Executed ${out.mode.toUpperCase()} query (${out.elapsedMs}ms, ${out.rowCount} rows)`);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/sqlite/insert-row', (req, res) => {
    try {
      const out = insertSqliteTableRow({
        table: String(req.body?.table || ''),
        values: req.body?.values || {},
        consentConfirmed: Boolean(req.body?.consentConfirmed),
      });
      recordLog('SECURITY', 'SQLite', `Inserted row into ${out.table} (id=${out.lastInsertRowid})`);
      res.json(out);
    } catch (err) {
      if ((err as Error).name === 'SqliteConsentError') {
        res.status(403).json({ error: (err as Error).message });
        return;
      }
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/sqlite/apply-migration', (req, res) => {
    try {
      const out = applySqliteMigration({
        version: String(req.body?.version || ''),
        name: String(req.body?.name || ''),
        upSql: String(req.body?.upSql || ''),
        consentConfirmed: Boolean(req.body?.consentConfirmed),
      });
      recordLog('SECURITY', 'SQLite', `Applied migration ${out.version} (${out.name})`);
      res.json(out);
    } catch (err) {
      if ((err as Error).name === 'SqliteConsentError') {
        res.status(403).json({ error: (err as Error).message });
        return;
      }
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/compare-dirs', (req, res) => {
    try {
      const { leftDir = 'windows', rightDir = 'electron' } = req.body || {};
      res.json(compareWorkspaceDirectories(String(leftDir), String(rightDir)));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/security/secrets', (req, res) => {
    const includeHistory = req.query.includeHistory === '1' || req.query.includeHistory === 'true';
    const out = scanWorkspaceSecrets(includeHistory);
    recordLog(
      'SECURITY',
      'SecretScanner',
      `Completed scan (${out.scannedFiles} files, ${out.scannedCommits} commits, ${out.findings.length} findings)`
    );
    res.json(out);
  });

  app.get('/api/security/dependencies', (_req, res) => {
    res.json({ dependencies: inspectProjectDependencies() });
  });

  app.get('/api/security/sbom', (_req, res) => {
    res.json(generateCycloneDxSbom());
  });

  app.post('/api/security/diagnostic-bundle', (_req, res) => {
    const logLines = serverLogs.slice(-30).map((l) => `[${l.timestamp}] [${l.level}] (${l.module}) ${l.message}`);
    res.json({ bundle: buildRedactedDiagnosticBundle(logLines) });
  });

  app.get('/api/system/snapshot', async (_req, res) => {
    res.json(await getSystemResourceSnapshot());
  });

  app.post('/api/network/port-check', async (req, res) => {
    const port = Number(req.body?.port || 4780);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      res.status(400).json({ error: 'Port must be an integer between 1 and 65535.' });
      return;
    }
    res.json(await checkLocalPort(port));
  });

  app.post('/api/network/dns', async (req, res) => {
    try {
      res.json(await lookupDnsHost(String(req.body?.hostname || 'localhost')));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/network/tls', async (req, res) => {
    try {
      res.json(await inspectTlsCertificate(String(req.body?.host || 'github.com'), Number(req.body?.port || 443)));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/network/http-proxy', async (req, res) => {
    try {
      const { method = 'GET', url = '', headers = {}, body, offlineMode = false } = req.body || {};
      const parsed = new URL(url);
      const isLoopback =
        parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';

      if (offlineMode && !isLoopback) {
        res.status(403).json({
          error: 'Offline Mode is active in Settings. External network requests are blocked; loopback endpoints remain accessible.',
        });
        return;
      }

      const start = performance.now();
      const response = await fetch(parsed.toString(), {
        method,
        headers,
        body: method !== 'GET' && method !== 'HEAD' && body ? String(body) : undefined,
        signal: AbortSignal.timeout(6000),
      });
      const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
      const text = await response.text();
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      recordLog('INFO', 'ApiClient', `${method} ${redactSensitiveText(url)} -> ${response.status} (${elapsedMs}ms)`);
      res.json({
        status: response.status,
        statusText: response.statusText,
        elapsedMs,
        headers: respHeaders,
        body: text.slice(0, 100_000),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/windows/validate-manifest', (req, res) => {
    const xml = String(req.body?.xml || '');
    res.json({ checks: validateWindowsManifestXml(xml) });
  });

  app.post('/api/windows/validate-appx', (req, res) => {
    const xml = String(req.body?.xml || '');
    res.json({ checks: validateAppxManifestXml(xml) });
  });

  app.get('/api/windows/host-diagnostics', async (_req, res) => {
    res.json(await probeWindowsHostDiagnostics());
  });

  app.post('/api/windows/generate-ico', (req, res) => {
    const {
      accentHex = '#0284c7',
      productName = 'DevBench',
      companyName = 'DevBench Contributors',
      fileDescription = 'Windows Desktop Application',
      version = '1.1.0.0',
    } = req.body || {};
    const icoBuf = generateMultiSizeIco(String(accentHex), [16, 32, 48, 256]);
    const rcText = generateWin32ResourceRc({
      productName: String(productName),
      companyName: String(companyName),
      fileDescription: String(fileDescription),
      version: String(version),
      icoFilename: 'app.ico',
    });
    res.json({
      bytes: icoBuf.length,
      icoBase64: icoBuf.toString('base64'),
      rcText,
    });
  });

  app.post('/api/windows/msix-assets', (req, res) => {
    try {
      const { accentHex = '#0284c7', writeToDir, consentConfirmed = false } = req.body || {};
      const assets = generateMsixVisualAssetsSuite(String(accentHex));

      if (writeToDir) {
        if (!consentConfirmed) {
          res.status(403).json({
            error: 'Explicit user consent is required before writing MSIX PNG tile assets to disk.',
          });
          return;
        }
        const safeDir = resolveSafeWorkspacePath(String(writeToDir));
        fs.mkdirSync(safeDir, { recursive: true });
        for (const a of assets) {
          fs.writeFileSync(path.join(safeDir, a.filename), a.pngBuffer);
        }
        recordLog('SECURITY', 'MsixAssets', `Wrote ${assets.length} MSIX visual tile PNGs to ${writeToDir}`);
      }

      res.json({
        wroteToDir: writeToDir || null,
        assets: assets.map((a) => ({
          filename: a.filename,
          label: a.label,
          width: a.width,
          height: a.height,
          bytes: a.bytes,
          dataUrl: a.dataUrl,
        })),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/windows/generate-wsb', (req, res) => {
    res.json({ wsb: generateWindowsSandboxWsb(req.body || {}) });
  });

  app.get('/api/adapters/custom', (_req, res) => {
    const adapterPath = path.join(WORKSPACE_ROOT, 'devbench.adapter.json');
    if (!fs.existsSync(adapterPath)) {
      res.json({ exists: false, adapter: null });
      return;
    }
    try {
      const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
      res.json({ exists: true, path: 'devbench.adapter.json', adapter });
    } catch (err) {
      res.status(400).json({ error: `Invalid devbench.adapter.json: ${(err as Error).message}` });
    }
  });

  app.get('/api/projects/scaffolded', (_req, res) => {
    res.json({ workspaces: listScaffoldedWorkspaces() });
  });

  app.post('/api/projects/scaffold/preview', (req, res) => {
    try {
      const b = req.body || {};
      const preview = previewProjectScaffold({
        templateId: String(b.templateId || 'tpl-csharp-winui3'),
        projectName: String(b.projectName || 'AuroraWinClient'),
        companyName: String(b.companyName || 'Contoso Desktop Engineering'),
        packageIdentifier: b.packageIdentifier ? String(b.packageIdentifier) : undefined,
        accentHex: b.accentHex ? String(b.accentHex) : '#0284c7',
        language: b.language || 'csharp',
        uiFrameworkId: String(b.uiFrameworkId || 'winui3'),
        buildSystemId: String(b.buildSystemId || 'msbuild-dotnet'),
        packageManagerId: String(b.packageManagerId || 'nuget'),
        testRunnerId: b.testRunnerId ? String(b.testRunnerId) : undefined,
        debuggerId: b.debuggerId ? String(b.debuggerId) : undefined,
        targetArchitectures: Array.isArray(b.targetArchitectures) ? b.targetArchitectures : ['x64', 'ARM64'],
        windowsSdkTarget: String(b.windowsSdkTarget || '10.0.22621.0'),
        includeWin32Manifest: b.includeWin32Manifest !== false,
        includeMsixManifest: Boolean(b.includeMsixManifest),
        includeBinaryIconAndRc: b.includeBinaryIconAndRc !== false,
        includeUnitTests: b.includeUnitTests !== false,
        includeBuildScripts: b.includeBuildScripts !== false,
        includeGitScaffold: b.includeGitScaffold !== false,
        initGitRepo: Boolean(b.initGitRepo),
      });
      res.json(preview);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/projects/scaffold/execute', (req, res) => {
    try {
      const b = req.body || {};
      const out = executeProjectScaffold(
        {
          templateId: String(b.templateId || 'tpl-csharp-winui3'),
          projectName: String(b.projectName || 'AuroraWinClient'),
          companyName: String(b.companyName || 'Contoso Desktop Engineering'),
          packageIdentifier: b.packageIdentifier ? String(b.packageIdentifier) : undefined,
          accentHex: b.accentHex ? String(b.accentHex) : '#0284c7',
          language: b.language || 'csharp',
          uiFrameworkId: String(b.uiFrameworkId || 'winui3'),
          buildSystemId: String(b.buildSystemId || 'msbuild-dotnet'),
          packageManagerId: String(b.packageManagerId || 'nuget'),
          testRunnerId: b.testRunnerId ? String(b.testRunnerId) : undefined,
          debuggerId: b.debuggerId ? String(b.debuggerId) : undefined,
          targetArchitectures: Array.isArray(b.targetArchitectures) ? b.targetArchitectures : ['x64', 'ARM64'],
          windowsSdkTarget: String(b.windowsSdkTarget || '10.0.22621.0'),
          includeWin32Manifest: b.includeWin32Manifest !== false,
          includeMsixManifest: Boolean(b.includeMsixManifest),
          includeBinaryIconAndRc: b.includeBinaryIconAndRc !== false,
          includeUnitTests: b.includeUnitTests !== false,
          includeBuildScripts: b.includeBuildScripts !== false,
          includeGitScaffold: b.includeGitScaffold !== false,
          initGitRepo: Boolean(b.initGitRepo),
        },
        Boolean(b.consentConfirmed),
        Boolean(b.overwrite)
      );
      recordLog(
        'SECURITY',
        'ProjectScaffolder',
        `User consented & scaffolded ${out.preview.totalFiles} files into ${out.preview.targetDir}`
      );
      res.json(out);
    } catch (err) {
      if (err instanceof ScaffoldConsentError) {
        recordLog('WARN', 'ConsentGate', `Blocked unconsented scaffold: ${err.message}`);
        res.status(403).json({ error: err.message });
        return;
      }
      const msg = (err as Error).message;
      res.status(msg.includes('already exists') ? 409 : 400).json({ error: msg });
    }
  });

  app.post('/api/projects/scaffolded/delete', (req, res) => {
    try {
      const { slug, consentConfirmed } = req.body || {};
      const out = deleteScaffoldedWorkspace(String(slug || ''), Boolean(consentConfirmed));
      recordLog('SECURITY', 'ProjectScaffolder', `User consented & removed scaffolded directory ${out.deleted}`);
      res.json(out);
    } catch (err) {
      if (err instanceof ScaffoldConsentError) {
        res.status(403).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/team/config', (_req, res) => {
    const teamPath = path.join(WORKSPACE_ROOT, '.devbench', 'team.json');
    if (!fs.existsSync(teamPath)) {
      res.json({ exists: false, config: null });
      return;
    }
    try {
      const config = JSON.parse(fs.readFileSync(teamPath, 'utf8'));
      res.json({ exists: true, path: '.devbench/team.json', config });
    } catch (err) {
      res.status(400).json({ error: `Invalid .devbench/team.json: ${(err as Error).message}` });
    }
  });

  app.post('/api/debug/inspector-snapshot', async (req, res) => {
    try {
      const expressions = Array.isArray(req.body?.expressions)
        ? req.body.expressions.map((e: unknown) => String(e))
        : undefined;
      const snap = await captureLiveInspectorSnapshot(expressions);
      res.json(snap);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/debug/minidump/sample', (req, res) => {
    try {
      const exceptionCode = Number(req.body?.exceptionCode ?? 0xc0000005);
      const arch = req.body?.arch === 'ARM64' || req.body?.arch === 'x86' ? req.body.arch : 'x64';
      const relOut = '.devbench/crashdumps/sample-crash.dmp';
      const absOut = resolveSafeWorkspacePath(relOut);
      fs.mkdirSync(path.dirname(absOut), { recursive: true });
      const buf = synthesizeSampleWindowsMinidump({ exceptionCode, arch });
      fs.writeFileSync(absOut, buf);
      const parsed = parseWindowsMinidumpBuffer(buf, relOut);
      recordLog(
        'INFO',
        'MinidumpParser',
        `Synthesized & parsed ${arch} Windows Minidump ${relOut} (${buf.length} bytes, ${parsed.exception?.exceptionName})`
      );
      res.json({ savedPath: relOut, parsed });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/debug/minidump/parse', (req, res) => {
    try {
      const { path: relPath, base64 } = req.body || {};
      if (typeof base64 === 'string' && base64.length > 0) {
        const buf = Buffer.from(base64, 'base64');
        res.json({ parsed: parseWindowsMinidumpBuffer(buf, relPath || 'uploaded.dmp') });
        return;
      }
      if (!relPath) {
        res.status(400).json({ error: 'Provide `path` to a workspace .dmp file or `base64` payload.' });
        return;
      }
      res.json({ parsed: parseWorkspaceMinidump(String(relPath)) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/packages/lockfile-graph', (req, res) => {
    try {
      const { targetDir, disallowStrongCopyleft, disallowUnknownLicense, maxNodes } = req.body || {};
      const graph = buildLockfileDependencyGraph({
        targetDir: targetDir ? String(targetDir) : '.',
        disallowStrongCopyleft:
          typeof disallowStrongCopyleft === 'boolean' ? disallowStrongCopyleft : true,
        disallowUnknownLicense:
          typeof disallowUnknownLicense === 'boolean' ? disallowUnknownLicense : false,
        maxNodes: typeof maxNodes === 'number' ? maxNodes : 120,
      });
      res.json(graph);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/plugins/sandbox-run', async (req, res) => {
    try {
      const { pluginId, action, targetPath, overridePermissions, timeoutMs } = req.body || {};
      if (!pluginId) {
        res.status(400).json({ error: '`pluginId` is required.' });
        return;
      }
      const out = await runPluginInWorkerSandbox({
        pluginId: String(pluginId),
        action: action ? String(action) : undefined,
        targetPath: targetPath ? String(targetPath) : undefined,
        overridePermissions: Array.isArray(overridePermissions) ? overridePermissions : undefined,
        timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
      });
      recordLog(
        out.ok ? 'INFO' : 'SECURITY',
        'PluginSandbox',
        `Worker #${out.isolatedThreadId} (${out.pluginId}/${out.action}): ${out.outputSummary}`
      );
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/replace/preview', (req, res) => {
    try {
      const { search, replace, isRegex, caseSensitive, includePrefix } = req.body || {};
      const preview = previewWorkspaceReplace({
        search: String(search || ''),
        replace: String(replace ?? ''),
        isRegex: Boolean(isRegex),
        caseSensitive: Boolean(caseSensitive),
        includePrefix: includePrefix ? String(includePrefix) : '',
      });
      res.json(preview);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/replace/execute', (req, res) => {
    try {
      const { search, replace, isRegex, caseSensitive, includePrefix, consentConfirmed } =
        req.body || {};
      if (!consentConfirmed) {
        res.status(403).json({
          error: 'Explicit user consent is required before applying multi-file search-and-replace.',
        });
        return;
      }
      const out = executeWorkspaceReplace({
        search: String(search || ''),
        replace: String(replace ?? ''),
        isRegex: Boolean(isRegex),
        caseSensitive: Boolean(caseSensitive),
        includePrefix: includePrefix ? String(includePrefix) : '',
      });
      recordLog(
        'SECURITY',
        'MultiFileReplace',
        `Applied ${out.totalReplacements} replacement(s) across ${out.filesModified.length} file(s); snapshot saved at ${out.backupPath}`
      );
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/files/replace/undo', (req, res) => {
    try {
      const { undoId, consentConfirmed } = req.body || {};
      if (!consentConfirmed) {
        res.status(403).json({
          error: 'Explicit user consent is required before restoring a multi-file replace backup.',
        });
        return;
      }
      const out = undoWorkspaceReplace(String(undoId || ''));
      recordLog(
        'SECURITY',
        'MultiFileReplace',
        `Restored ${out.restoredFiles.length} file(s) from undo snapshot ${out.undoId}`
      );
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/test/run-vitest', async (req, res) => {
    try {
      const { filter, consentConfirmed } = req.body || {};
      if (!consentConfirmed) {
        res.status(403).json({
          error: 'Explicit user consent is required before executing live Vitest suites.',
        });
        return;
      }
      const out = await runLiveVitestJson({
        filter: filter ? String(filter) : undefined,
        consentConfirmed: true,
      });
      recordLog(
        out.ok ? 'INFO' : 'WARN',
        'TestRunner',
        `Ran live Vitest JSON (${out.passedTests}/${out.totalTests} assertions passed in ${out.durationMs}ms)`
      );
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/test/parse-coverage', (req, res) => {
    try {
      const { content, path: covPath } = req.body || {};
      const report = parseCoverageReport({
        content: typeof content === 'string' ? content : undefined,
        path: typeof covPath === 'string' ? covPath : undefined,
      });
      res.json(report);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/security/sarif', (req, res) => {
    try {
      const includeHistory = req.query.includeHistory !== '0';
      res.json(generateSarifReport(includeHistory));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/specs/validate-openapi', (req, res) => {
    try {
      const { spec } = req.body || {};
      res.json(validateOpenApiSpec(String(spec || '')));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/specs/validate-compose', (req, res) => {
    try {
      const { yaml } = req.body || {};
      res.json(validateComposeSpec(String(yaml || '')));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/jobs', (_req, res) => {
    res.json({ jobs: listJobs() });
  });

  app.get('/api/jobs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const pushSnapshot = () => {
      res.write(`data: ${JSON.stringify({ jobs: listJobs() })}\n\n`);
    };
    pushSnapshot();
    const timer = setInterval(pushSnapshot, 800);
    req.on('close', () => clearInterval(timer));
  });

  app.post('/api/jobs/scan', (req, res) => {
    const kind = req.body?.kind || 'secret-scan';
    if (!['secret-scan', 'disk-cache-scan', 'toolchain-probe'].includes(kind)) {
      res.status(400).json({ error: 'Invalid scan kind.' });
      return;
    }
    const job = startBackgroundScan(kind);
    recordLog('INFO', 'JobRunner', `Started background job ${job.name} (${job.id})`);
    res.json({ job });
  });

  app.post('/api/jobs/command', (req, res) => {
    try {
      const { label, command, category, consentConfirmed, cwd, shellProfile, envOverrides } =
        req.body || {};
      const job = runConsentedCommand({
        label: String(label || command || 'Task'),
        command: String(command || ''),
        category: category || 'build',
        consentConfirmed: Boolean(consentConfirmed),
        cwd: cwd ? String(cwd) : undefined,
        shellProfile: shellProfile ? String(shellProfile) : undefined,
        envOverrides,
      });
      recordLog('SECURITY', 'ConsentGate', `User approved command execution: ${redactSensitiveText(String(command))}`);
      res.json({ job });
    } catch (err) {
      recordLog('WARN', 'ConsentGate', `Blocked command request: ${(err as Error).message}`);
      res.status(403).json({ error: (err as Error).message });
    }
  });

  app.post('/api/jobs/:id/cancel', (req, res) => {
    const job = cancelJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    recordLog('WARN', 'JobRunner', `Cancelled job ${job.name} (${job.id})`);
    res.json({ job });
  });

  // Serve built static frontend in standalone production / Electron desktop mode
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(WORKSPACE_ROOT, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}

export function createHttpServer() {
  const app = createServerApp();
  const server = http.createServer(app);
  attachDevBenchWebSocket(server);
  return server;
}

const isDirectEntry =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectEntry) {
  const port = Number(process.env.DEVBENCH_PORT || 4780);
  const host = process.env.NODE_ENV === 'production' && !process.env.DEVBENCH_DESKTOP ? '0.0.0.0' : '127.0.0.1';
  const server = createHttpServer();
  server.listen(port, host, () => {
    console.log(`[DevBench Core API] Listening on http://${host}:${port} (HTTP + SSE + WebSocket)`);
  });
}
