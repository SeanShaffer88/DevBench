import React, { useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useWorkbench } from '../context/WorkbenchContext';

const SHORTCUTS = [
  { keys: 'Ctrl + K', scope: 'Global', action: 'Open Universal Search & Command Palette' },
  { keys: 'Ctrl + B', scope: 'Global', action: 'Collapse / Expand Module Sidebar' },
  { keys: 'Ctrl + J', scope: 'Global', action: 'Toggle Unified Output, Jobs & Terminal Dock' },
  { keys: 'Ctrl + /', scope: 'Global', action: 'Open Keyboard Shortcut Finder' },
  { keys: 'Ctrl + ,', scope: 'Global', action: 'Open Settings, Accessibility & Reliability' },
  { keys: 'Alt + 1..9, 0, -, =', scope: 'Navigation', action: 'Jump directly to Home, Projects, Code, Build, Test, Debug, Git, Packages, APIs, Windows, Security, Team' },
  { keys: 'Ctrl + S', scope: 'Code Editor', action: 'Save active open file to workspace' },
  { keys: 'Esc', scope: 'Dialogs', action: 'Close Command Palette or Shortcut Modal' },
];

export const ShortcutModal: React.FC = () => {
  const { shortcutsOpen, setShortcutsOpen } = useWorkbench();
  const [filter, setFilter] = useState('');

  if (!shortcutsOpen) return null;

  const list = SHORTCUTS.filter(
    (s) =>
      !filter ||
      s.keys.toLowerCase().includes(filter.toLowerCase()) ||
      s.action.toLowerCase().includes(filter.toLowerCase()) ||
      s.scope.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div
      className="modal-backdrop"
      onClick={() => setShortcutsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcut Finder"
    >
      <div className="modal-panel" style={{ maxWidth: 620, padding: 18 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="flex-row">
            <Keyboard size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Keyboard Shortcut Finder</h2>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setShortcutsOpen(false)}>
            <X size={14} />
          </button>
        </div>

        <input
          className="input"
          placeholder="Search shortcut or action..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ marginBottom: 12 }}
          autoFocus
        />

        <div style={{ overflowY: 'auto', maxHeight: '55vh' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Key Binding</th>
                <th>Scope</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.keys}>
                  <td>
                    <span className="badge mono">{s.keys}</span>
                  </td>
                  <td className="muted">{s.scope}</td>
                  <td>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
