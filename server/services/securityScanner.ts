import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redactSensitiveText, scanTextForSecrets } from '../../shared/redaction';
import { DependencyItem, SecretFinding } from '../../shared/types';
import { listWorkspaceFiles, readWorkspaceFile, WORKSPACE_ROOT } from './workspaceFs';

export function scanWorkspaceSecrets(): {
  scannedFiles: number;
  findings: SecretFinding[];
  completedAt: string;
} {
  const files = listWorkspaceFiles(350).filter((f) => f.type === 'file' && f.size < 256 * 1024);
  const findings: SecretFinding[] = [];
  let scannedFiles = 0;

  for (const file of files) {
    // Skip the scanner rule definitions themselves so regex test strings aren't self-flagged
    if (file.path === 'shared/redaction.ts' || file.path.endsWith('.test.ts')) continue;
    try {
      const data = readWorkspaceFile(file.path);
      if (data.isBinary) continue;
      scannedFiles++;
      const matches = scanTextForSecrets(data.content);
      for (const m of matches) {
        findings.push({
          id: `${file.path}:${m.line}:${m.ruleId}`,
          file: file.path,
          line: m.line,
          ruleId: m.ruleId,
          ruleName: m.ruleName,
          severity: m.severity,
          redactedSnippet: m.redactedSnippet,
          source: 'working-tree',
        });
      }
    } catch {
      // ignore unreadable
    }
  }

  return {
    scannedFiles,
    findings,
    completedAt: new Date().toISOString(),
  };
}

export function inspectProjectDependencies(): DependencyItem[] {
  const pkgJsonPath = path.join(WORKSPACE_ROOT, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const items: DependencyItem[] = [];
    const entries: [string, string, boolean][] = [
      ...Object.entries(pkg.dependencies || {}).map(([k, v]): [string, string, boolean] => [k, v, false]),
      ...Object.entries(pkg.devDependencies || {}).map(([k, v]): [string, string, boolean] => [k, v, true]),
    ];

    for (const [name, specVer, isDev] of entries) {
      let installedVersion = specVer.replace(/^[\^~]/, '');
      let license = 'MIT';
      const depPkgPath = path.join(WORKSPACE_ROOT, 'node_modules', name, 'package.json');
      if (fs.existsSync(depPkgPath)) {
        try {
          const depMeta = JSON.parse(fs.readFileSync(depPkgPath, 'utf8'));
          if (depMeta.version) installedVersion = depMeta.version;
          if (typeof depMeta.license === 'string') license = depMeta.license;
          else if (depMeta.license?.type) license = depMeta.license.type;
        } catch {
          // keep fallback
        }
      }

      const copyleft = /^(GPL|AGPL|LGPL)/i.test(license);
      items.push({
        name,
        currentVersion: installedVersion,
        latestVersion: installedVersion,
        ecosystem: 'npm (Node.js / TypeScript)',
        devDependency: isDev,
        license,
        licenseWarning: copyleft ? 'Copyleft license requires legal review for proprietary desktop binaries.' : undefined,
      });
    }

    return items;
  } catch {
    return [];
  }
}

export function generateCycloneDxSbom() {
  const deps = inspectProjectDependencies();
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: 'DevBench', name: 'DevBench Security & SBOM Module', version: '1.0.0' }],
      component: {
        type: 'application',
        name: 'devbench',
        version: '1.0.0',
      },
    },
    components: deps.map((d) => ({
      type: 'library',
      name: d.name,
      version: d.currentVersion,
      purl: `pkg:npm/${encodeURIComponent(d.name)}@${d.currentVersion}`,
      scope: d.devDependency ? 'optional' : 'required',
      licenses: [{ license: { id: d.license } }],
    })),
  };
}

export function buildRedactedDiagnosticBundle(extraLogs: string[] = []): string {
  const cpus = os.cpus();
  const safeEnvKeys = ['NODE_ENV', 'SHELL', 'TERM', 'LANG', 'PROCESSOR_ARCHITECTURE', 'OS'];
  const envSummary = safeEnvKeys
    .filter((k) => process.env[k])
    .map((k) => `  ${k}=${redactSensitiveText(process.env[k] || '', true)}`)
    .join('\n');

  const rawReport = [
    '# DevBench Redacted Diagnostic Bundle',
    `Generated: ${new Date().toISOString()}`,
    `Host OS: ${process.platform} (${os.release()}) | Arch: ${process.arch}`,
    `Node Runtime: ${process.version}`,
    `CPU Cores: ${cpus.length}x ${cpus[0]?.model || 'Unknown CPU'}`,
    `Memory: ${Math.round(os.freemem() / 1024 / 1024)} MB free / ${Math.round(os.totalmem() / 1024 / 1024)} MB total`,
    `Workspace Root: ${WORKSPACE_ROOT}`,
    '',
    '## Sanitized Environment Summary',
    envSummary || '  (minimal environment)',
    '',
    '## Recent Workbench Logs (Secrets & User Paths Redacted)',
    ...(extraLogs.length > 0 ? extraLogs : ['  No errors recorded in current session.']),
  ].join('\n');

  return redactSensitiveText(rawReport, true);
}
