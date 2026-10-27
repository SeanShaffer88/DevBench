import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  ClipboardCopy,
  Download,
  HardDrive,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { TROUBLESHOOTING_GUIDES } from '../../shared/catalog/plugins';
import { SecretFinding } from '../../shared/types';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

export const SecurityModule: React.FC = () => {
  const {
    triggerScanJob,
    runCommandWithConsent,
    copySafeText,
    openFileInEditor,
    notify,
  } = useWorkbench();

  const [tab, setTab] = useState<'secrets' | 'logs' | 'resources' | 'diagnostics'>('secrets');

  // Secrets & SBOM
  const [scanSummary, setScanSummary] = useState<{
    scannedFiles: number;
    findings: SecretFinding[];
    completedAt: string;
  } | null>(null);

  // Logs & Live Tail
  const [logs, setLogs] = useState<
    { id: string; timestamp: string; level: string; module: string; message: string }[]
  >([]);
  const [liveTail, setLiveTail] = useState(true);
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [logQuery, setLogQuery] = useState('');

  // System & Disk
  const [sysSnap, setSysSnap] = useState<{
    platform: string;
    arch: string;
    cpuCount: number;
    cpuModel: string;
    memory: { totalMb: number; usedMb: number; percentUsed: number };
    processes: { pid: string; name: string; mem: string; command: string }[];
  } | null>(null);
  const [dirs, setDirs] = useState<
    { name: string; category: string; bytes: number; fileCount: number; reclaimable: boolean }[]
  >([]);

  // Diagnostic bundle
  const [diagBundle, setDiagBundle] = useState('');
  const [guideFilter, setGuideFilter] = useState('');

  const runImmediateSecretScan = useCallback(async () => {
    const r = await fetch('/api/security/secrets');
    setScanSummary(await r.json());
  }, []);

  const fetchLogs = useCallback(async () => {
    const r = await fetch('/api/logs');
    const d = await r.json();
    setLogs(d.logs || []);
  }, []);

  const fetchResources = useCallback(async () => {
    const [s, du] = await Promise.all([
      fetch('/api/system/snapshot').then((r) => r.json()),
      fetch('/api/disk-usage').then((r) => r.json()),
    ]);
    setSysSnap(s);
    setDirs(du.directories || []);
  }, []);

  const fetchBundle = useCallback(async () => {
    const r = await fetch('/api/security/diagnostic-bundle', { method: 'POST' });
    const d = await r.json();
    setDiagBundle(d.bundle || '');
  }, []);

  useEffect(() => {
    runImmediateSecretScan();
    fetchLogs();
    fetchResources();
    fetchBundle();
  }, [runImmediateSecretScan, fetchLogs, fetchResources, fetchBundle]);

  useEffect(() => {
    if (!liveTail || tab !== 'logs') return;
    const t = setInterval(fetchLogs, 2000);
    return () => clearInterval(t);
  }, [liveTail, tab, fetchLogs]);

  const exportSbom = async () => {
    const r = await fetch('/api/security/sbom');
    const sbom = await r.json();
    const blob = new Blob([JSON.stringify(sbom, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devbench.sbom.cdx.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('Exported CycloneDX 1.5 SBOM.');
  };

  const clearServerLogs = async () => {
    await fetch('/api/logs/clear', { method: 'POST' });
    await fetchLogs();
    notify('Cleared structured log buffer.');
  };

  const filteredLogs = logs.filter(
    (l) =>
      (levelFilter === 'ALL' || l.level === levelFilter) &&
      (!logQuery ||
        l.message.toLowerCase().includes(logQuery.toLowerCase()) ||
        l.module.toLowerCase().includes(logQuery.toLowerCase()))
  );

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Secret scanner, CycloneDX SBOM, live-tail logs, disk/build-cache analyzer & redacted diagnostics" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'secrets' ? 'active' : ''}`}
          onClick={() => setTab('secrets')}
        >
          <ShieldCheck size={14} /> Secret Scanner, Static Quality & SBOM
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'logs' ? 'active' : ''}`}
          onClick={() => setTab('logs')}
        >
          <Activity size={14} /> Structured Log Viewer & Live Tail ({logs.length})
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'resources' ? 'active' : ''}`}
          onClick={() => setTab('resources')}
        >
          <HardDrive size={14} /> Process, Memory & Build-Cache Disk Analyzer
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'diagnostics' ? 'active' : ''}`}
          onClick={() => setTab('diagnostics')}
        >
          <BookOpen size={14} /> Troubleshooting Guides & Redacted Bundle
        </button>
      </div>

      {tab === 'secrets' && (
        <div className="stack-md">
          <div className="grid-3">
            <div className="card stack-sm">
              <strong>Working-Tree Secret Detection</strong>
              <div className="flex-row">
                <span
                  className={`badge ${
                    (scanSummary?.findings.length || 0) === 0 ? 'badge-success' : 'badge-danger'
                  }`}
                >
                  {scanSummary?.findings.length || 0} Secrets Detected
                </span>
                <span className="badge">{scanSummary?.scannedFiles || 0} Files Scanned</span>
              </div>
              <div className="flex-row" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => triggerScanJob('secret-scan')}
                >
                  Background Scan (Cancellable)
                </button>
                <button type="button" className="btn btn-sm" onClick={runImmediateSecretScan}>
                  Quick Refresh
                </button>
              </div>
            </div>

            <div className="card stack-sm">
              <strong>Static Analysis & Type Consistency</strong>
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                Verify strict TypeScript types and module boundaries across client, shared, and server.
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  runCommandWithConsent({
                    label: 'Run TypeScript Static Analysis',
                    command: 'npx tsc --noEmit',
                    category: 'scan',
                  })
                }
              >
                <Play size={12} /> Run Static Typecheck
              </button>
            </div>

            <div className="card stack-sm">
              <strong>Software Bill of Materials (SBOM)</strong>
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                Export CycloneDX 1.5 inventory with package URLs (`purl`) and license identifiers.
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={exportSbom}>
                <Download size={13} /> Export CycloneDX 1.5 JSON
              </button>
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Secret Scan Findings (Matched Tokens Auto-Masked)</h3>
            {!scanSummary || scanSummary.findings.length === 0 ? (
              <div className="card-elevated" style={{ color: 'var(--success)' }}>
                Zero hardcoded credentials, private keys, or API tokens detected across {scanSummary?.scannedFiles || 0} workspace files.
              </div>
            ) : (
              scanSummary.findings.map((f) => (
                <div key={f.id} className="card-elevated flex-between">
                  <div>
                    <span className="badge badge-danger">{f.severity.toUpperCase()}</span>{' '}
                    <strong>{f.ruleName}</strong> —{' '}
                    <span className="mono">
                      {f.file}:{f.line}
                    </span>
                    <div className="mono muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                      {f.redactedSnippet}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => openFileInEditor(f.file, f.line)}
                  >
                    Inspect File
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card stack-sm">
          <div className="flex-between">
            <div className="flex-row">
              <h3 style={{ margin: 0 }}>Structured Workbench Event Logs</h3>
              <label className="flex-row" style={{ fontSize: '0.83rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={liveTail}
                  onChange={(e) => setLiveTail(e.target.checked)}
                />
                Live Tail (2s)
              </label>
            </div>

            <div className="flex-row">
              <select
                className="select"
                style={{ width: 130 }}
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
              >
                <option value="ALL">All Levels</option>
                <option value="INFO">INFO</option>
                <option value="SECURITY">SECURITY</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
              </select>
              <input
                className="input"
                style={{ width: 200 }}
                placeholder="Filter module or message..."
                value={logQuery}
                onChange={(e) => setLogQuery(e.target.value)}
              />
              <button type="button" className="btn btn-sm" onClick={clearServerLogs}>
                <Trash2 size={13} /> Clear Logs
              </button>
            </div>
          </div>

          <div className="card-elevated mono" style={{ maxHeight: '55vh', overflowY: 'auto', fontSize: '0.8rem' }}>
            {filteredLogs.map((l) => (
              <div key={l.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="muted">[{l.timestamp}]</span>{' '}
                <span
                  className={`badge ${
                    l.level === 'ERROR'
                      ? 'badge-danger'
                      : l.level === 'WARN'
                        ? 'badge-warn'
                        : l.level === 'SECURITY'
                          ? 'badge-accent'
                          : ''
                  }`}
                >
                  {l.level}
                </span>{' '}
                <strong>({l.module})</strong> {l.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'resources' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>Host CPU, Memory & Process Monitor</h3>
              <button type="button" className="btn btn-sm" onClick={fetchResources}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
            {sysSnap && (
              <>
                <div className="card-elevated">
                  <div>
                    <strong>CPU:</strong> {sysSnap.cpuCount}x {sysSnap.cpuModel}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <strong>Memory:</strong> {sysSnap.memory.usedMb} MB / {sysSnap.memory.totalMb} MB (
                    {sysSnap.memory.percentUsed}%)
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>PID</th>
                      <th>Process</th>
                      <th>Mem</th>
                      <th>Command (Redacted)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sysSnap.processes.slice(0, 10).map((p) => (
                      <tr key={p.pid}>
                        <td className="mono">{p.pid}</td>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td className="mono">{p.mem}</td>
                        <td className="mono muted" style={{ fontSize: '0.75rem' }}>
                          {p.command}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>Folder & Build-Cache Size Analyzer</h3>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => triggerScanJob('disk-cache-scan')}
              >
                Re-Scan Disk
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Directory</th>
                  <th>Category</th>
                  <th>Files</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {dirs.map((d) => (
                  <tr key={d.name}>
                    <td className="mono">
                      <strong>{d.name}/</strong>
                    </td>
                    <td>
                      <span className={`badge ${d.reclaimable ? 'badge-warn' : ''}`}>
                        {d.category}
                      </span>
                    </td>
                    <td className="mono">{d.fileCount}</td>
                    <td className="mono">{(d.bytes / 1024 / 1024).toFixed(2)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'diagnostics' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Error-Linked Windows Troubleshooting Guides</h3>
            <input
              className="input"
              placeholder="Search error code (MSB3644, LNK1104, 0x800B0109, WebView2, DPI)..."
              value={guideFilter}
              onChange={(e) => setGuideFilter(e.target.value)}
            />
            {TROUBLESHOOTING_GUIDES.filter(
              (g) =>
                !guideFilter ||
                g.errorPattern.toLowerCase().includes(guideFilter.toLowerCase()) ||
                g.title.toLowerCase().includes(guideFilter.toLowerCase())
            ).map((g) => (
              <div key={g.id} className="card-elevated stack-sm">
                <div className="flex-between">
                  <strong style={{ color: 'var(--accent)' }}>{g.errorPattern}</strong>
                  <span className="badge">{g.ecosystem}</span>
                </div>
                <div>
                  <strong>{g.title}</strong>
                </div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {g.symptoms}
                </div>
                <ol style={{ margin: '2px 0 0 18px', padding: 0, fontSize: '0.81rem' }}>
                  {g.resolutionSteps.map((st, idx) => (
                    <li key={idx}>{st}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>Copyable Redacted Diagnostic Bundle</h3>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => copySafeText('Redacted Diagnostic Bundle', diagBundle, true)}
              >
                <ClipboardCopy size={13} /> Copy Sanitized Bundle
              </button>
            </div>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Tokens, passwords, private keys, email addresses, and personal home directory usernames are automatically scrubbed before copying.
            </div>
            <pre
              className="card-elevated mono"
              style={{ margin: 0, maxHeight: '52vh', overflowY: 'auto', fontSize: '0.78rem', whiteSpace: 'pre-wrap' }}
            >
              {diagBundle}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityModule;
