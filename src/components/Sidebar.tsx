import React from 'react';
import {
  AppWindow,
  Boxes,
  Bug,
  Code2,
  Database,
  FlaskConical,
  FolderKanban,
  GitBranch,
  Home,
  Play,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { CORE_MODULES } from '../../shared/catalog/modules';
import { ModuleId } from '../../shared/types';
import { useWorkbench } from '../context/WorkbenchContext';

const MODULE_ICONS: Record<ModuleId, React.ReactNode> = {
  home: <Home size={17} />,
  projects: <FolderKanban size={17} />,
  code: <Code2 size={17} />,
  'build-run': <Play size={17} />,
  test: <FlaskConical size={17} />,
  debug: <Bug size={17} />,
  git: <GitBranch size={17} />,
  packages: <Boxes size={17} />,
  'apis-data': <Database size={17} />,
  windows: <AppWindow size={17} />,
  security: <ShieldCheck size={17} />,
  team: <Users size={17} />,
  settings: <Settings size={17} />,
};

export const Sidebar: React.FC = () => {
  const { activeModule, setActiveModule, settings, loadedModules } = useWorkbench();
  const collapsed = settings.sidebarCollapsed;

  const visibleModules = CORE_MODULES.filter(
    (m) => m.coreAlwaysVisible || !settings.hiddenModules.includes(m.id)
  );

  return (
    <nav
      className={`wb-sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Primary Workbench Modules"
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
        {visibleModules.map((mod) => {
          const isActive = activeModule === mod.id;
          return (
            <button
              key={mod.id}
              type="button"
              className={`wb-nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveModule(mod.id)}
              aria-current={isActive ? 'page' : undefined}
              title={`${mod.label} (${mod.shortcut}) — ${mod.description}`}
              style={collapsed ? { justifyContent: 'center', padding: '8px' } : undefined}
            >
              {MODULE_ICONS[mod.id]}
              {!collapsed && (
                <>
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>{mod.label}</span>
                  <span className="muted" style={{ fontSize: '0.73rem' }}>
                    {mod.shortcut}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {!collapsed && (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 8,
            marginTop: 8,
            fontSize: '0.76rem',
            paddingLeft: 8,
            paddingRight: 8,
          }}
          className="muted"
        >
          <div className="flex-between">
            <span>Loaded Modules</span>
            <span className="badge" style={{ fontSize: '0.7rem' }}>
              {loadedModules.length} / {CORE_MODULES.length}
            </span>
          </div>
          {settings.hiddenModules.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {settings.hiddenModules.length} hidden ·{' '}
              <button
                type="button"
                onClick={() => setActiveModule('settings')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                }}
              >
                customize
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};
