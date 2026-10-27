import React, { useState } from 'react';
import {
  Archive,
  Check,
  Download,
  FolderPlus,
  GitFork,
  KeyRound,
  Layers,
  Plus,
  Star,
  Upload,
} from 'lucide-react';
import {
  BUILD_SYSTEMS,
  DEBUGGER_ADAPTERS,
  LANGUAGE_ADAPTERS,
  PACKAGE_MANAGERS,
  TEST_RUNNERS,
  UI_FRAMEWORKS,
} from '../../shared/catalog/ecosystems';
import { STARTER_TEMPLATES } from '../../shared/catalog/templates';
import { LanguageId, ProjectWorkspace } from '../../shared/types';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

export const ProjectsModule: React.FC = () => {
  const {
    projects,
    setProjects,
    activeProject,
    setActiveProjectId,
    updateActiveProject,
    profiles,
    activeProfile,
    applyProfile,
    toolchains,
    requestConsent,
    runCommandWithConsent,
    createBackup,
    notify,
  } = useWorkbench();

  const [tab, setTab] = useState<'overview' | 'wizard' | 'env' | 'profiles'>('overview');
  const [showArchived, setShowArchived] = useState(false);

  // New-Project Wizard state (demonstrates decoupled Language + UI + Build + Package Manager!)
  const [selectedTplId, setSelectedTplId] = useState(STARTER_TEMPLATES[0].id);
  const [projName, setProjName] = useState('AuroraWinClient');
  const [customLang, setCustomLang] = useState<LanguageId>('csharp');
  const [customUi, setCustomUi] = useState('winui3');
  const [customBuild, setCustomBuild] = useState('msbuild-dotnet');
  const [customPkg, setCustomPkg] = useState('nuget');
  const [scaffoldToDisk, setScaffoldToDisk] = useState(false);

  // Clone helper
  const [cloneUrl, setCloneUrl] = useState('https://github.com/SeanShaffer88/DevBench.git');

  // Env var state
  const [envKey, setEnvKey] = useState('');
  const [envVal, setEnvVal] = useState('');
  const [envSecret, setEnvSecret] = useState(false);

  // Import state
  const [importJson, setImportJson] = useState('');

  const handleSelectTemplate = (tplId: string) => {
    setSelectedTplId(tplId);
    const tpl = STARTER_TEMPLATES.find((t) => t.id === tplId);
    if (tpl) {
      setCustomLang(tpl.language);
      setCustomUi(tpl.uiFrameworkId);
      setCustomBuild(tpl.buildSystemId);
      setCustomPkg(tpl.packageManagerId);
    }
  };

  const createNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = projName.trim() || 'NewWindowsApp';
    const tpl = STARTER_TEMPLATES.find((t) => t.id === selectedTplId);
    const runner = TEST_RUNNERS.find((r) => r.compatibleLanguages.includes(customLang))?.id || 'vitest';
    const dbg = DEBUGGER_ADAPTERS.find((d) => d.compatibleLanguages.includes(customLang))?.id || 'node-inspector';
    const langObj = LANGUAGE_ADAPTERS.find((l) => l.id === customLang);
    const uiObj = UI_FRAMEWORKS.find((u) => u.id === customUi);

    const newProj: ProjectWorkspace = {
      id: `proj-${Date.now()}`,
      name: cleanName,
      path: scaffoldToDisk ? `workspaces/${cleanName}` : `C:\\Projects\\${cleanName}`,
      favorite: false,
      lastOpened: new Date().toISOString(),
      tags: [langObj?.name || customLang, uiObj?.name.split(' ')[0] || customUi, 'Windows'],
      profileId: activeProfile.id,
      language: customLang,
      uiFrameworkId: customUi,
      buildSystemId: customBuild,
      packageManagerId: customPkg,
      testRunnerId: runner,
      debuggerId: dbg,
      pinnedVersions: {},
      targetArchitectures: ['x64', 'ARM64'],
      windowsSdkTarget: '10.0.22621.0',
      notes: `Created via DevBench New-Project Wizard (${tpl?.name || 'Custom Stack'}).`,
      docLinks: [],
      bookmarks: [],
      todos: [{ id: `t-${Date.now()}`, text: 'Verify SDK & manifest configuration', done: false, tag: 'Setup' }],
      shortcuts: [
        {
          id: `sc-${Date.now()}`,
          label: 'Default Build',
          command: BUILD_SYSTEMS.find((b) => b.id === customBuild)?.defaultCommands.build || 'echo Build',
          category: 'build',
        },
      ],
      envVars: [],
    };

    const finalize = async () => {
      if (scaffoldToDisk && tpl) {
        for (const f of tpl.starterFiles) {
          await fetch('/api/files/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: `workspaces/${cleanName}/${f.path}`,
              content: f.content,
              lineEndings: 'CRLF',
            }),
          });
        }
      }
      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProj.id);
      setTab('overview');
      notify(`Created project "${cleanName}"`);
    };

    if (scaffoldToDisk) {
      requestConsent(
        {
          id: `scaf-${Date.now()}`,
          title: `Scaffold Starter Files for ${cleanName}`,
          actionType: 'file-mutate',
          description: `Writes ${tpl?.starterFiles.length || 0} starter project manifest file(s) into workspaces/${cleanName}/`,
          commandPreview: `mkdir workspaces/${cleanName} && write starter files`,
          impactScope: 'Local Project',
          reversibleNote: `Delete folder workspaces/${cleanName} to remove scaffolded files.`,
        },
        finalize
      );
    } else {
      finalize();
    }
  };

  const addEnvVariable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!envKey.trim()) return;
    updateActiveProject((p) => ({
      ...p,
      envVars: [
        ...p.envVars,
        {
          key: envKey.trim(),
          value: envSecret ? `vault://project-secrets/${envKey.trim().toLowerCase()}` : envVal,
          isSecretRef: envSecret,
          secretVaultKey: envSecret ? envKey.trim() : undefined,
        },
      ],
    }));
    setEnvKey('');
    setEnvVal('');
    setEnvSecret(false);
    notify('Added per-project environment entry.');
  };

  const exportPortableWorkspace = () => {
    const payload = JSON.stringify(
      {
        schema: 'devbench-portable-workspace/v1',
        exportedAt: new Date().toISOString(),
        projects: projects.map((p) => ({
          ...p,
          // Never export raw values if marked secret; preserve vault references only
          envVars: p.envVars.map((ev) =>
            ev.isSecretRef ? { ...ev, value: `vault://redacted/${ev.key}` } : ev
          ),
        })),
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devbench-workspace.portable.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('Exported portable workspace configuration (secrets kept as vault references).');
  };

  const handleImportWorkspace = () => {
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed.projects)) {
        notify('Invalid JSON: expected `{ "projects": [...] }`.');
        return;
      }
      createBackup('Pre-Import Automatic Backup');
      setProjects(parsed.projects);
      setImportJson('');
      notify(`Imported ${parsed.projects.length} project(s) with backup snapshot saved.`);
    } catch (err) {
      notify(`Import failed: ${(err as Error).message}`);
    }
  };

  const compatibleDetectedTools = toolchains.filter(
    (t) => t.installed && t.compatibleLanguages.includes(customLang)
  );

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Multi-project workspace, decoupled stack wizard, profiles & portable config" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          Workspace Projects ({projects.filter((p) => !p.archived).length})
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'wizard' ? 'active' : ''}`}
          onClick={() => setTab('wizard')}
        >
          <FolderPlus size={14} /> New-Project Wizard
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'env' ? 'active' : ''}`}
          onClick={() => setTab('env')}
        >
          <KeyRound size={14} /> Per-Project Env & Secret Refs
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'profiles' ? 'active' : ''}`}
          onClick={() => setTab('profiles')}
        >
          <Layers size={14} /> Profiles & Portable Import/Export
        </button>
      </div>

      {tab === 'overview' && (
        <div className="stack-md">
          <div className="card flex-between">
            <div className="flex-row" style={{ flex: 1, minWidth: 280 }}>
              <GitFork size={16} style={{ color: 'var(--accent)' }} />
              <input
                className="input mono"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://github.com/org/repo.git"
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  runCommandWithConsent({
                    label: 'Git Clone Repository into workspaces/',
                    command: `git clone ${cloneUrl} workspaces/cloned-repo`,
                    impactScope: 'Local Project',
                  })
                }
              >
                Clone Repo
              </button>
            </div>
            <label className="flex-row" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span>Show Archived Projects</span>
            </label>
          </div>

          <div className="grid-2">
            {projects
              .filter((p) => (showArchived ? true : !p.archived))
              .map((proj) => (
                <div
                  key={proj.id}
                  className="card stack-sm"
                  style={{
                    borderColor: proj.id === activeProject.id ? 'var(--accent)' : undefined,
                    opacity: proj.archived ? 0.65 : 1,
                  }}
                >
                  <div className="flex-between">
                    <div>
                      <div className="flex-row">
                        <strong style={{ fontSize: '1rem' }}>{proj.name}</strong>
                        {proj.id === activeProject.id && (
                          <span className="badge badge-accent">Active</span>
                        )}
                        {proj.archived && <span className="badge badge-warn">Archived</span>}
                      </div>
                      <div className="muted mono" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                        {proj.path}
                      </div>
                    </div>
                    <div className="flex-row">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          setProjects((prev) =>
                            prev.map((x) => (x.id === proj.id ? { ...x, favorite: !x.favorite } : x))
                          )
                        }
                        title="Toggle Favorite"
                      >
                        <Star
                          size={14}
                          fill={proj.favorite ? 'currentColor' : 'none'}
                          style={{ color: proj.favorite ? 'var(--warning)' : undefined }}
                        />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          setProjects((prev) =>
                            prev.map((x) => (x.id === proj.id ? { ...x, archived: !x.archived } : x))
                          )
                        }
                        title={proj.archived ? 'Unarchive' : 'Archive Project'}
                      >
                        <Archive size={14} />
                      </button>
                      {proj.id !== activeProject.id && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => setActiveProjectId(proj.id)}
                        >
                          <Check size={13} /> Activate
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                    {proj.notes}
                  </p>

                  <div className="flex-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                    <span className="badge badge-accent">Lang: {proj.language}</span>
                    <span className="badge">UI: {proj.uiFrameworkId}</span>
                    <span className="badge">Build: {proj.buildSystemId}</span>
                    <span className="badge">Pkg: {proj.packageManagerId}</span>
                    <span className="badge">Targets: {proj.targetArchitectures.join('/')}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'wizard' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>1. Choose Starter Kit Template</h3>
            <div className="muted" style={{ fontSize: '0.84rem' }}>
              Select a curated Windows desktop preset or customize each adapter layer independently on the right.
            </div>
            <div className="stack-sm">
              {STARTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="card-elevated"
                  onClick={() => handleSelectTemplate(tpl.id)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderColor: selectedTplId === tpl.id ? 'var(--accent)' : undefined,
                  }}
                >
                  <div className="flex-between">
                    <strong>{tpl.name}</strong>
                    <span className="badge">{tpl.recommendedArchitectures.join(' + ')}</span>
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                    {tpl.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={createNewProject} className="card stack-sm">
            <h3 style={{ margin: 0 }}>2. Compose Decoupled Stack Adapters</h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              DevBench separates Language, UI Framework, Build System, and Package Manager so any combination works cleanly.
            </div>

            <label>
              <div style={{ fontSize: '0.83rem', marginBottom: 3 }}>Project Name</div>
              <input
                className="input"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                required
              />
            </label>

            <label>
              <div style={{ fontSize: '0.83rem', marginBottom: 3 }}>Language Adapter</div>
              <select
                className="select"
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value as LanguageId)}
              >
                {LANGUAGE_ADAPTERS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.category})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ fontSize: '0.83rem', marginBottom: 3 }}>Desktop UI Framework</div>
              <select
                className="select"
                value={customUi}
                onChange={(e) => setCustomUi(e.target.value)}
              >
                {UI_FRAMEWORKS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.windowsTargetType}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>
                <div style={{ fontSize: '0.83rem', marginBottom: 3 }}>Build System</div>
                <select
                  className="select"
                  value={customBuild}
                  onChange={(e) => setCustomBuild(e.target.value)}
                >
                  {BUILD_SYSTEMS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div style={{ fontSize: '0.83rem', marginBottom: 3 }}>Package Manager</div>
                <select
                  className="select"
                  value={customPkg}
                  onChange={(e) => setCustomPkg(e.target.value)}
                >
                  {PACKAGE_MANAGERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="card-elevated" style={{ fontSize: '0.82rem' }}>
              <strong>Detected Host Toolchain Suggestions:</strong>{' '}
              {compatibleDetectedTools.length > 0 ? (
                <span>
                  Found on host:{' '}
                  {compatibleDetectedTools.map((t) => `${t.name} (${t.detectedVersion})`).join(', ')}
                </span>
              ) : (
                <span className="muted">
                  Target SDK not currently on host PATH — project will scaffold cleanly and show one-click setup guidance in Home & Packages.
                </span>
              )}
            </div>

            <label className="flex-row" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={scaffoldToDisk}
                onChange={(e) => setScaffoldToDisk(e.target.checked)}
              />
              <span>Write starter manifest files into `workspaces/{projName || 'App'}/` (consent-gated)</span>
            </label>

            <button type="submit" className="btn btn-primary">
              <Plus size={15} /> Create Windows Project Workspace
            </button>
          </form>
        </div>
      )}

      {tab === 'env' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Environment Variables & Secret References — {activeProject.name}</h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Plaintext secrets are never stored in shared workspace manifests; mark sensitive credentials as protected `vault://` references.
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Value / Vault Reference</th>
                  <th>Protection</th>
                </tr>
              </thead>
              <tbody>
                {activeProject.envVars.map((ev, i) => (
                  <tr key={`${ev.key}-${i}`}>
                    <td className="mono">{ev.key}</td>
                    <td className="mono">{ev.value}</td>
                    <td>
                      {ev.isSecretRef ? (
                        <span className="badge badge-warn">Protected Vault Ref</span>
                      ) : (
                        <span className="badge">Plain Config</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={addEnvVariable} className="card stack-sm">
            <h3 style={{ margin: 0 }}>Add Project Variable or Secret Reference</h3>
            <input
              className="input mono"
              placeholder="KEY_NAME (e.g. WINDOWS_SIGNING_ENDPOINT)"
              value={envKey}
              onChange={(e) => setEnvKey(e.target.value)}
              required
            />
            {!envSecret && (
              <input
                className="input mono"
                placeholder="Non-secret configuration value"
                value={envVal}
                onChange={(e) => setEnvVal(e.target.value)}
              />
            )}
            <label className="flex-row" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={envSecret}
                onChange={(e) => setEnvSecret(e.target.checked)}
              />
              <span>Store as OS Credential Locker / Secret Vault reference (`vault://...`)</span>
            </label>
            <button type="submit" className="btn btn-primary">
              <Plus size={14} /> Add Variable
            </button>
          </form>
        </div>
      )}

      {tab === 'profiles' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Workspace Profiles</h3>
            <div className="muted" style={{ fontSize: '0.84rem' }}>
              Switch visible modules and default shells depending on your role, client, or stack.
            </div>
            {profiles.map((prof) => (
              <div
                key={prof.id}
                className="card-elevated flex-between"
                style={{ borderColor: prof.id === activeProfile.id ? 'var(--accent)' : undefined }}
              >
                <div>
                  <strong>{prof.name}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {prof.description}
                  </div>
                  <div className="muted" style={{ fontSize: '0.75rem', marginTop: 3 }}>
                    Visible modules: {prof.visibleModules.length} · Default shell: {prof.preferredShell}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${prof.id === activeProfile.id ? 'btn-primary' : ''}`}
                  onClick={() => applyProfile(prof.id)}
                >
                  {prof.id === activeProfile.id ? 'Active' : 'Apply'}
                </button>
              </div>
            ))}
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Portable Workspace Import / Export</h3>
            <div className="muted" style={{ fontSize: '0.84rem' }}>
              Export your project definitions cleanly without leaking plaintext credentials, or import on another Windows workstation.
            </div>
            <button type="button" className="btn btn-primary" onClick={exportPortableWorkspace}>
              <Download size={14} /> Export Portable `.devbench-workspace.json`
            </button>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />
            <label className="muted" style={{ fontSize: '0.82rem' }}>
              Paste Portable Workspace JSON (auto-creates recovery backup before applying):
            </label>
            <textarea
              className="textarea"
              rows={5}
              placeholder='{"projects": [...]}'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={!importJson.trim()}
              onClick={handleImportWorkspace}
            >
              <Upload size={14} /> Import Workspace JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsModule;
