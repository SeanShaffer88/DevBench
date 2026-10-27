import React, { useMemo, useState } from 'react';
import { DEBUGGER_ADAPTERS } from '../../shared/catalog/ecosystems';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

interface BreakpointItem {
  id: string;
  file: string;
  line: number;
  condition: string;
  enabled: boolean;
}

interface InspectorSnapshot {
  protocol: string;
  nodePid: number;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  heapUsedMB: number;
  heapTotalMB: number;
  heapLimitMB: number;
  watches: { expression: string; value: string; type: string; error?: string }[];
  callStack: { functionName: string; file: string; line: number; column: number }[];
  heapSpaces: { spaceName: string; usedKB: number; availableKB: number }[];
}

interface ParsedMinidump {
  valid: boolean;
  signature: string;
  versionHex: string;
  streamCount: number;
  timestampIso: string;
  fileSizeBytes: number;
  streams: { streamType: number; streamName: string; dataSize: number; rva: number }[];
  systemInfo?: {
    architecture: string;
    osBuild: string;
    numberOfProcessors: number;
  };
  exception?: {
    threadId: number;
    exceptionCodeHex: string;
    exceptionName: string;
    exceptionAddressHex: string;
  };
  modules: { name: string; baseAddressHex: string; sizeBytes: number }[];
  error?: string;
}

