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
  const {
    runCommandWithConsent,
    requestConsent,
    teamConfig,
    teamConfigTrusted,
    openFileInEditor,
    notify,
  } = useWorkbench();

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
  const [preCommitResult, setPreCommitResult] = useState<{
    passed: boolean;
    changedFilesCount: number;
    secretFindings: { file: string; line: number; ruleName: string }[];
    crlfWarnings: { file: string; detail: string }[];
  } | null>(null);
  const [scaffoldSlugs, setScaffoldSlugs] = useState<string[]>([]);
  const [selectedWsSlug, setSelectedWsSlug] = useState<string>('');
  const [newWsBranch, setNewWsBranch] = useState<string>('feat/win11-dpi');
  const [newWsTag, setNewWsTag] = useState<string>('v0.1.0');
  const [wsGitOut, setWsGitOut] = useState<string>('');
  const [commitPreviewPatch, setCommitPreviewPatch] = useState<string>('');

  const loadCommitPatchPreview = async (hash: string) => {
    const r = await fetch('/api/git/commit-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitHash: hash, repoDir: '.' }),
    });
    const d = await r.json();
    if (r.ok) setCommitPreviewPatch(d.patch || '');
  };

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
    fetch('/api/projects/scaffolded')
      .then((r) => r.json())
      .then((d) => {
        const slugs = (d.workspaces || []).map((w: { slug: string }) => w.slug);
        setScaffoldSlugs(slugs);
        if (slugs.length > 0) setSelectedWsSlug((prev) => prev || slugs[0]);
      })
      .catch(() => {});
  }, [loadOverview]);

  const runPreCommitGateCheck = async () => {
    const r = await fetch('/api/git/precommit-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoDir: '.' }),
    });
    const d = await r.json();
    if (r.ok) {
      setPreCommitResult(d);
      notify(
        d.passed
          ? `Pre-commit gate passed (${d.changedFilesCount} changed files, 0 secrets)`
          : `Pre-commit gate flagged ${d.secretFindings.length} secret(s)!`
      );
    }
  };

  const triggerWorkspaceGitAction = (
    action:
      | 'init'
      | 'stage-all'
      | 'commit'
      | 'create-branch'
      | 'stash'
      | 'stash-pop'
      | 'create-tag'
  ) => {
    if (!selectedWsSlug) return;
    requestConsent(
      {
        id: `ws-git-${Date.now()}`,
        title: `Approve Git ${action} in workspaces/${selectedWsSlug}`,
        actionType: 'git-write',
        description: `Executes isolated Git "${action}" inside scaffolded project workspaces/${selectedWsSlug} (enforces pre-commit secret & CRLF scan before commits).`,
        commandPreview: `cd workspaces/${selectedWsSlug} && git ${action}`,
        impactScope: 'Local Project',
        reversibleNote: 'Scoped strictly to workspaces/<slug>; never touches the root repository branch.',
      },
      async () => {
        const r = await fetch('/api/git/workspace-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceSlug: selectedWsSlug,
            action,
            message: commitMsg.split('\n')[0],
            branchName: newWsBranch,
            tagName: newWsTag,
            consentConfirmed: true,
          }),
        });
        const d = await r.json();
        if (r.ok) {
          setWsGitOut(d.output || `${action} succeeded`);
          notify(`workspaces/${selectedWsSlug}: Git ${action} succeeded`);
        } else {
          setWsGitOut(`Error: ${d.error}`);
          notify(`Git ${action} blocked: ${d.error}`);
        }
      }
    );
  };

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
                onClick={runPreCommitGateCheck}
              >
                <ShieldCheck size={12} /> Pre-Commit Gate
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

            {preCommitResult && (
              <div className="card-elevated" style={{ fontSize: '0.78rem' }}>
                <strong style={{ color: preCommitResult.passed ? 'var(--success)' : 'var(--danger)' }}>
                  {preCommitResult.passed
                    ? `Pre-Commit Gate Passed (${preCommitResult.changedFilesCount} files)`
                    : `Blocked: ${preCommitResult.secretFindings.length} secret(s) detected`}
                </strong>
                {preCommitResult.crlfWarnings.length > 0 && (
                  <div style={{ color: 'var(--warning)', marginTop: 3 }}>
                    CRLF Notice: {preCommitResult.crlfWarnings[0].file}
                  </div>
                )}
              </div>
            )}

            {scaffoldSlugs.length > 0 && (
              <div className="card-elevated stack-sm" style={{ fontSize: '0.79rem' }}>
                <strong>Scaffolded Project Git Flow (`workspaces/`)</strong>
                <select
                  className="select mono"
                  value={selectedWsSlug}
                  onChange={(e) => setSelectedWsSlug(e.target.value)}
                >
                  {scaffoldSlugs.map((s) => (
                    <option key={s} value={s}>
                      workspaces/{s}
                    </option>
                  ))}
                </select>
                <div className="flex-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => triggerWorkspaceGitAction('stage-all')}
                  >
                    Stage All
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => triggerWorkspaceGitAction('commit')}
                  >
                    Commit (Secret-Gated)
                  </button>
                </div>
                <div className="flex-row">
                  <input
                    className="input mono"
                    style={{ fontSize: '0.76rem' }}
                    value={newWsBranch}
                    onChange={(e) => setNewWsBranch(e.target.value)}
                    placeholder="feat/new-branch"
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => triggerWorkspaceGitAction('create-branch')}
                  >
                    Branch
                  </button>
                </div>
                <div className="flex-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                  <input
                    className="input mono"
                    style={{ fontSize: '0.76rem', width: 95 }}
                    value={newWsTag}
                    onChange={(e) => setNewWsTag(e.target.value)}
                    placeholder="v0.1.0"
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => triggerWorkspaceGitAction('create-tag')}
                  >
                    Tag
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => triggerWorkspaceGitAction('stash')}
                  >
                    Stash
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => triggerWorkspaceGitAction('stash-pop')}
                  >
                    Stash Pop
                  </button>
                </div>
                {wsGitOut && (
                  <div className="mono muted" style={{ fontSize: '0.73rem' }}>
                    {wsGitOut}
                  </div>
                )}
              </div>
            )}
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
            <h3 style={{ margin: 0 }}>Recent Commit History & Cherry-Pick Patch Preview</h3>
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
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void loadCommitPatchPreview(c.hash)}
                >
                  Inspect Patch
                </button>
              </div>
            ))}
            {commitPreviewPatch && (
              <pre
                className="card-elevated mono"
                style={{ margin: 0, maxHeight: 240, overflowY: 'auto', fontSize: '0.75rem' }}
              >
                {commitPreviewPatch}
              </pre>
            )}
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
