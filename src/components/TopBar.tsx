import React from 'react';
import {
  Activity,
  Command,
  FolderGit2,
  Keyboard,
  Layers,
  Moon,
  PanelLeft,
  Search,
  Sun,
  TerminalSquare,
  WifiOff,
  Contrast,
} from 'lucide-react';
import { useWorkbench } from '../context/WorkbenchContext';

export const TopBar: React.FC = () => {
  const {
    projects,
    activeProject,
    setActiveProjectId,
    profiles,
    activeProfile,
    applyProfile,
    settings,
    updateSettings,
    jobs,
    dockOpen,
    setDockOpen,
    setPaletteOpen,
    setShortcutsOpen,
  } = useWorkbench();

  const runningJobs = jobs.filter((j) => j.status === 'running');

  const cycleTheme = () => {
    const order: ('dark' | 'light' | 'high-contrast')[] = ['dark', 'light', 'high-contrast'];
    const next = order[(order.indexOf(settings.theme) + 1) % order.length];
    updateSettings({ theme: next });
  };

  return (
    <header className="wb-topbar" role="banner">
      <div className="flex-row" style={{ gap: 10 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })}
          aria-label="Toggle module navigation sidebar (Ctrl+B)"
          title="Toggle Sidebar (Ctrl+B)"
        >
          <PanelLeft size={16} />
        </button>

        <div className="flex-row" style={{ gap: 7, fontWeight: 700, letterSpacing: '-0.01em' }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: 'var(--accent-strong)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.82rem',
            }}
          >
            DB
          </span>
          <span>DevBench</span>
          <span className="badge" style={{ fontSize: '0.72rem' }}>
            WinSDK Workbench
          </span>
        </div>

        <label className="sr-only" htmlFor="topbar-project-select">
          Active Project
        </label>
        <div className="flex-row" title="Active Workspace Project">
          <FolderGit2 size={15} className="muted" />
          <select
            id="topbar-project-select"
            className="select"
            style={{ width: 235, padding: '4px 8px', fontSize: '0.86rem' }}
            value={activeProject.id}
            onChange={(e) => setActiveProjectId(e.target.value)}
          >
            {projects
              .filter((p) => !p.archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.favorite ? '★ ' : ''}
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        <label className="sr-only" htmlFor="topbar-profile-select">
          Workspace Profile
        </label>
        <div className="flex-row" title="Switch Workspace Layout Profile">
          <Layers size={15} className="muted" />
          <select
            id="topbar-profile-select"
            className="select"
            style={{ width: 185, padding: '4px 8px', fontSize: '0.85rem' }}
            value={activeProfile.id}
            onChange={(e) => applyProfile(e.target.value)}
          >
            {profiles.map((prof) => (
              <option key={prof.id} value={prof.id}>
                Profile: {prof.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        className="btn"
        onClick={() => setPaletteOpen(true)}
        style={{
          minWidth: 270,
          justifyContent: 'space-between',
          background: 'var(--bg-input)',
          color: 'var(--text-muted)',
        }}
        aria-label="Open Universal Search and Command Palette (Ctrl+K)"
      >
        <span className="flex-row">
          <Search size={14} />
          <span>Search tools, commands, SDKs, guides...</span>
        </span>
        <span className="badge" style={{ fontSize: '0.72rem' }}>
          <Command size={11} /> Ctrl+K
        </span>
      </button>

      <div className="flex-row" style={{ gap: 6 }}>
        {settings.offlineMode && (
          <span className="badge badge-warn" title="Offline Mode Enabled — External network blocked">
            <WifiOff size={12} /> Offline
          </span>
        )}

        <button
          type="button"
          className={`btn btn-sm ${runningJobs.length > 0 ? 'btn-primary' : ''}`}
          onClick={() => setDockOpen(!dockOpen)}
          title="Toggle Output, Terminal & Background Jobs Dock (Ctrl+J)"
        >
          <Activity size={14} />
          <span>{runningJobs.length > 0 ? `${runningJobs.length} Running` : 'Output & Jobs'}</span>
        </button>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setDockOpen(!dockOpen)}
          title="Terminal Shell Profiles"
          aria-label="Toggle Terminal Dock"
        >
          <TerminalSquare size={14} />
        </button>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard Shortcut Finder (Ctrl+/)"
          aria-label="Open Keyboard Shortcuts"
        >
          <Keyboard size={14} />
        </button>

        <button
          type="button"
          className="btn btn-sm"
          onClick={cycleTheme}
          title={`Switch Theme (Current: ${settings.theme})`}
          aria-label={`Switch theme, current is ${settings.theme}`}
        >
          {settings.theme === 'dark' ? (
            <Moon size={14} />
          ) : settings.theme === 'light' ? (
            <Sun size={14} />
          ) : (
            <Contrast size={14} />
          )}
        </button>
      </div>
    </header>
  );
};
