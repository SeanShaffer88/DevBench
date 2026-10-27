import React from 'react';
import { Filter, Layers3 } from 'lucide-react';
import {
  BUILD_SYSTEMS,
  LANGUAGE_ADAPTERS,
  PACKAGE_MANAGERS,
  UI_FRAMEWORKS,
} from '../../shared/catalog/ecosystems';
import { useWorkbench } from '../context/WorkbenchContext';

export const RelevanceBanner: React.FC<{ subtitle?: string }> = ({ subtitle }) => {
  const { activeProject, relevantFirst, setRelevantFirst } = useWorkbench();

  const lang = LANGUAGE_ADAPTERS.find((l) => l.id === activeProject.language);
  const ui = UI_FRAMEWORKS.find((u) => u.id === activeProject.uiFrameworkId);
  const build = BUILD_SYSTEMS.find((b) => b.id === activeProject.buildSystemId);
  const pkg = PACKAGE_MANAGERS.find((p) => p.id === activeProject.packageManagerId);

  return (
    <div
      className="card-elevated flex-between"
      style={{ marginBottom: 14, padding: '9px 14px' }}
      aria-label="Active Project Adapter Context"
    >
      <div className="flex-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <Layers3 size={15} style={{ color: 'var(--accent)' }} />
        <strong style={{ fontSize: '0.88rem' }}>{activeProject.name}:</strong>
        {lang && <span className="badge badge-accent">Lang: {lang.name}</span>}
        {ui && <span className="badge">UI: {ui.name}</span>}
        {build && <span className="badge">Build: {build.name}</span>}
        {pkg && <span className="badge">Pkg: {pkg.name}</span>}
        <span className="badge">Arch: {activeProject.targetArchitectures.join(', ')}</span>
        {subtitle && (
          <span className="muted" style={{ fontSize: '0.82rem', marginLeft: 4 }}>
            — {subtitle}
          </span>
        )}
      </div>

      <button
        type="button"
        className={`btn btn-sm ${relevantFirst ? 'btn-primary' : ''}`}
        onClick={() => setRelevantFirst(!relevantFirst)}
        title="Toggle between prioritizing active project tools vs showing all 13+ language ecosystems"
      >
        <Filter size={13} />
        <span>{relevantFirst ? 'Project-Relevant First' : 'Showing All Ecosystems'}</span>
      </button>
    </div>
  );
};
