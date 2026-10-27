import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { LANGUAGE_ADAPTERS, UI_FRAMEWORKS } from '../../shared/catalog/ecosystems';
import { CORE_MODULES } from '../../shared/catalog/modules';
import { TROUBLESHOOTING_GUIDES } from '../../shared/catalog/plugins';
import { STARTER_TEMPLATES } from '../../shared/catalog/templates';
import { useWorkbench } from '../context/WorkbenchContext';

interface PaletteAction {
  id: string;
  category: string;
  label: string;
  subtitle: string;
  shortcut?: string;
  run: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    paletteOpen,
    setPaletteOpen,
    setActiveModule,
    projects,
    setActiveProjectId,
    updateSettings,
    settings,
    triggerScanJob,
    createBackup,
  } = useWorkbench();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [paletteOpen]);

  const actions = useMemo<PaletteAction[]>(() => {
    const items: PaletteAction[] = [];

    for (const mod of CORE_MODULES) {
      items.push({
        id: `mod-${mod.id}`,
        category: 'Navigation',
        label: `Go to ${mod.label}`,
        subtitle: mod.description,
        shortcut: mod.shortcut,
        run: () => setActiveModule(mod.id),
      });
      for (const cmd of mod.commands) {
        items.push({
          id: `cmd-${mod.id}-${cmd}`,
          category: `${mod.label} Command`,
          label: cmd,
          subtitle: `Opens ${mod.label} workbench module`,
          run: () => setActiveModule(mod.id),
        });
      }
    }

    for (const proj of projects) {
      items.push({
        id: `proj-${proj.id}`,
        category: 'Switch Project',
        label: `Activate Project: ${proj.name}`,
        subtitle: `${proj.path} (${proj.tags.join(', ')})`,
        run: () => setActiveProjectId(proj.id),
      });
    }

    for (const lang of LANGUAGE_ADAPTERS) {
      items.push({
        id: `lang-${lang.id}`,
        category: 'Language Ecosystem',
        label: `${lang.name} Toolchain & Workflows`,
        subtitle: lang.windowsNotes,
        run: () => setActiveModule('packages'),
      });
    }

    for (const ui of UI_FRAMEWORKS) {
      items.push({
        id: `ui-${ui.id}`,
        category: 'Desktop UI Framework',
        label: `${ui.name} (${ui.windowsTargetType})`,
        subtitle: ui.summary,
        run: () => setActiveModule('windows'),
      });
    }

    for (const tpl of STARTER_TEMPLATES) {
      items.push({
        id: `tpl-${tpl.id}`,
        category: 'Project Scaffolder',
        label: `Scaffold Starter Template: ${tpl.name}`,
        subtitle: tpl.description,
        run: () => setActiveModule('projects'),
      });
    }

    for (const guide of TROUBLESHOOTING_GUIDES) {
      items.push({
        id: `guide-${guide.id}`,
        category: 'Troubleshooting Guide',
        label: `${guide.errorPattern}: ${guide.title}`,
        subtitle: guide.symptoms,
        run: () => setActiveModule('security'),
      });
    }

    items.push(
      {
        id: 'scan-secrets',
        category: 'Background Scan',
        label: 'Run Workspace Secret & Credential Scan',
        subtitle: 'Scans working tree files asynchronously with cancellation support',
        run: () => triggerScanJob('secret-scan'),
      },
      {
        id: 'scan-disk',
        category: 'Background Scan',
        label: 'Analyze Build Caches & Folder Disk Usage',
        subtitle: 'Calculates node_modules, dist, .git, and source sizes',
        run: () => triggerScanJob('disk-cache-scan'),
      },
      {
        id: 'v13-dap-inspector',
        category: 'Debug & Crash Dumps',
        label: 'Evaluate Live V8 Inspector / DAP Watch & Heap Snapshot',
        subtitle: 'Attaches node:inspector Runtime.evaluate session with secret redaction',
        run: () => setActiveModule('debug'),
      },
      {
        id: 'v13-minidump-parser',
        category: 'Debug & Crash Dumps',
        label: 'Parse Binary Windows Minidump (MDMP / .dmp) Crash Streams',
        subtitle: 'Reads SystemInfoStream, ExceptionStream, and PE/DLL ModuleListStream',
        run: () => setActiveModule('debug'),
      },
      {
        id: 'v13-lockfile-graph',
        category: 'Packages & Policy Gate',
        label: 'Analyze Multi-Ecosystem Lockfile Dependency Graph & License Policy Gate',
        subtitle: 'Parses package-lock.json, Cargo.lock, packages.lock.json, uv.lock & vcpkg.json',
        run: () => setActiveModule('packages'),
      },
      {
        id: 'v13-plugin-sandbox',
        category: 'Plugin Security',
        label: 'Run Plugin in Permission-Enforced worker_threads Sandbox',
        subtitle: 'Executes isolated V8 worker + frozen VM compartment with capability audit log',
        run: () => setActiveModule('team'),
      },
      {
        id: 'v13-multifile-replace',
        category: 'Code & Refactoring',
        label: 'Multi-File Search & Replace (Diff Preview + Consent + Undo Snapshot)',
        subtitle: 'Previews line-by-line hunks and saves .devbench/backups rollback snapshots',
        run: () => setActiveModule('code'),
      },
      {
        id: 'v14-live-vitest-cov',
        category: 'Test & Coverage',
        label: 'Run Live Vitest JSON Suite & Parse LCOV / Cobertura XML Coverage',
        subtitle: 'Executes consented JSON test runs and parses line/branch coverage reports',
        run: () => setActiveModule('test'),
      },
      {
        id: 'v14-sarif-export',
        category: 'Security & Compliance',
        label: 'Export OASIS SARIF 2.1.0 Security & Windows Manifest Report',
        subtitle: 'Combines working-tree + Git history secret scans with Win32/MSIX checks',
        run: () => setActiveModule('security'),
      },
      {
        id: 'v14-openapi-compose',
        category: 'APIs & Containers',
        label: 'Validate OpenAPI 3.0/3.1 Contract & Docker/Podman Compose YAML',
        subtitle: 'Audits OpenAPI endpoints, Compose image tags, port bindings, and inline secrets',
        run: () => setActiveModule('apis-data'),
      },
      {
        id: 'theme-hc',
        category: 'Accessibility',
        label: 'Enable Windows High-Contrast Theme',
        subtitle: 'High-contrast yellow/white palette for visual accessibility',
        run: () => updateSettings({ theme: 'high-contrast' }),
      },
      {
        id: 'theme-dark',
        category: 'Appearance',
        label: 'Switch to Fluent Dark Theme',
        subtitle: 'Slate dark theme optimized for extended desktop coding',
        run: () => updateSettings({ theme: 'dark' }),
      },
      {
        id: 'theme-light',
        category: 'Appearance',
        label: 'Switch to Fluent Light Theme',
        subtitle: 'High-clarity daylight theme',
        run: () => updateSettings({ theme: 'light' }),
      },
      {
        id: 'toggle-offline',
        category: 'Safety & Network',
        label: settings.offlineMode ? 'Disable Offline Mode' : 'Enable Offline-Only Mode',
        subtitle: 'Blocks outbound network calls while keeping local workbench tools active',
        run: () => updateSettings({ offlineMode: !settings.offlineMode }),
      },
      {
        id: 'backup-now',
        category: 'Reliability',
        label: 'Create Settings Backup Snapshot Now',
        subtitle: 'Saves a restorable local configuration checkpoint',
        run: () => createBackup(),
      }
    );

    return items;
  }, [
    projects,
    setActiveModule,
    setActiveProjectId,
    triggerScanJob,
    updateSettings,
    settings.offlineMode,
    createBackup,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 24);
    return actions
      .filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.subtitle.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [actions, query]);

  if (!paletteOpen) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].run();
      setPaletteOpen(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => setPaletteOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Universal Search and Command Palette"
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div
          className="flex-row"
          style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <Search size={18} style={{ color: 'var(--accent)' }} />
          <input
            ref={inputRef}
            className="input"
            style={{ border: 'none', background: 'transparent', fontSize: '1rem', padding: '4px 6px' }}
            placeholder="Type a command, module, SDK, desktop UI framework, project, or error code..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <span className="badge">Esc</span>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: '62vh', padding: 8 }}>
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 18, textAlign: 'center' }}>
              No matching commands or adapters found for "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.run();
                  setPaletteOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: idx === selectedIndex ? '1px solid var(--accent)' : '1px solid transparent',
                  background: idx === selectedIndex ? 'var(--accent-soft)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="flex-row">
                    <span className="badge" style={{ fontSize: '0.7rem' }}>
                      {item.category}
                    </span>
                    <strong>{item.label}</strong>
                  </div>
                  <div
                    className="muted"
                    style={{
                      fontSize: '0.8rem',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.subtitle}
                  </div>
                </div>
                <div className="flex-row">
                  {item.shortcut && <span className="badge">{item.shortcut}</span>}
                  <ArrowRight size={14} className="muted" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