export const DebugModule: React.FC = () => {
  const { activeProject, hostPlatform, runCommandWithConsent } = useWorkbench();

  const [breakpoints, setBreakpoints] = useState<BreakpointItem[]>([
    { id: 'bp-1', file: 'src/MainWindow.cpp', line: 42, condition: 'dpiScale > 1.5', enabled: true },
    { id: 'bp-2', file: 'server/index.ts', line: 109, condition: '', enabled: true },
  ]);
  const [bpFile, setBpFile] = useState('src/App.tsx');
  const [bpLine, setBpLine] = useState('72');
  const [bpCond, setBpCond] = useState('');
  const [watchInput, setWatchInput] = useState(
    "process.version\nprocess.platform + '/' + process.arch\nMath.round(process.memoryUsage().rss / 1048576) + ' MB RSS'"
  );
  const [inspectorSnap, setInspectorSnap] = useState<InspectorSnapshot | null>(null);
  const [inspectorBusy, setInspectorBusy] = useState(false);

  const [dmpArch, setDmpArch] = useState<'x64' | 'ARM64'>('x64');
  const [dmpExceptionCode, setDmpExceptionCode] = useState<number>(0xc0000005);
  const [dmpPath, setDmpPath] = useState('.devbench/crashdumps/sample-crash.dmp');
  const [parsedDump, setParsedDump] = useState<ParsedMinidump | null>(null);
  const [dmpStatus, setDmpStatus] = useState('');

  const debuggerAdapters = useMemo(
    () => [
      ...DEBUGGER_ADAPTERS.filter((d) => d.compatibleLanguages.includes(activeProject.language)),
      ...DEBUGGER_ADAPTERS.filter((d) => !d.compatibleLanguages.includes(activeProject.language)),
    ],
    [activeProject.language]
  );

  const runLiveInspector = async () => {
    setInspectorBusy(true);
    try {
      const expressions = watchInput
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/debug/inspector-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expressions }),
      });
      const data = await res.json();
      if (res.ok) setInspectorSnap(data);
    } finally {
      setInspectorBusy(false);
    }
  };

  const generateSampleMinidump = async () => {
    setDmpStatus('Generating binary MDMP crash dump...');
    const res = await fetch('/api/debug/minidump/sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arch: dmpArch, exceptionCode: dmpExceptionCode }),
    });
    const data = await res.json();
    if (res.ok && data.parsed) {
      setDmpPath(data.savedPath);
      setParsedDump(data.parsed);
      setDmpStatus(`Wrote & parsed ${data.savedPath} (${data.parsed.fileSizeBytes} bytes)`);
    } else {
      setDmpStatus(data.error || 'Failed to generate sample minidump.');
    }
  };

  const parseExistingMinidump = async () => {
    setDmpStatus(`Parsing ${dmpPath}...`);
    const res = await fetch('/api/debug/minidump/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dmpPath }),
    });
    const data = await res.json();
    if (res.ok && data.parsed) {
      setParsedDump(data.parsed);
      setDmpStatus(
        data.parsed.valid
          ? `Parsed ${dmpPath} (${data.parsed.streamCount} MDMP streams)`
          : data.parsed.error || 'Invalid MDMP header'
      );
    } else {
      setDmpStatus(data.error || 'Failed to read .dmp file.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <RelevanceBanner subtitle="Live V8 Inspector / DAP watch & heap session bridge, binary Windows Minidump (.dmp) crash analyzer & breakpoints" />
      <div className="section-header">
        <div>
          <h1 className="section-title">Debug, Live V8 Inspector & Windows Crash Minidumps</h1>
          <p className="section-subtitle">
            Project-aware debugger adapters, live <code>node:inspector</code> watch/heap/stack
            sessions, and binary Windows Minidump (<code>MDMP</code> / <code>.dmp</code>) stream
            inspection.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runLiveInspector()}
            disabled={inspectorBusy}
          >
            {inspectorBusy ? 'Inspecting V8...' : 'Evaluate Live V8 Inspector Session'}
          </button>
          <button type="button" className="btn" onClick={() => void generateSampleMinidump()}>
            Synthesize & Parse .dmp
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Live V8 Inspector / DAP Session Bridge</h2>
            <span className="badge badge-success">node:inspector</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
            Evaluates real expressions via <code>Runtime.evaluate</code> on an attached V8
            inspector session with secret redaction, heap space telemetry, and live stack frames.
          </p>
          <label className="field-label" htmlFor="dap-watch-input">
            Watch Expressions (one per line)
          </label>
          <textarea
            id="dap-watch-input"
            className="textarea mono"
            style={{ minHeight: 74, marginBottom: 8 }}
            value={watchInput}
            onChange={(e) => setWatchInput(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void runLiveInspector()}
            disabled={inspectorBusy}
          >
            Evaluate Expressions & Capture Heap
          </button>

          {inspectorSnap && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="badge badge-accent">PID {inspectorSnap.nodePid}</span>
                <span className="badge badge-muted">
                  Heap: {inspectorSnap.heapUsedMB} / {inspectorSnap.heapTotalMB} MB (Limit{' '}
                  {inspectorSnap.heapLimitMB} MB)
                </span>
                <span className="badge badge-muted">Uptime: {inspectorSnap.uptimeSeconds}s</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Expression</th>
                    <th>Type</th>
                    <th>Evaluated Result</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectorSnap.watches.map((w, idx) => (
                    <tr key={`${w.expression}-${idx}`}>
                      <td className="mono">{w.expression}</td>
                      <td>
                        <span className="badge badge-muted">{w.type}</span>
                      </td>
                      <td className="mono" style={{ color: w.error ? 'var(--danger)' : undefined }}>
                        {w.error || w.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                <strong>Captured Call Stack ({inspectorSnap.callStack.length} frames):</strong>{' '}
                {inspectorSnap.callStack
                  .slice(0, 3)
                  .map((f) => `${f.functionName} (${f.file}:${f.line})`)
                  .join(' → ')}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Binary Windows Minidump (MDMP / .dmp) Parser</h2>
            <span className="badge badge-warning">DbgHelp Stream Reader</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
            Parses binary <code>MDMP</code> headers, <code>SystemInfoStream</code>,{' '}
            <code>ExceptionStream</code> fault codes, and loaded PE/DLL module base addresses
            without requiring WinDbg on Linux/macOS CI hosts.
          </p>
          <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <select
              aria-label="Minidump architecture"
              className="select"
              style={{ width: 105 }}
              value={dmpArch}
              onChange={(e) => setDmpArch(e.target.value as 'x64' | 'ARM64')}
            >
              <option value="x64">Win11 x64</option>
              <option value="ARM64">Win11 ARM64</option>
            </select>
            <select
              aria-label="Minidump exception code"
              className="select"
              style={{ flex: 1, minWidth: 190 }}
              value={dmpExceptionCode}
              onChange={(e) => setDmpExceptionCode(Number(e.target.value))}
            >
              <option value={0xc0000005}>0xC0000005 (STATUS_ACCESS_VIOLATION)</option>
              <option value={0xc0000409}>0xC0000409 (STATUS_STACK_BUFFER_OVERRUN)</option>
              <option value={0xe0434352}>0xE0434352 (CLR_MANAGED_EXCEPTION)</option>
            </select>
            <button type="button" className="btn btn-sm" onClick={() => void generateSampleMinidump()}>
              Generate Sample .dmp
            </button>
          </div>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <input
              aria-label="Workspace minidump file path"
              className="input mono"
              value={dmpPath}
              onChange={(e) => setDmpPath(e.target.value)}
              placeholder=".devbench/crashdumps/sample-crash.dmp"
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void parseExistingMinidump()}
            >
              Parse .dmp
            </button>
          </div>
          {dmpStatus && (
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {dmpStatus}
            </div>
          )}

          {parsedDump && parsedDump.valid && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="badge badge-success">Sig: {parsedDump.signature}</span>
                {parsedDump.systemInfo && (
                  <span className="badge badge-accent">
                    {parsedDump.systemInfo.architecture} · {parsedDump.systemInfo.osBuild} (
                    {parsedDump.systemInfo.numberOfProcessors} cores)
                  </span>
                )}
                {parsedDump.exception && (
                  <span className="badge badge-danger">
                    {parsedDump.exception.exceptionCodeHex} ({parsedDump.exception.exceptionName}) @{' '}
                    {parsedDump.exception.exceptionAddressHex}
                  </span>
                )}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Loaded Module (PE/DLL)</th>
                    <th>Base Address</th>
                    <th>Image Size</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedDump.modules.map((m) => (
                    <tr key={m.name}>
                      <td className="mono">{m.name}</td>
                      <td className="mono">{m.baseAddressHex}</td>
                      <td>{Math.round(m.sizeBytes / 1024)} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Project Debugger Adapters</h2>
            <span className="badge badge-accent">{debuggerAdapters.length} configured</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {debuggerAdapters.slice(0, 6).map((dbg) => (
              <div
                key={dbg.id}
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                }}
              >
                <div className="row-between">
                  <strong style={{ fontSize: 13 }}>{dbg.name}</strong>
                  <span className="badge badge-success">{dbg.protocol}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  <strong>Binary:</strong> <code>{dbg.binary}</code> · Minidump:{' '}
                  {dbg.supportsMinidump ? 'Yes' : 'No'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {dbg.summary}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                runCommandWithConsent({
                  label: 'List Running Processes for Debugger Attach',
                  command:
                    hostPlatform === 'win32'
                      ? 'tasklist /FO TABLE'
                      : 'ps -eo pid,comm,%cpu,%mem --sort=-%mem | head -n 20',
                  category: 'scan',
                })
              }
            >
              Inspect Attachable Processes
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Breakpoints & Conditional Triggers</h2>
            <span className="badge badge-muted">
              {breakpoints.filter((b) => b.enabled).length} active
            </span>
          </div>
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            <input
              aria-label="Breakpoint file"
              className="input mono"
              value={bpFile}
              onChange={(e) => setBpFile(e.target.value)}
              placeholder="File path"
            />
            <input
              aria-label="Breakpoint line"
              className="input mono"
              style={{ width: 76 }}
              value={bpLine}
              onChange={(e) => setBpLine(e.target.value)}
              placeholder="Line"
            />
            <input
              aria-label="Breakpoint condition"
              className="input mono"
              value={bpCond}
              onChange={(e) => setBpCond(e.target.value)}
              placeholder="Optional condition"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (!bpFile.trim()) return;
                setBreakpoints((prev) => [
                  ...prev,
                  {
                    id: `bp-${Date.now()}`,
                    file: bpFile.trim(),
                    line: Number(bpLine) || 1,
                    condition: bpCond.trim(),
                    enabled: true,
                  },
                ]);
                setBpCond('');
              }}
            >
              Add
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>On</th>
                <th>Location</th>
                <th>Condition</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {breakpoints.map((bp) => (
                <tr key={bp.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Enable breakpoint ${bp.file}:${bp.line}`}
                      checked={bp.enabled}
                      onChange={() =>
                        setBreakpoints((prev) =>
                          prev.map((x) => (x.id === bp.id ? { ...x, enabled: !x.enabled } : x))
                        )
                      }
                    />
                  </td>
                  <td className="mono">
                    {bp.file}:{bp.line}
                  </td>
                  <td className="mono">{bp.condition || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setBreakpoints((prev) => prev.filter((x) => x.id !== bp.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DebugModule;

