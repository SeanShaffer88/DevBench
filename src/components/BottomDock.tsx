import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  History,
  Play,
  Search,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { extractDiagnosticsFromLines, parseDiagnosticLine } from '../../shared/diagnosticParser';
import { useWorkbench } from '../context/WorkbenchContext';

const SHELL_PROFILES = [
  { id: 'pwsh', name: 'PowerShell 7 (pwsh)', initCmd: 'pwsh -NoLogo', platform: 'Windows / Cross-Platform' },
  { id: 'winps', name: 'Windows PowerShell 5.1', initCmd: 'powershell.exe -NoLogo', platform: 'Windows Built-in' },
  { id: 'cmd', name: 'Command Prompt (cmd.exe)', initCmd: 'cmd.exe /k', platform: 'Windows Built-in' },
  {
    id: 'vsdevcmd',
    name: 'VS 2022 Developer Prompt (x64)',
    initCmd: '"%ProgramFiles%\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\VsDevCmd.bat" -arch=x64',
    platform: 'MSVC / Windows SDK',
  },
  { id: 'git-bash', name: 'Git Bash (MSYS2)', initCmd: 'bash --login -i', platform: 'Git for Windows' },
  { id: 'wsl', name: 'WSL 2 (Default Linux Distro)', initCmd: 'wsl.exe ~', platform: 'Windows Subsystem for Linux' },
];

const QUICK_COMMANDS = [
  'npx tsc --noEmit',
  'npm test',
  'git status --short',
  'node -v',
];

