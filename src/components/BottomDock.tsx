import React, { useState } from 'react';
import { Play, Search, Square, Terminal, Trash2, X } from 'lucide-react';
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
    settings,
  } = useWorkbench();

  const [tab, setTab] = useState<'output' | 'jobs' | 'shells'>('jobs');
  const [filter, setFilter] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [customCmd, setCustomCmd] = useState('npx tsc --noEmit');

  if (!dockOpen) return null;

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  const renderClickableLine = (line: string, idx: number) => {
    const fileMatch = line.match(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|cs|cpp|rs|py|json|manifest))(?::|\()(\d+)/);
    if (!fileMatch) {
      return (
        <div key={idx} style={{ padding: '2px 0' }}>
          {line}
        </div>
      );
    }
    const [, filePath, lineNum] = fileMatch;
    return (
      <div key={idx} style={{ padding: '2px 0' }}>
        <span>{line} </span>
        <button
          type="button"
          className="btn btn-sm"
          style={{ padding: '1px 6px', fontSize: '0.75rem', marginLeft: 6 }}
          onClick={() => openFileInEditor(filePath, Number(lineNum))}
        >
          Open {filePath}:{lineNum}
        </button>
      </div>
    );
  };

  const combinedLines = [
    ...outputLines,
    ...(selectedJob ? selectedJob.logs.map((l) => `[${selectedJob.name}] ${l}`) : []),
  ].filter((l) => !filter || l.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="wb-dock" aria-label="Unified Output, Background Jobs, and Shell Profiles">
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
            <Terminal size={13} /> Shell Profiles
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
            <div className="flex-between">
              <div>
                <strong>Configured Terminal Profiles</strong>{' '}
                <span className="muted">(Default: {settings.preferredShell})</span>
              </div>
              <div className="flex-row" style={{ minWidth: 360 }}>
                <input
                  className="input mono"
                  value={customCmd}
                  onChange={(e) => setCustomCmd(e.target.value)}
                  placeholder="Enter command to run with explicit approval..."
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    runCommandWithConsent({
                      label: `Shell Command (${settings.preferredShell})`,
                      command: customCmd,
                      category: 'build',
                    })
                  }
                >
                  <Play size={12} /> Run
                </button>
              </div>
            </div>
            <div className="grid-3">
              {SHELL_PROFILES.map((sp) => (
                <div key={sp.id} className="card-elevated" style={{ padding: '6px 10px' }}>
                  <div className="flex-between">
                    <strong>{sp.name}</strong>
                    <span className="badge" style={{ fontSize: '0.7rem' }}>
                      {sp.platform}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: '0.76rem', marginTop: 2 }}>
                    {sp.initCmd}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
