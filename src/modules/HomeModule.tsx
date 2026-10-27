import React, { useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wrench,
} from 'lucide-react';
import {
  BUILD_SYSTEMS,
  LANGUAGE_ADAPTERS,
  PACKAGE_MANAGERS,
  UI_FRAMEWORKS,
} from '../../shared/catalog/ecosystems';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

export const HomeModule: React.FC = () => {
  const {
    projects,
    activeProject,
    setActiveProjectId,
    updateActiveProject,
    setProjects,
    toolchains,
    runCommandWithConsent,
    openFileInEditor,
    setActiveModule,
    teamConfig,
    teamConfigTrusted,
    triggerScanJob,
  } = useWorkbench();

  const [projectFilter, setProjectFilter] = useState('');
  const [newTodo, setNewTodo] = useState('');

  const langAdapter = LANGUAGE_ADAPTERS.find((l) => l.id === activeProject.language);
  const uiSpec = UI_FRAMEWORKS.find((u) => u.id === activeProject.uiFrameworkId);
  const buildSpec = BUILD_SYSTEMS.find((b) => b.id === activeProject.buildSystemId);
  const pkgSpec = PACKAGE_MANAGERS.find((p) => p.id === activeProject.packageManagerId);

  const relevantTools = toolchains.filter((t) =>
    t.compatibleLanguages.includes(activeProject.language)
  );
  const installedCount = relevantTools.filter((t) => t.installed).length;

  const filteredProjects = projects.filter(
    (p) =>
      !p.archived &&
      (!projectFilter ||
        p.name.toLowerCase().includes(projectFilter.toLowerCase()) ||
        p.tags.some((t) => t.toLowerCase().includes(projectFilter.toLowerCase())))
  );

  const toggleFavorite = (id: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)));
  };

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    updateActiveProject((p) => ({
      ...p,
      todos: [...p.todos, { id: `td-${Date.now()}`, text: newTodo.trim(), done: false, tag: 'Task' }],
    }));
    setNewTodo('');
  };

  const toggleTodo = (id: string) => {
    updateActiveProject((p) => ({
      ...p,
      todos: p.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  };

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Modular Workbench Home — Relevant project workflows surfaced first" />

      {teamConfig && !teamConfigTrusted && (
        <div
          className="card flex-between"
          style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}
        >
          <div className="flex-row">
            <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
            <div>
              <strong>Team Configuration Detected (`.devbench/team.json`) — Pending Review</strong>
              <div style={{ fontSize: '0.84rem' }}>
                Shared repository tasks and toolchain settings stay isolated from your personal settings until you review and approve them.
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setActiveModule('team')}>
            Review Team Config
          </button>
        </div>
      )}

      {/* Top Setup Health & Quick Launch Row */}
      <div className="grid-3">
        <div className="card stack-sm">
          <div className="flex-between">
            <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Project Setup & SDK Readiness</h3>
            <span
              className={`badge ${
                installedCount > 0 ? 'badge-success' : 'badge-warn'
              }`}
            >
              {installedCount}/{Math.max(relevantTools.length, 1)} Tools Ready
            </span>
          </div>
          <div className="muted" style={{ fontSize: '0.84rem' }}>
            Stack decouples <strong>{langAdapter?.name}</strong> from UI (
            <strong>{uiSpec?.name || 'Custom'}</strong>), Build (<strong>{buildSpec?.name}</strong>), and Packages (
            <strong>{pkgSpec?.name}</strong>).
          </div>
          <div className="stack-sm" style={{ marginTop: 4 }}>
            {relevantTools.slice(0, 4).map((t) => (
              <div key={t.id} className="flex-between" style={{ fontSize: '0.84rem' }}>
                <span className="flex-row">
                  {t.installed ? (
                    <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                  ) : (
                    <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                  )}
                  <span>{t.name}</span>
                </span>
                {t.installed ? (
                  <span className="badge badge-success">{t.detectedVersion?.slice(0, 22)}</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      runCommandWithConsent({
                        label: `Install ${t.name} (Windows winget)`,
                        command: t.installCommandWindows,
                        impactScope: 'System / Toolchain',
                        reversibleNote: `Reversible via: ${t.uninstallCommandWindows}`,
                      })
                    }
                  >
                    <Wrench size={12} /> Setup Step
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex-row" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-sm" onClick={() => setActiveModule('packages')}>
              Manage SDKs & PATH
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => triggerScanJob('toolchain-probe')}
            >
              Re-Probe Host
            </button>
          </div>
        </div>

        <div className="card stack-sm">
          <div className="flex-between">
            <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Per-Project Command Shortcuts</h3>
            <button type="button" className="btn btn-sm" onClick={() => setActiveModule('build-run')}>
              All Profiles
            </button>
          </div>
          <div className="muted" style={{ fontSize: '0.83rem' }}>
            Every command shows a preview and requires approval before running.
          </div>
          <div className="stack-sm">
            {activeProject.shortcuts.map((sc) => (
              <div key={sc.id} className="card-elevated flex-between" style={{ padding: '7px 10px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{sc.label}</div>
                  <code className="muted mono" style={{ fontSize: '0.76rem' }}>
                    {sc.command}
                  </code>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    runCommandWithConsent({
                      label: sc.label,
                      command: sc.command,
                      category: sc.category === 'test' ? 'test' : 'build',
                    })
                  }
                >
                  <Play size={12} /> Run
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card stack-sm">
          <div className="flex-between">
            <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Quick Workbench Actions</h3>
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setActiveModule('projects')}>
              <Plus size={14} /> New Project Wizard
            </button>
            <button type="button" className="btn" onClick={() => setActiveModule('code')}>
              <FolderOpen size={14} /> Edit Workspace Files
            </button>
            <button type="button" className="btn" onClick={() => setActiveModule('windows')}>
              <Wrench size={14} /> Manifest & MSIX
            </button>
            <button type="button" className="btn" onClick={() => triggerScanJob('secret-scan')}>
              <ShieldCheck size={14} /> Background Secret Scan
            </button>
          </div>
          <div className="card-elevated" style={{ marginTop: 4, fontSize: '0.82rem' }}>
            <strong>Bookmarks in {activeProject.name}</strong>
            <div className="stack-sm" style={{ marginTop: 6 }}>
              {activeProject.bookmarks.length === 0 ? (
                <span className="muted">No code bookmarks pinned yet.</span>
              ) : (
                activeProject.bookmarks.map((bm) => (
                  <button
                    key={`${bm.file}:${bm.line}`}
                    type="button"
                    className="btn btn-sm"
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => openFileInEditor(bm.file, bm.line)}
                  >
                    <span className="flex-row">
                      <Bookmark size={12} /> {bm.label}
                    </span>
                    <span className="mono muted">
                      {bm.file}:{bm.line}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Searchable Project Dashboard + Notes & Tasks */}
      <div className="grid-2">
        <div className="card stack-sm">
          <div className="flex-between">
            <h3 style={{ margin: 0, fontSize: '0.98rem' }}>
              Recent & Favorite Windows Projects ({filteredProjects.length})
            </h3>
            <div className="flex-row">
              <Search size={14} className="muted" />
              <input
                className="input"
                style={{ width: 200, padding: '4px 8px' }}
                placeholder="Filter by name or stack tag..."
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="stack-sm">
            {filteredProjects.map((proj) => {
              const isSelected = proj.id === activeProject.id;
              return (
                <div
                  key={proj.id}
                  className="card-elevated flex-between"
                  style={{
                    borderColor: isSelected ? 'var(--accent)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveProjectId(proj.id)}
                >
                  <div>
                    <div className="flex-row">
                      <strong>{proj.name}</strong>
                      {proj.isLiveWorkspace && <span className="badge badge-success">Live Repo</span>}
                      {isSelected && <span className="badge badge-accent">Active</span>}
                    </div>
                    <div className="muted mono" style={{ fontSize: '0.77rem', marginTop: 2 }}>
                      {proj.path}
                    </div>
                    <div className="flex-row" style={{ marginTop: 5, flexWrap: 'wrap', gap: 4 }}>
                      {proj.tags.map((tag) => (
                        <span key={tag} className="badge" style={{ fontSize: '0.7rem' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Toggle favorite for ${proj.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(proj.id);
                    }}
                  >
                    <Star
                      size={14}
                      style={{ color: proj.favorite ? 'var(--warning)' : 'var(--text-muted)' }}
                      fill={proj.favorite ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card stack-sm">
          <h3 style={{ margin: 0, fontSize: '0.98rem' }}>
            Project Notes, Tasks & Documentation — {activeProject.name}
          </h3>
          <label className="muted" style={{ fontSize: '0.8rem' }} htmlFor="home-project-notes">
            Local Engineering Notes (kept separate from shared Git settings)
          </label>
          <textarea
            id="home-project-notes"
            className="textarea"
            rows={3}
            value={activeProject.notes}
            onChange={(e) => updateActiveProject((p) => ({ ...p, notes: e.target.value }))}
          />

          <div style={{ marginTop: 4 }}>
            <strong style={{ fontSize: '0.88rem' }}>Project Tasks & Release TODOs</strong>
            <form onSubmit={addTodo} className="flex-row" style={{ marginTop: 6, marginBottom: 8 }}>
              <input
                className="input"
                placeholder="Add per-project task or checklist item..."
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-primary">
                <Plus size={13} /> Add
              </button>
            </form>
            <div className="stack-sm">
              {activeProject.todos.map((t) => (
                <label
                  key={t.id}
                  className="card-elevated flex-between"
                  style={{ padding: '6px 10px', cursor: 'pointer' }}
                >
                  <span className="flex-row">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggleTodo(t.id)}
                    />
                    <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                  </span>
                  {t.tag && <span className="badge">{t.tag}</span>}
                </label>
              ))}
            </div>
          </div>

          {activeProject.docLinks.length > 0 && (
            <div className="flex-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {activeProject.docLinks.map((dl) => (
                <a
                  key={dl.url}
                  href={dl.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={12} /> {dl.title}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeModule;