export const BottomDock: React.FC = () => {
  const {
    dockOpen,
    setDockOpen,
    outputLines,
    clearOutput,
    jobs,
    cancelJobById,
    openFileInEditor,
    runCommandWithConsent,
    activeProject,
    projects,
    settings,
  } = useWorkbench();

  const [tab, setTab] = useState<'jobs' | 'problems' | 'output' | 'shells'>('jobs');
  const [filter, setFilter] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Interactive Shell & Command History state
  const [selectedShell, setSelectedShell] = useState<string>(settings.preferredShell || 'pwsh');
  const [selectedCwd, setSelectedCwd] = useState<string>('.');
  const [injectProjectEnv, setInjectProjectEnv] = useState<boolean>(true);
  const [customCmd, setCustomCmd] = useState('npx tsc --noEmit');
  const [cmdHistory, setCmdHistory] = useState<string[]>([
    'npx tsc --noEmit',
    'npm test',
    'git status --short',
  ]);
  const [historyCursor, setHistoryCursor] = useState<number>(-1);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  const allJobLogLines = useMemo(() => {
    const out: string[] = [...outputLines];
    for (const j of jobs) {
      for (const l of j.logs) {
        out.push(`[${j.name}] ${l}`);
      }
    }
    return out;
  }, [jobs, outputLines]);

  const parsedDiagnostics = useMemo(
    () => extractDiagnosticsFromLines(allJobLogLines),
    [allJobLogLines]
  );

  if (!dockOpen) return null;

  const renderClickableLine = (line: string, idx: number) => {
    const diag = parseDiagnosticLine(line);
    if (!diag) {
      return (
        <div key={idx} style={{ padding: '2px 0' }}>
          {line}
        </div>
      );
    }
    return (
      <div
        key={idx}
        className="flex-row"
        style={{ padding: '2px 0', flexWrap: 'wrap', gap: 6 }}
      >
        <span>{line}</span>
        <button
          type="button"
          className="btn btn-sm"
          style={{ padding: '1px 6px', fontSize: '0.73rem' }}
          onClick={() => openFileInEditor(diag.file, diag.line)}
        >
          <ExternalLink size={11} /> Jump to {diag.file}:{diag.line}
          {diag.column ? `:${diag.column}` : ''}
        </button>
      </div>
    );
  };

  const combinedLines = [
    ...outputLines,
    ...(selectedJob ? selectedJob.logs.map((l) => `[${selectedJob.name}] ${l}`) : []),
  ].filter((l) => !filter || l.toLowerCase().includes(filter.toLowerCase()));

  const workspaceCwdOptions = [
    '.',
    ...projects
      .map((p) => p.path)
      .filter((p) => p.startsWith('workspaces/')),
  ];

  const submitShellCommand = (cmdToRun?: string) => {
    const cmd = (cmdToRun ?? customCmd).trim();
    if (!cmd) return;

    setCmdHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 20));
    setHistoryCursor(-1);

    const envOverrides: Record<string, string> = {};
    if (injectProjectEnv) {
      for (const ev of activeProject.envVars) {
        if (!ev.isSecretRef && !ev.value.startsWith('vault://')) {
          envOverrides[ev.key] = ev.value;
        }
      }
    }

    runCommandWithConsent({
      label: `Shell (${selectedShell}) @ ${selectedCwd}`,
      command: cmd,
      category: 'build',
      cwd: selectedCwd,
      shellProfile: selectedShell,
      envOverrides,
    });
  };

  const handleShellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && cmdHistory.length > 0) {
      e.preventDefault();
      const nextIdx = Math.min(historyCursor + 1, cmdHistory.length - 1);
      setHistoryCursor(nextIdx);
      setCustomCmd(cmdHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyCursor <= 0) {
        setHistoryCursor(-1);
        setCustomCmd('');
      } else {
        const nextIdx = historyCursor - 1;
        setHistoryCursor(nextIdx);
        setCustomCmd(cmdHistory[nextIdx]);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitShellCommand();
    }
  };

  return (
    <section className="wb-dock" aria-label="Unified Output, Compiler Problems, Background Jobs, and Interactive Shell">
      <div className="wb-dock-header">
        <div className="flex-row">
          <button
            type="button"
            className={`subtab ${tab === 'jobs' ? 'active' : ''}`}
            onClick={() => setTab('jobs')}
          >
            Background Jobs ({jobs.length})
          </button>
          <button
            type="button"
            className={`subtab ${tab === 'problems' ? 'active' : ''}`}
            onClick={() => setTab('problems')}
          >
            <AlertCircle size={13} /> Problems ({parsedDiagnostics.length})
          </button>
          <button
            type="button"
            className={`subtab ${tab === 'output' ? 'active' : ''}`}
            onClick={() => setTab('output')}
          >
            Unified Output ({combinedLines.length})
          </button>
          <button
            type="button"
            className={`subtab ${tab === 'shells' ? 'active' : ''}`}
            onClick={() => setTab('shells')}
          >
            <Terminal size={13} /> Interactive Shell & History
          </button>
        </div>

        <div className="flex-row">
          {tab === 'output' && (
            <>
              <div className="flex-row">
                <Search size={13} className="muted" />
                <input
                  className="input"
                  style={{ width: 180, padding: '3px 7px', fontSize: '0.8rem' }}
                  placeholder="Filter logs or errors..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-sm" onClick={clearOutput} title="Clear Output">
                <Trash2 size={13} /> Clear
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setDockOpen(false)}
            aria-label="Close Bottom Dock"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="wb-dock-body">
        {tab === 'output' && (
          <div>
            {combinedLines.length === 0 ? (
              <div className="muted">No matching output lines.</div>
            ) : (
              combinedLines.map((line, i) => renderClickableLine(line, i))
            )}
          </div>
        )}

        {tab === 'problems' && (
          <div className="stack-sm">
            {parsedDiagnostics.length === 0 ? (
              <div className="muted">
                Zero compiler errors or warnings detected in recent job logs (supports MSBuild/C#/VB/F#, MSVC, TypeScript, Rust, Python, Go, Clang/Swift).
              </div>
            ) : (
              parsedDiagnostics.map((d, idx) => (
                <div
                  key={`${d.file}-${d.line}-${idx}`}
                  className="card-elevated flex-between"
                  style={{ padding: '6px 10px' }}
                >
                  <div>
                    <span
                      className={`badge ${
                        d.severity === 'error'
                          ? 'badge-danger'
                          : d.severity === 'warning'
                            ? 'badge-warn'
                            : 'badge-accent'
                      }`}
                    >
                      {d.severity.toUpperCase()}
                    </span>{' '}
                    {d.code && <span className="badge mono">{d.code}</span>}{' '}
                    <strong className="mono">
                      {d.file}:{d.line}
                      {d.column ? `:${d.column}` : ''}
                    </strong>{' '}
                    — <span>{d.message}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => openFileInEditor(d.file, d.line)}
                  >
                    Open in Code
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'jobs' && (
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="stack-sm">
              {jobs.length === 0 ? (
                <div className="muted">
                  No background scans or tasks executed yet. Start a scan in Security/Packages or run a task in Build & Run.
                </div>
              ) : (
                jobs.map((job) => (
                  <div
                    key={job.id}
                    className="card-elevated flex-between"
                    style={{
                      padding: '7px 10px',
                      cursor: 'pointer',
                      borderColor: selectedJob?.id === job.id ? 'var(--accent)' : undefined,
                    }}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex-row">
                        <strong>{job.name}</strong>
                        <span
                          className={`badge ${
                            job.status === 'completed'
                              ? 'badge-success'
                              : job.status === 'running'
                                ? 'badge-accent'
                                : job.status === 'cancelled'
                                  ? 'badge-warn'
                                  : 'badge-danger'
                          }`}
                        >
                          {job.status} ({job.progress}%)
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                        {job.detail}
                      </div>
                      {job.status === 'running' && (
                        <div
                          style={{
                            height: 4,
                            background: 'var(--border-subtle)',
                            borderRadius: 2,
                            marginTop: 5,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${job.progress}%`,
                              height: '100%',
                              background: 'var(--accent)',
                            }}
                          />
                        </div>
                      )}
                    </div>
                    {job.status === 'running' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelJobById(job.id);
                        }}
                      >
                        <Square size={12} /> Cancel
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="card-elevated" style={{ maxHeight: 145, overflowY: 'auto' }}>
              <div className="muted" style={{ fontSize: '0.76rem', marginBottom: 4 }}>
                {selectedJob ? `Job Logs — ${selectedJob.name}` : 'Select a job to inspect output'}
              </div>
              {selectedJob?.logs.map((l, i) => renderClickableLine(l, i))}
            </div>
          </div>
        )}

        {tab === 'shells' && (
          <div className="stack-sm">
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <select
                className="select"
                style={{ width: 205, fontSize: '0.8rem' }}
                value={selectedShell}
                onChange={(e) => setSelectedShell(e.target.value)}
                aria-label="Shell Profile"
              >
                {SHELL_PROFILES.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>

              <select
                className="select mono"
                style={{ width: 215, fontSize: '0.8rem' }}
                value={selectedCwd}
                onChange={(e) => setSelectedCwd(e.target.value)}
                aria-label="Working Directory"
              >
                {workspaceCwdOptions.map((c) => (
                  <option key={c} value={c}>
                    cwd: {c}
                  </option>
                ))}
              </select>

              <label className="flex-row" style={{ fontSize: '0.79rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={injectProjectEnv}
                  onChange={(e) => setInjectProjectEnv(e.target.checked)}
                />
                <span>Inject {activeProject.name} Env</span>
              </label>

              <div className="flex-row" style={{ flex: 1, minWidth: 260 }}>
                <input
                  className="input mono"
                  value={customCmd}
                  onChange={(e) => setCustomCmd(e.target.value)}
                  onKeyDown={handleShellKeyDown}
                  placeholder="Enter command (Up/Down for history, consent-gated)..."
                  aria-label="Consented Shell Command Input"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => submitShellCommand()}
                >
                  <Play size={12} /> Run
                </button>
              </div>
            </div>

            <div className="flex-between" style={{ flexWrap: 'wrap', gap: 6 }}>
              <div className="flex-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  Quick Presets:
                </span>
                {QUICK_COMMANDS.map((qc) => (
                  <button
                    key={qc}
                    type="button"
                    className="btn btn-sm mono"
                    style={{ fontSize: '0.73rem', padding: '1px 7px' }}
                    onClick={() => setCustomCmd(qc)}
                  >
                    {qc}
                  </button>
                ))}
              </div>

              <div className="flex-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                <span className="muted flex-row" style={{ fontSize: '0.75rem' }}>
                  <History size={12} /> History:
                </span>
                {cmdHistory.slice(0, 4).map((hc) => (
                  <button
                    key={hc}
                    type="button"
                    className="btn btn-sm mono"
                    style={{ fontSize: '0.73rem', padding: '1px 7px' }}
                    onClick={() => setCustomCmd(hc)}
                  >
                    {hc}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
