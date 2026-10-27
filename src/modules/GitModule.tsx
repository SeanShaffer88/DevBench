import React, { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  FileDiff,
  GitBranch,
  GitCommit,
  History,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

interface GitOverviewData {
  isRepo: boolean;
  currentBranch: string;
  branchHeader: string;
  files: { path: string; indexStatus: string; workTreeStatus: string; summary: string }[];
  branches: string[];
  commits: { hash: string; author: string; relativeTime: string; subject: string }[];
  remotes: { name: string; detail: string }[];
  worktrees: string[];
  stashes: string[];
  hooks: { name: string; active: boolean }[];
}

export const GitModule: React.FC = () => {
  const { runCommandWithConsent, teamConfig, teamConfigTrusted, openFileInEditor } = useWorkbench();

  const [tab, setTab] = useState<'status' | 'history' | 'blame' | 'config'>('status');
  const [gitData, setGitData] = useState<GitOverviewData | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [diffText, setDiffText] = useState<string>('Loading diff...');
  const [blamePath, setBlamePath] = useState<string>('package.json');
  const [blameRows, setBlameRows] = useState<
    { line: number; commit: string; author: string; code: string }[]
  >([]);
  const [commitMsg, setCommitMsg] = useState<string>(
    'feat(workbench): update Windows SDK configuration'
  );

  const loadOverview = useCallback(async () => {
    const r = await fetch('/api/git/overview');
    const d = await r.json();
    setGitData(d);
    if (d.files?.length > 0 && !selectedFile) {
      setSelectedFile(d.files[0].path);
    }
  }, [selectedFile]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const q = selectedFile ? `?path=${encodeURIComponent(selectedFile)}` : '';
    fetch(`/api/git/diff${q}`)
      .then((r) => r.json())
      .then((d) => setDiffText(d.diff || 'No changes.'))
      .catch(() => {});
  }, [selectedFile]);

  const loadBlame = async (targetPath: string) => {
    const r = await fetch(`/api/git/blame?path=${encodeURIComponent(targetPath)}`);
    const d = await r.json();
    setBlameRows(d.rows || []);
  };

  useEffect(() => {
    if (tab === 'blame') {
      loadBlame(blamePath);
    }
  }, [tab, blamePath]);

  const applyTeamCommitTemplate = () => {
    const tpl =
      teamConfigTrusted && typeof teamConfig?.commitTemplate === 'string'
        ? teamConfig.commitTemplate
        : 'feat(module): concise summary\n\nWindows Targets Verified:\n- [ ] x64\n- [ ] ARM64';
    setCommitMsg(tpl);
  };

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Live Git status, visual diff, commit templates, history, blame, worktrees & CRLF rules" />

      <div className="card flex-between">
        <div className="flex-row">
          <GitBranch size={17} style={{ color: 'var(--accent)' }} />
          <strong>Branch:</strong>
          <span className="badge badge-accent mono">{gitData?.currentBranch || '...'}</span>
          <span className="badge">{gitData?.files.length || 0} Working Changes</span>
          <span className="badge">{gitData?.commits.length || 0} Recent Commits</span>
        </div>

        <div className="flex-row">
          <button type="button" className="btn btn-sm" onClick={loadOverview}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              runCommandWithConsent({
                label: 'Git Fetch Origin',
                command: 'git fetch origin',
                impactScope: 'Git Working Tree',
              })
            }
          >
            Fetch
          </button>
          <a
            href="https://github.com/SeanShaffer88/DevBench/pulls"
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <ExternalLink size={13} /> Pull Requests
          </a>
        </div>
      </div>

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'status' ? 'active' : ''}`}
          onClick={() => setTab('status')}
        >
          <FileDiff size={14} /> Working Status, Diff & Commit
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          <History size={14} /> Commit History, Stashes & Worktrees
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'blame' ? 'active' : ''}`}
          onClick={() => setTab('blame')}
        >
          <GitCommit size={14} /> File Blame Inspector
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'config' ? 'active' : ''}`}
          onClick={() => setTab('config')}
        >
          <ShieldCheck size={14} /> Windows `.gitattributes`, Hooks & Signing
        </button>
      </div>

      {tab === 'status' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
          <div className="card stack-sm">
            <strong>Changed & Untracked Files ({gitData?.files.length || 0})</strong>
            <div style={{ maxHeight: 260, overflowY: 'auto' }} className="stack-sm">
              {gitData?.files.length === 0 ? (
                <div className="muted" style={{ fontSize: '0.84rem' }}>
                  Working tree is clean.
                </div>
              ) : (
                gitData?.files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="card-elevated flex-between"
                    onClick={() => setSelectedFile(f.path)}
                    style={{
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '6px 9px',
                      borderColor: selectedFile === f.path ? 'var(--accent)' : undefined,
                    }}
                  >
                    <span className="mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
                      {f.path}
                    </span>
                    <span className="badge" style={{ fontSize: '0.7rem' }}>
                      {f.summary}
                    </span>
                  </button>
                ))
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />
            <div className="flex-between">
              <strong style={{ fontSize: '0.86rem' }}>Commit Composer</strong>
              <button type="button" className="btn btn-sm" onClick={applyTeamCommitTemplate}>
                Insert Template
              </button>
            </div>
            <textarea
              className="textarea mono"
              rows={4}
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
            />
            <div className="flex-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  runCommandWithConsent({
                    label: 'Stage All & Commit on Current Branch',
                    command: `git add -A && git commit -m ${JSON.stringify(commitMsg.split('\n')[0])}`,
                    impactScope: 'Git Working Tree',
                    reversibleNote: 'Reversible via `git reset --soft HEAD~1`.',
                  })
                }
              >
                Stage & Commit
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  runCommandWithConsent({
                    label: 'Stash Working Changes',
                    command: 'git stash push -u -m "DevBench quick stash"',
                    impactScope: 'Git Working Tree',
                    reversibleNote: 'Restore anytime via `git stash pop`.',
                  })
                }
              >
                Stash
              </button>
            </div>
          </div>

          <div className="card stack-sm">
            <div className="flex-between">
              <strong>Visual Diff Preview — {selectedFile || 'All Working Changes'}</strong>
              {selectedFile && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => openFileInEditor(selectedFile, 1)}
                >
                  Open in Code Editor
                </button>
              )}
            </div>
            <div
              className="card-elevated mono"
              style={{ maxHeight: '58vh', overflowY: 'auto', fontSize: '0.8rem' }}
            >
              {diffText.split(/\r?\n/).map((line, i) => {
                let bg = 'transparent';
                let color = 'var(--text-primary)';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  bg = 'var(--success-soft)';
                  color = 'var(--success)';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  bg = 'var(--danger-soft)';
                  color = 'var(--danger)';
                } else if (line.startsWith('@@')) {
                  color = 'var(--accent)';
                }
                return (
                  <div key={i} style={{ background: bg, color, padding: '1px 6px', whiteSpace: 'pre-wrap' }}>
                    {line || ' '}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Recent Commit History</h3>
            {gitData?.commits.map((c) => (
              <div key={c.hash} className="card-elevated flex-between">
                <div>
                  <div>
                    <span className="badge badge-accent mono">{c.hash}</span>{' '}
                    <strong>{c.subject}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                    {c.author} · {c.relativeTime}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Branches, Remotes, Stashes & Worktrees</h3>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Branches</strong>
              <div className="flex-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                {gitData?.branches.map((b) => (
                  <span key={b} className="badge mono">
                    {b}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Remotes (Credentials Masked)</strong>
              {gitData?.remotes.map((r, idx) => (
                <div key={idx} className="mono muted" style={{ fontSize: '0.78rem' }}>
                  {r.name}: {r.detail}
                </div>
              ))}
            </div>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Active Worktrees</strong>
              {gitData?.worktrees.map((w, idx) => (
                <div key={idx} className="card-elevated mono" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                  {w}
                </div>
              ))}
            </div>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Stash Stack ({gitData?.stashes.length || 0})</strong>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {gitData?.stashes.length ? gitData.stashes.join('\n') : 'No stashed changes.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'blame' && (
        <div className="card stack-sm">
          <div className="flex-between">
            <h3 style={{ margin: 0 }}>Line-by-Line Git Blame</h3>
            <div className="flex-row">
              <input
                className="input mono"
                style={{ width: 260 }}
                value={blamePath}
                onChange={(e) => setBlamePath(e.target.value)}
              />
              <button type="button" className="btn btn-sm btn-primary" onClick={() => loadBlame(blamePath)}>
                Inspect Blame
              </button>
            </div>
          </div>
          <div className="card-elevated mono" style={{ maxHeight: '55vh', overflowY: 'auto', fontSize: '0.79rem' }}>
            {blameRows.map((r) => (
              <div
                key={r.line}
                style={{ display: 'grid', gridTemplateColumns: '44px 85px 140px 1fr', gap: 8, padding: '2px 0' }}
              >
                <span className="muted">{r.line}</span>
                <span style={{ color: 'var(--accent)' }}>{r.commit}</span>
                <span className="muted">{r.author.slice(0, 16)}</span>
                <span style={{ whiteSpace: 'pre' }}>{r.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Windows Line-Ending & Binary Rules (`.gitattributes`)</h3>
            <div className="muted" style={{ fontSize: '0.84rem' }}>
              Prevents `core.autocrlf` from corrupting `.bat`, `.cmd`, `.ps1`, `.sln`, `.vcxproj`, `.manifest`, and `.wsb` files on Windows checkouts.
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => openFileInEditor('.gitattributes', 1)}
            >
              Open Workspace `.gitattributes` in Editor
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => openFileInEditor('.gitignore', 1)}
            >
              Open Workspace `.gitignore` in Editor
            </button>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Repository Hooks & Commit Signing Setup</h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Configure SSH or GPG commit signing (`git config user.signingkey`) without exposing private keys to plugins.
            </div>
            <div className="stack-sm">
              {gitData?.hooks.slice(0, 6).map((h) => (
                <div key={h.name} className="card-elevated flex-between">
                  <span className="mono" style={{ fontSize: '0.8rem' }}>
                    .git/hooks/{h.name}
                  </span>
                  <span className={`badge ${h.active ? 'badge-success' : ''}`}>
                    {h.active ? 'Active Hook' : 'Sample Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitModule;
