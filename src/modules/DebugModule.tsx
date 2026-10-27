import React, { useEffect, useState } from 'react';
import { Activity, Bug, Cpu, FileWarning, Link2, Plus, Trash2 } from 'lucide-react';
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

export const DebugModule: React.FC = () => {
  const { activeProject, relevantFirst, openFileInEditor, copySafeText, notify } = useWorkbench();

  const [breakpoints, setBreakpoints] = useState<BreakpointItem[]>([
    {
      id: 'bp-1',
      file: 'server/services/systemDiagnostics.ts',
      line: 147,
      condition: 'checks.some(c => c.status === "fail")',
      enabled: true,
    },
    {
      id: 'bp-2',
      file: 'shared/redaction.ts',
      line: 42,
      condition: 'redactPersonalPaths === true',
      enabled: true,
    },
  ]);
  const [bpFile, setBpFile] = useState('server/index.ts');
  const [bpLine, setBpLine] = useState('84');
  const [bpCond, setBpCond] = useState('');

  const [watches, setWatches] = useState<string[]>([
    'activeProject.targetArchitectures',
    'window.devicePixelRatio * 96',
    'process.memoryUsage().heapUsed',
  ]);
  const [newWatch, setNewWatch] = useState('');

  const [processes, setProcesses] = useState<{ pid: string; name: string; mem: string; command: string }[]>([]);
  const [attachedPid, setAttachedPid] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/system/snapshot')
      .then((r) => r.json())
      .then((d) => setProcesses(d.processes || []))
      .catch(() => {});
  }, []);

  const activeDbg =
    DEBUGGER_ADAPTERS.find((d) => d.id === activeProject.debuggerId) || DEBUGGER_ADAPTERS[0];

  const visibleAdapters = relevantFirst
    ? DEBUGGER_ADAPTERS.filter((d) => d.compatibleLanguages.includes(activeProject.language))
    : DEBUGGER_ADAPTERS;

  const addBreakpoint = (e: React.FormEvent) => {
    e.preventDefault();
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
    notify('Added conditional breakpoint.');
  };

  const dapLaunchJson = JSON.stringify(
    {
      version: '0.2.0',
      configurations: [
        {
          name: `Debug ${activeProject.name} (${activeDbg.protocol})`,
          type: activeDbg.id,
          request: attachedPid ? 'attach' : 'launch',
          processId: attachedPid ? Number(attachedPid) : undefined,
          cwd: activeProject.path,
          stopOnEntry: false,
        },
      ],
    },
    null,
    2
  );

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="DAP/Native debugger adapters, breakpoints, watches, process attach, crash dumps & profiling" />

      <div className="grid-2">
        {/* Breakpoints & Watches */}
        <div className="card stack-sm">
          <div className="flex-between">
            <h3 style={{ margin: 0 }}>
              <Bug size={16} /> Breakpoints & Watch Expressions ({activeDbg.name})
            </h3>
            <span className="badge badge-accent">{activeDbg.protocol}</span>
          </div>

          <form onSubmit={addBreakpoint} className="flex-row">
            <input
              className="input mono"
              placeholder="File path..."
              value={bpFile}
              onChange={(e) => setBpFile(e.target.value)}
              required
            />
            <input
              className="input mono"
              style={{ width: 78 }}
              type="number"
              min={1}
              value={bpLine}
              onChange={(e) => setBpLine(e.target.value)}
              required
            />
            <input
              className="input mono"
              placeholder="Optional condition..."
              value={bpCond}
              onChange={(e) => setBpCond(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary">
              <Plus size={13} /> Add
            </button>
          </form>

          <div className="stack-sm">
            {breakpoints.map((bp) => (
              <div key={bp.id} className="card-elevated flex-between">
                <div className="flex-row">
                  <input
                    type="checkbox"
                    checked={bp.enabled}
                    onChange={() =>
                      setBreakpoints((prev) =>
                        prev.map((x) => (x.id === bp.id ? { ...x, enabled: !x.enabled } : x))
                      )
                    }
                  />
                  <div>
                    <button
                      type="button"
                      className="mono"
                      onClick={() => openFileInEditor(bp.file, bp.line)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--accent)',
                        cursor: 'pointer',
                      }}
                    >
                      {bp.file}:{bp.line}
                    </button>
                    {bp.condition && (
                      <div className="muted mono" style={{ fontSize: '0.76rem' }}>
                        when: {bp.condition}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setBreakpoints((prev) => prev.filter((x) => x.id !== bp.id))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />
          <strong>Watch Expressions & Call Stack Preview</strong>
          <div className="flex-row">
            <input
              className="input mono"
              placeholder="Add watch expression..."
              value={newWatch}
              onChange={(e) => setNewWatch(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                if (!newWatch.trim()) return;
                setWatches((prev) => [...prev, newWatch.trim()]);
                setNewWatch('');
              }}
            >
              Watch
            </button>
          </div>
          <div className="stack-sm">
            {watches.map((w, i) => (
              <div key={i} className="card-elevated flex-between mono" style={{ fontSize: '0.8rem' }}>
                <span>{w}</span>
                <span className="muted">(Evaluated when target paused)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Attach to Running Process & DAP Config */}
        <div className="card stack-sm">
          <div className="flex-between">
            <h3 style={{ margin: 0 }}>
              <Link2 size={16} /> Attach to Running Host Process
            </h3>
            {attachedPid && <span className="badge badge-success">Target PID: {attachedPid}</span>}
          </div>
          <div className="muted" style={{ fontSize: '0.83rem' }}>
            Select a live process to generate a DAP attach configuration (`launch.json`).
          </div>

          <div style={{ maxHeight: 200, overflowY: 'auto' }} className="stack-sm">
            {processes.slice(0, 12).map((p) => (
              <div key={p.pid} className="card-elevated flex-between" style={{ padding: '6px 10px' }}>
                <div>
                  <strong className="mono">
                    [{p.pid}] {p.name}
                  </strong>{' '}
                  <span className="badge">{p.mem}</span>
                  <div className="muted mono" style={{ fontSize: '0.75rem' }}>
                    {p.command}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${attachedPid === p.pid ? 'btn-primary' : ''}`}
                  onClick={() => {
                    setAttachedPid(p.pid);
                    notify(`Selected PID ${p.pid} (${p.name}) for debugger attach profile.`);
                  }}
                >
                  {attachedPid === p.pid ? 'Selected' : 'Select PID'}
                </button>
              </div>
            ))}
          </div>

          <div className="flex-between" style={{ marginTop: 4 }}>
            <strong style={{ fontSize: '0.86rem' }}>Generated DAP Launch / Attach Configuration</strong>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => copySafeText('launch.json', dapLaunchJson)}
            >
              Copy JSON
            </button>
          </div>
          <pre className="card-elevated mono" style={{ margin: 0, fontSize: '0.77rem', overflowX: 'auto' }}>
            {dapLaunchJson}
          </pre>
        </div>
      </div>

      {/* Crash Dump (.dmp) & Profiling Diagnostics */}
      <div className="grid-2">
        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>
            <FileWarning size={16} /> Windows Crash Dump (`.dmp`) & WER Triage Helpers
          </h3>
          <div className="muted" style={{ fontSize: '0.83rem' }}>
            Inspect Windows Error Reporting (WER) local minidumps without manually hunting symbol server paths.
          </div>
          <div className="card-elevated mono" style={{ fontSize: '0.79rem' }}>
            <div>Local CrashDumps Folder: %LOCALAPPDATA%\CrashDumps</div>
            <div>Microsoft Symbol Server: srv*C:\Symbols*https://msdl.microsoft.com/download/symbols</div>
            <div>WinDbg Triage Command: cdb.exe -z CrashDump.dmp -c "!analyze -v; k; q"</div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              copySafeText(
                'WinDbg Minidump Triage Command',
                'cdb.exe -y "srv*C:\\Symbols*https://msdl.microsoft.com/download/symbols" -z "%LOCALAPPDATA%\\CrashDumps\\App.exe.dmp" -c "!analyze -v; ~*k; q"'
              )
            }
          >
            Copy CDB / WinDbg Auto-Analyze Command
          </button>
        </div>

        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>
            <Cpu size={16} /> Performance Profiling & Memory Diagnostics
          </h3>
          <div className="stack-sm">
            <div className="card-elevated flex-between">
              <div>
                <strong>Windows Performance Recorder (ETW CPU + UI Delay)</strong>
                <div className="mono muted" style={{ fontSize: '0.76rem' }}>
                  wpr.exe -start GeneralProfile -start CPU -filemode
                </div>
              </div>
              <Activity size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="card-elevated flex-between">
              <div>
                <strong>.NET Counters & Heap GCDump</strong>
                <div className="mono muted" style={{ fontSize: '0.76rem' }}>
                  dotnet-counters monitor -p &lt;PID&gt; &amp;&amp; dotnet-gcdump collect -p &lt;PID&gt;
                </div>
              </div>
              <Activity size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="card-elevated flex-between">
              <div>
                <strong>Node / Electron V8 Heap & CPU Profile</strong>
                <div className="mono muted" style={{ fontSize: '0.76rem' }}>
                  node --cpu-prof --heap-prof server/index.ts
                </div>
              </div>
              <Activity size={16} style={{ color: 'var(--accent)' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="card stack-sm">
        <h3 style={{ margin: 0 }}>Debugger Adapter Matrix ({visibleAdapters.length})</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Adapter</th>
              <th>Protocol</th>
              <th>Attach</th>
              <th>Minidump (.dmp)</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            {visibleAdapters.map((ad) => (
              <tr key={ad.id}>
                <td>
                  <strong>{ad.name}</strong>
                </td>
                <td>
                  <span className="badge">{ad.protocol}</span>
                </td>
                <td>{ad.supportsAttach ? 'Yes' : 'No'}</td>
                <td>{ad.supportsMinidump ? 'Yes' : 'No'}</td>
                <td className="muted">{ad.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DebugModule;
