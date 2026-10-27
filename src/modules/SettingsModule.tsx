import React from 'react';
import {
  Contrast,
  Download,
  Eye,
  Keyboard,
  Moon,
  RotateCcw,
  Save,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { CORE_MODULES } from '../../shared/catalog/modules';
import { ModuleId } from '../../shared/types';
import { useWorkbench } from '../context/WorkbenchContext';

export const SettingsModule: React.FC = () => {
  const {
    settings,
    updateSettings,
    loadedModules,
    backups,
    createBackup,
    restoreBackup,
    setShortcutsOpen,
    requestConsent,
    notify,
  } = useWorkbench();

  const toggleHiddenModule = (id: ModuleId) => {
    const isHidden = settings.hiddenModules.includes(id);
    const next = isHidden
      ? settings.hiddenModules.filter((m) => m !== id)
      : [...settings.hiddenModules, id];
    updateSettings({ hiddenModules: next });
  };

  const exportPersonalSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devbench-personal-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('Exported personal settings JSON.');
  };

  const resetDefaultsSafely = () => {
    requestConsent(
      {
        id: `reset-${Date.now()}`,
        title: 'Reset Personal Settings to Safe Defaults?',
        actionType: 'file-mutate',
        description:
          'Creates an automatic recovery backup snapshot of your current settings first so you can undo with one click.',
        impactScope: 'User Environment',
        reversibleNote: '100% undoable via the Local Settings Backups list on this page.',
      },
      () => {
        createBackup('Pre-Reset Undo Snapshot');
        updateSettings({
          theme: 'dark',
          uiScale: 1,
          editorFontSize: 13,
          sidebarCollapsed: false,
          hiddenModules: [],
          preferredShell: 'pwsh',
          offlineMode: false,
          requireCommandConsent: true,
          autoRedactSecrets: true,
          telemetryEnabled: false,
          dataRetentionDays: 14,
          updateChannel: 'Stable',
        });
        notify('Settings reset to safe defaults (undo snapshot saved).');
      }
    );
  };

  return (
    <div className="stack-md">
      <div className="grid-2">
        {/* Theme, UI Scale & Accessibility */}
        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>Appearance, High Contrast & Accessibility</h3>
          <div className="flex-row" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${settings.theme === 'dark' ? 'btn-primary' : ''}`}
              onClick={() => updateSettings({ theme: 'dark' })}
            >
              <Moon size={14} /> Fluent Dark
            </button>
            <button
              type="button"
              className={`btn ${settings.theme === 'light' ? 'btn-primary' : ''}`}
              onClick={() => updateSettings({ theme: 'light' })}
            >
              <Sun size={14} /> Fluent Light
            </button>
            <button
              type="button"
              className={`btn ${settings.theme === 'high-contrast' ? 'btn-primary' : ''}`}
              onClick={() => updateSettings({ theme: 'high-contrast' })}
            >
              <Contrast size={14} /> Windows High Contrast
            </button>
          </div>

          <label>
            <div className="flex-between" style={{ fontSize: '0.84rem' }}>
              <span>UI Scaling</span>
              <span className="mono">{Math.round(settings.uiScale * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.85}
              max={1.25}
              step={0.05}
              value={settings.uiScale}
              onChange={(e) => updateSettings({ uiScale: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </label>

          <label>
            <div className="flex-between" style={{ fontSize: '0.84rem' }}>
              <span>Code Editor Font Size</span>
              <span className="mono">{settings.editorFontSize}px</span>
            </div>
            <input
              type="range"
              min={11}
              max={18}
              step={1}
              value={settings.editorFontSize}
              onChange={(e) => updateSettings({ editorFontSize: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </label>

          <button type="button" className="btn btn-sm" onClick={() => setShortcutsOpen(true)}>
            <Keyboard size={14} /> Open Keyboard Shortcut Finder (`Ctrl+/`)
          </button>
        </div>

        {/* Safety, Privacy, Offline & Update Controls */}
        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>
            <ShieldCheck size={16} /> Safety Defaults, Offline Operation & Privacy
          </h3>

          <label className="card-elevated flex-between" style={{ cursor: 'pointer' }}>
            <div>
              <strong>Require Explicit Consent Before Running Commands</strong>
              <div className="muted" style={{ fontSize: '0.79rem' }}>
                Prompts with command, cwd, and reversibility notes before spawning processes.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.requireCommandConsent}
              onChange={(e) => updateSettings({ requireCommandConsent: e.target.checked })}
            />
          </label>

          <label className="card-elevated flex-between" style={{ cursor: 'pointer' }}>
            <div>
              <strong>Auto-Redact Secrets in Logs & Copied Output</strong>
              <div className="muted" style={{ fontSize: '0.79rem' }}>
                Masks API keys, PATs, connection passwords, and PEM keys automatically.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.autoRedactSecrets}
              onChange={(e) => updateSettings({ autoRedactSecrets: e.target.checked })}
            />
          </label>

          <label className="card-elevated flex-between" style={{ cursor: 'pointer' }}>
            <div>
              <strong>Offline-Only Operation Mode</strong>
              <div className="muted" style={{ fontSize: '0.79rem' }}>
                Blocks external network calls while keeping core local editing, SQLite, Git & manifest tools active.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.offlineMode}
              onChange={(e) => updateSettings({ offlineMode: e.target.checked })}
            />
          </label>

          <label className="card-elevated flex-between" style={{ cursor: 'pointer' }}>
            <div>
              <strong>Anonymous Telemetry (Off by Default)</strong>
              <div className="muted" style={{ fontSize: '0.79rem' }}>
                DevBench collects zero telemetry unless explicitly enabled by the user.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.telemetryEnabled}
              onChange={(e) => updateSettings({ telemetryEnabled: e.target.checked })}
            />
          </label>

          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label>
              <div className="muted" style={{ fontSize: '0.79rem' }}>
                Update Channel
              </div>
              <select
                className="select"
                value={settings.updateChannel}
                onChange={(e) =>
                  updateSettings({
                    updateChannel: e.target.value as typeof settings.updateChannel,
                  })
                }
              >
                <option value="Stable">Stable Channel</option>
                <option value="Preview">Preview Channel</option>
                <option value="Manual Only">Manual Updates Only</option>
              </select>
            </label>

            <label>
              <div className="muted" style={{ fontSize: '0.79rem' }}>
                Default Terminal Shell
              </div>
              <select
                className="select"
                value={settings.preferredShell}
                onChange={(e) =>
                  updateSettings({
                    preferredShell: e.target.value as typeof settings.preferredShell,
                  })
                }
              >
                <option value="pwsh">PowerShell 7 (pwsh)</option>
                <option value="cmd">Command Prompt (cmd.exe)</option>
                <option value="vsdevcmd">VS 2022 Developer Prompt</option>
                <option value="git-bash">Git Bash</option>
                <option value="wsl">WSL 2</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Module Visibility & Lazy-Load Registry */}
      <div className="card stack-sm">
        <div className="flex-between">
          <div>
            <h3 style={{ margin: 0 }}>
              <Eye size={16} /> Per-Module Visibility & Lazy-Load Lifecycle
            </h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Hide modules you do not use so the sidebar stays clean; unvisited modules remain unloaded (`React.lazy`) until opened.
            </div>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Visible</th>
              <th>Module</th>
              <th>Memory State</th>
              <th>External Tools & Graceful Missing-Tool Fallback</th>
            </tr>
          </thead>
          <tbody>
            {CORE_MODULES.map((m) => {
              const visible = m.coreAlwaysVisible || !settings.hiddenModules.includes(m.id);
              const loaded = loadedModules.includes(m.id);
              return (
                <tr key={m.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={Boolean(m.coreAlwaysVisible)}
                      onChange={() => toggleHiddenModule(m.id)}
                      aria-label={`Show ${m.label} in sidebar`}
                    />
                  </td>
                  <td>
                    <strong>{m.label}</strong>{' '}
                    <span className="muted mono" style={{ fontSize: '0.75rem' }}>
                      ({m.shortcut})
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${loaded ? 'badge-success' : ''}`}>
                      {loaded ? 'Loaded' : 'Sleeping (Lazy)'}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>
                    {m.gracefulFallbackNote}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Backups & Recovery */}
      <div className="card stack-sm">
        <div className="flex-between">
          <div>
            <h3 style={{ margin: 0 }}>Local Settings Backups & Crash Recovery</h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Create timestamped recovery checkpoints before changing configurations.
            </div>
          </div>
          <div className="flex-row">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => createBackup()}>
              <Save size={13} /> Create Backup Snapshot
            </button>
            <button type="button" className="btn btn-sm" onClick={exportPersonalSettings}>
              <Download size={13} /> Export JSON
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={resetDefaultsSafely}>
              <RotateCcw size={13} /> Reset Defaults (Undoable)
            </button>
          </div>
        </div>

        {backups.length === 0 ? (
          <div className="muted" style={{ fontSize: '0.84rem' }}>
            No manual snapshots yet — click &ldquo;Create Backup Snapshot&rdquo; to save a checkpoint.
          </div>
        ) : (
          backups.map((b) => (
            <div key={b.id} className="card-elevated flex-between">
              <div>
                <strong>{b.label}</strong>
                <div className="muted mono" style={{ fontSize: '0.76rem' }}>
                  {b.createdAt} · Theme: {b.settings.theme} · Scale: {Math.round(b.settings.uiScale * 100)}%
                </div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => restoreBackup(b.id)}>
                Restore Snapshot
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SettingsModule;
