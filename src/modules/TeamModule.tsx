import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Play,
  Plug,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

const RELEASE_CHECKLIST = [
  'All unit & integration test suites pass on x64 and ARM64 build profiles',
  'Zero secrets or private keys flagged by working-tree & Git history scanner',
  'CycloneDX 1.5 SBOM generated and copyleft dependency licenses reviewed',
  'Application manifest verified for PerMonitorV2 DPI, Windows 11 GUID, and asInvoker UAC',
  'Installer (MSIX / MSI / NSIS) tested on clean disposable Windows Sandbox (.wsb)',
  'Binaries signed with SHA-256 RFC 3161 timestamp via Authenticode / Azure Trusted Signing',
];

export const TeamModule: React.FC = () => {
  const {
    teamConfig,
    teamConfigTrusted,
    setTeamConfigTrusted,
    settings,
    plugins,
    togglePlugin,
    customTools,
    addCustomTool,
    removeCustomTool,
    runCommandWithConsent,
    requestConsent,
    openFileInEditor,
  } = useWorkbench();

  const [tab, setTab] = useState<'team-config' | 'plugins' | 'external-tools' | 'checklists'>(
    'team-config'
  );
  const [toolName, setToolName] = useState('');
  const [toolCmd, setToolCmd] = useState('');
  const [toolArgs, setToolArgs] = useState('');
  const [checkedRelease, setCheckedRelease] = useState<Record<number, boolean>>({ 0: true, 1: true, 3: true });
  const [customAdapter, setCustomAdapter] = useState<{
    name: string;
    language: string;
    tasks?: { id: string; label: string; command: string; category: string }[];
    errorMatcherRegex?: string;
  } | null>(null);
  const [sandboxRunResult, setSandboxRunResult] = useState<{
    pluginId: string;
    pluginName: string;
    action: string;
    isolatedThreadId: number;
    durationMs: number;
    timedOut: boolean;
    ok: boolean;
    grantedPermissions: string[];
    auditLog: { capability: string; target: string; decision: 'ALLOWED' | 'DENIED'; timestamp: string }[];
    outputSummary: string;
    structuredOutput?: Record<string, unknown>;
  } | null>(null);
  const [sandboxBusyId, setSandboxBusyId] = useState<string | null>(null);

  const runPluginSandbox = async (pluginId: string, action = 'inspect-workspace') => {
    setSandboxBusyId(`${pluginId}:${action}`);
    try {
      const res = await fetch('/api/plugins/sandbox-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, action }),
      });
      const data = await res.json();
      if (res.ok) setSandboxRunResult(data);
    } finally {
      setSandboxBusyId(null);
    }
  };

  useEffect(() => {
    fetch('/api/adapters/custom')
      .then((r) => r.json())
      .then((d) => {
        if (d.exists && d.adapter) setCustomAdapter(d.adapter);
      })
      .catch(() => {});
  }, []);

  const approveTeamConfig = () => {
    requestConsent(
      {
        id: `trust-team-${Date.now()}`,
        title: 'Approve Repository Team Configuration (.devbench/team.json)',
        actionType: 'team-trust',
        description:
          'Approving enables shared commit templates and team task definitions for this repository. Personal preferences (theme, shell, hidden modules, credentials) remain strictly isolated.',
        commandPreview: '.devbench/team.json -> Enable shared tasks & recommended plugins',
        impactScope: 'Local Project',
        reversibleNote: 'You can revoke trust for .devbench/team.json at any time with one click.',
      },
      () => setTeamConfigTrusted(true)
    );
  };

  const sharedTasks = Array.isArray((teamConfig as { sharedTasks?: unknown[] })?.sharedTasks)
    ? ((teamConfig as {
        sharedTasks: { id: string; label: string; command: string; category: string }[];
      }).sharedTasks)
    : [];

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Review-before-use team config, personal vs team separation, permissioned plugins & release checklists" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'team-config' ? 'active' : ''}`}
          onClick={() => setTab('team-config')}
        >
          <Users size={14} /> Team Config & Trust Gate
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'plugins' ? 'active' : ''}`}
          onClick={() => setTab('plugins')}
        >
          <Plug size={14} /> Permissioned Plugins & Legacy Adapters ({plugins.filter((p) => p.enabled).length}/{plugins.length})
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'external-tools' ? 'active' : ''}`}
          onClick={() => setTab('external-tools')}
        >
          <Wrench size={14} /> Custom External Tools & Tracker Links
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'checklists' ? 'active' : ''}`}
          onClick={() => setTab('checklists')}
        >
          <ClipboardCheck size={14} /> Release & Deployment Checklists
        </button>
      </div>

      {tab === 'team-config' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>Repository `.devbench/team.json`</h3>
              {teamConfigTrusted ? (
                <span className="badge badge-success">
                  <CheckCircle2 size={12} /> Reviewed & Trusted
                </span>
              ) : (
                <span className="badge badge-warn">
                  <ShieldAlert size={12} /> Quarantined Until Reviewed
                </span>
              )}
            </div>

            <pre
              className="card-elevated mono"
              style={{ margin: 0, maxHeight: 280, overflowY: 'auto', fontSize: '0.77rem' }}
            >
              {JSON.stringify(teamConfig, null, 2)}
            </pre>

            <div className="flex-row">
              {!teamConfigTrusted ? (
                <button type="button" className="btn btn-primary" onClick={approveTeamConfig}>
                  Review & Trust Team Config
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setTeamConfigTrusted(false)}
                >
                  Revoke Trust
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openFileInEditor('.devbench/team.json', 1)}
              >
                Inspect in Code Editor
              </button>
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Configuration Boundary: Personal vs Team</h3>
            <div className="card-elevated">
              <strong>Personal Settings (`localStorage` / `.devbench/local.json` — Gitignored)</strong>
              <div className="muted" style={{ fontSize: '0.81rem', marginTop: 3 }}>
                Theme: <code>{settings.theme}</code> · UI Scale: <code>{Math.round(settings.uiScale * 100)}%</code> · Shell: <code>{settings.preferredShell}</code> · Offline Mode: <code>{String(settings.offlineMode)}</code>
              </div>
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                Never overwritten by repository configs or team commits.
              </div>
            </div>

            <strong>Shared Team Tasks ({sharedTasks.length})</strong>
            {sharedTasks.map((st) => (
              <div key={st.id} className="card-elevated flex-between">
                <div>
                  <strong>{st.label}</strong>
                  <div className="mono muted" style={{ fontSize: '0.76rem' }}>
                    {st.command}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!teamConfigTrusted}
                  title={teamConfigTrusted ? 'Run shared task' : 'Approve .devbench/team.json first'}
                  onClick={() =>
                    runCommandWithConsent({
                      label: `[Team Task] ${st.label}`,
                      command: st.command,
                    })
                  }
                >
                  <Play size={12} /> Run
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'plugins' && (
        <div className="stack-md">
          <div className="card stack-sm">
            <div className="flex-between">
              <div>
                <h3 style={{ margin: 0 }}>
                  Permission-Enforced <code>worker_threads</code> Plugin Sandbox Runtime
                </h3>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  Plugins execute in isolated V8 <code>worker_threads</code> + frozen{' '}
                  <code>vm.Context</code> compartments (48 MB heap cap, 1500 ms hard timeout). Every
                  host call passes through the capability broker.
                </div>
              </div>
              <span className="badge badge-success">Zero Direct FS/Process Globals</span>
            </div>

            {sandboxRunResult && (
              <div
                className="card-elevated stack-sm"
                style={{
                  borderLeft: `3px solid ${sandboxRunResult.ok ? 'var(--success)' : 'var(--warning)'}`,
                }}
              >
                <div className="flex-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <strong>{sandboxRunResult.pluginName}</strong>{' '}
                    <span className="badge mono">Thread #{sandboxRunResult.isolatedThreadId}</span>{' '}
                    <span className="badge">{sandboxRunResult.durationMs}ms</span>{' '}
                    <span
                      className={`badge ${
                        sandboxRunResult.ok ? 'badge-success' : 'badge-warn'
                      }`}
                    >
                      {sandboxRunResult.ok ? 'COMPLETED' : 'BLOCKED BY CAPABILITY GATE'}
                    </span>
                  </div>
                  <div className="mono muted" style={{ fontSize: '0.76rem' }}>
                    Action: {sandboxRunResult.action}
                  </div>
                </div>
                <div style={{ fontSize: '0.83rem' }}>{sandboxRunResult.outputSummary}</div>
                {sandboxRunResult.auditLog.length > 0 && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Capability Requested</th>
                        <th>Target Resource</th>
                        <th>Broker Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sandboxRunResult.auditLog.map((entry, idx) => (
                        <tr key={`${entry.capability}-${idx}`}>
                          <td className="mono">{entry.capability}</td>
                          <td className="mono">{entry.target}</td>
                          <td>
                            <span
                              className={`badge ${
                                entry.decision === 'ALLOWED' ? 'badge-success' : 'badge-danger'
                              }`}
                            >
                              {entry.decision}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div className="grid-2">
            {plugins.map((pl) => (
              <div
                key={pl.id}
                className="card stack-sm"
                style={{ borderColor: pl.enabled ? 'var(--accent)' : undefined }}
              >
                <div className="flex-between">
                  <div>
                    <strong>{pl.name}</strong> <span className="badge mono">v{pl.version}</span>
                    <div className="muted" style={{ fontSize: '0.78rem' }}>
                      {pl.publisher} · {pl.category}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-sm ${pl.enabled ? 'btn-primary' : ''}`}
                    onClick={() => togglePlugin(pl.id)}
                  >
                    {pl.enabled ? 'Enabled' : 'Enable'}
                  </button>
                </div>

                <div className="muted" style={{ fontSize: '0.83rem' }}>
                  {pl.description}
                </div>

                <div className="flex-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {pl.isolatedWorker && <span className="badge badge-success">Isolated Worker</span>}
                  {pl.permissions.map((perm) => (
                    <span key={perm} className="badge mono" style={{ fontSize: '0.7rem' }}>
                      perm:{perm}
                    </span>
                  ))}
                </div>

                <div className="muted mono" style={{ fontSize: '0.75rem' }}>
                  Files: {pl.projectFiles.join(', ')}
                  {pl.requiredBinaries.length > 0 &&
                    ` | External CLI: ${pl.requiredBinaries.join(', ')}`}
                </div>

                <div className="flex-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={sandboxBusyId !== null}
                    onClick={() => void runPluginSandbox(pl.id, 'inspect-workspace')}
                  >
                    <Play size={12} /> Run in Worker Sandbox
                  </button>
                  {!pl.permissions.includes('filesystem:write') && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={sandboxBusyId !== null}
                      onClick={() => void runPluginSandbox(pl.id, 'test-unauthorized-write')}
                    >
                      Verify Write Block
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'external-tools' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Custom External Tool Definitions</h3>
            {customTools.map((ct) => (
              <div key={ct.id} className="card-elevated flex-between">
                <div>
                  <strong>{ct.name}</strong> <span className="badge">{ct.category}</span>
                  <div className="mono muted" style={{ fontSize: '0.77rem' }}>
                    {ct.command} {ct.args}
                  </div>
                </div>
                <div className="flex-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      runCommandWithConsent({
                        label: `Launch External Tool: ${ct.name}`,
                        command: `${ct.command} ${ct.args}`.trim(),
                      })
                    }
                  >
                    Launch
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => removeCustomTool(ct.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!toolName.trim() || !toolCmd.trim()) return;
                addCustomTool({
                  name: toolName.trim(),
                  command: toolCmd.trim(),
                  args: toolArgs.trim(),
                  category: 'Custom',
                });
                setToolName('');
                setToolCmd('');
                setToolArgs('');
              }}
              className="stack-sm"
              style={{ marginTop: 6 }}
            >
              <input
                className="input"
                placeholder="Tool Name (e.g. Resource Hacker / ILSpy / Spy++)"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
              />
              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <input
                  className="input mono"
                  placeholder="Executable (e.g. ilspycmd)"
                  value={toolCmd}
                  onChange={(e) => setToolCmd(e.target.value)}
                />
                <input
                  className="input mono"
                  placeholder="Arguments..."
                  value={toolArgs}
                  onChange={(e) => setToolArgs(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-sm btn-primary">
                <Plus size={13} /> Register External Tool
              </button>
            </form>
          </div>

          <div className="card stack-sm">
            {customAdapter && (
              <>
                <div className="flex-between">
                  <h3 style={{ margin: 0 }}>Declarative Adapter (`devbench.adapter.json`)</h3>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => openFileInEditor('devbench.adapter.json', 1)}
                  >
                    Open Schema
                  </button>
                </div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  <strong>{customAdapter.name}</strong> ({customAdapter.language})
                </div>
                {customAdapter.tasks?.map((tk) => (
                  <div key={tk.id} className="card-elevated flex-between">
                    <div>
                      <strong>{tk.label}</strong>
                      <div className="mono muted" style={{ fontSize: '0.75rem' }}>
                        {tk.command}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        runCommandWithConsent({
                          label: `[Custom Adapter] ${tk.label}`,
                          command: tk.command,
                        })
                      }
                    >
                      <Play size={12} /> Run
                    </button>
                  </div>
                ))}
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />
              </>
            )}

            <h3 style={{ margin: 0 }}>Issue Tracker, Code Review & Documentation Links</h3>
            <div className="stack-sm">
              <a
                href="https://github.com/SeanShaffer88/DevBench/issues"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span>GitHub Issues (SeanShaffer88/DevBench)</span>
                <ExternalLink size={14} />
              </a>
              <a
                href="https://github.com/SeanShaffer88/DevBench/pulls"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span>Pull Requests & Code Review</span>
                <ExternalLink size={14} />
              </a>
              <a
                href="https://learn.microsoft.com/en-us/windows/apps/desktop/"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ justifyContent: 'space-between', textDecoration: 'none' }}
              >
                <span>Microsoft Windows App Development Docs</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {tab === 'checklists' && (
        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>Windows Desktop Release, QA & Signing Gate Checklist</h3>
          {RELEASE_CHECKLIST.map((item, idx) => (
            <label
              key={idx}
              className="card-elevated flex-row"
              style={{ cursor: 'pointer', fontSize: '0.88rem' }}
            >
              <input
                type="checkbox"
                checked={Boolean(checkedRelease[idx])}
                onChange={() => setCheckedRelease((p) => ({ ...p, [idx]: !p[idx] }))}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamModule;
