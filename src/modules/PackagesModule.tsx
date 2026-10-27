import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Compass,
  FolderSearch,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import {
  BUILD_SYSTEMS,
  LANGUAGE_ADAPTERS,
  PACKAGE_MANAGERS,
  UI_FRAMEWORKS,
} from '../../shared/catalog/ecosystems';
import { DependencyItem, LanguageId } from '../../shared/types';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

export const PackagesModule: React.FC = () => {
  const {
    activeProject,
    updateActiveProject,
    relevantFirst,
    toolchains,
    pathEntries,
    hostPlatform,
    hostArch,
    refreshToolchains,
    runCommandWithConsent,
    triggerScanJob,
  } = useWorkbench();

  const [tab, setTab] = useState<'sdks' | 'ecosystems' | 'dependencies' | 'path'>('sdks');
  const [deps, setDeps] = useState<DependencyItem[]>([]);
  const [wizardLang, setWizardLang] = useState<LanguageId>(activeProject.language);
  const [pinKey, setPinKey] = useState('dotnet');
  const [pinVal, setPinVal] = useState('8.0.403');

  const [graphDir, setGraphDir] = useState<string>(
    activeProject.path.startsWith('workspaces/') ? activeProject.path : '.'
  );
  const [disallowCopyleft, setDisallowCopyleft] = useState(true);
  const [disallowUnknown, setDisallowUnknown] = useState(false);
  const [lockfileGraph, setLockfileGraph] = useState<{
    targetDir: string;
    detectedFiles: string[];
    totalPackages: number;
    directCount: number;
    transitiveCount: number;
    nodes: {
      id: string;
      name: string;
      version: string;
      ecosystem: string;
      depth: 'direct' | 'transitive';
      license: string;
      policyStatus: string;
    }[];
    edges: { from: string; to: string }[];
    licenseCounts: Record<string, number>;
    policyGate: {
      passed: boolean;
      violations: { pkg: string; license: string; reason: string }[];
    };
  } | null>(null);

  const loadLockfileGraph = (
    dir = graphDir,
    blockCopyleft = disallowCopyleft,
    blockUnknown = disallowUnknown
  ) => {
    fetch('/api/packages/lockfile-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetDir: dir || '.',
        disallowStrongCopyleft: blockCopyleft,
        disallowUnknownLicense: blockUnknown,
        maxNodes: 100,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (g) setLockfileGraph(g);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/security/dependencies')
      .then((r) => r.json())
      .then((d) => setDeps(d.dependencies || []))
      .catch(() => {});
    loadLockfileGraph('.', true, false);
  }, []);

  const visibleToolchains = relevantFirst
    ? [
        ...toolchains.filter((t) => t.compatibleLanguages.includes(activeProject.language)),
        ...toolchains.filter((t) => !t.compatibleLanguages.includes(activeProject.language)),
      ]
    : toolchains;

  const activePkgMgr =
    PACKAGE_MANAGERS.find((p) => p.id === activeProject.packageManagerId) || PACKAGE_MANAGERS[0];

  const selectedWizardAdapter =
    LANGUAGE_ADAPTERS.find((l) => l.id === wizardLang) || LANGUAGE_ADAPTERS[0];

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="SDK/compiler manager, decoupled language matrix, dependencies/licenses & PATH inspector" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'sdks' ? 'active' : ''}`}
          onClick={() => setTab('sdks')}
        >
          <Wrench size={14} /> Toolchains, SDKs & Version Pinning
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'ecosystems' ? 'active' : ''}`}
          onClick={() => setTab('ecosystems')}
        >
          <Compass size={14} /> Language & Framework Coverage Wizard
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'dependencies' ? 'active' : ''}`}
          onClick={() => setTab('dependencies')}
        >
          <Boxes size={14} /> Project Dependencies & Licenses ({deps.length})
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'path' ? 'active' : ''}`}
          onClick={() => setTab('path')}
        >
          <FolderSearch size={14} /> Environment & PATH Inspector ({pathEntries.length})
        </button>
      </div>

      {tab === 'sdks' && (
        <div className="stack-md">
          <div className="card flex-between">
            <div>
              <strong>Host Environment:</strong>{' '}
              <span className="badge badge-accent">
                {hostPlatform} ({hostArch})
              </span>{' '}
              <span className="muted" style={{ fontSize: '0.84rem' }}>
                Install, update, and removal commands are explicit, consent-gated, and paired with reversible uninstall steps.
              </span>
            </div>
            <div className="flex-row">
              <button type="button" className="btn btn-sm" onClick={refreshToolchains}>
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => triggerScanJob('toolchain-probe')}
              >
                Deep Background Probe
              </button>
            </div>
          </div>

          {/* Per-Project Version Pinning */}
          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>Per-Project Toolchain Version Selection — {activeProject.name}</h3>
              <div className="flex-row">
                <input
                  className="input mono"
                  style={{ width: 130 }}
                  placeholder="sdk (e.g. node)"
                  value={pinKey}
                  onChange={(e) => setPinKey(e.target.value)}
                />
                <input
                  className="input mono"
                  style={{ width: 120 }}
                  placeholder="version"
                  value={pinVal}
                  onChange={(e) => setPinVal(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    if (!pinKey.trim()) return;
                    updateActiveProject((p) => ({
                      ...p,
                      pinnedVersions: { ...p.pinnedVersions, [pinKey.trim()]: pinVal.trim() },
                    }));
                  }}
                >
                  Pin Version
                </button>
              </div>
            </div>
            <div className="flex-row" style={{ flexWrap: 'wrap' }}>
              {Object.entries(activeProject.pinnedVersions).map(([k, v]) => (
                <span key={k} className="badge badge-accent mono">
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SDK / Compiler / Tool</th>
                  <th>Category</th>
                  <th>Status & Detected Version</th>
                  <th>Explicit Windows Install / Removal Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleToolchains.map((t) => {
                  const isRelevant = t.compatibleLanguages.includes(activeProject.language);
                  return (
                    <tr
                      key={t.id}
                      style={{
                        background: isRelevant && relevantFirst ? 'var(--accent-soft)' : undefined,
                      }}
                    >
                      <td>
                        <strong>{t.name}</strong>{' '}
                        {isRelevant && <span className="badge badge-accent">Project Stack</span>}
                        <div className="mono muted" style={{ fontSize: '0.76rem' }}>
                          {t.path || t.binary}
                        </div>
                      </td>
                      <td>{t.category}</td>
                      <td>
                        {t.installed ? (
                          <span className="badge badge-success">
                            <CheckCircle2 size={12} /> {t.detectedVersion}
                          </span>
                        ) : (
                          <span className="badge badge-warn">
                            <AlertTriangle size={12} /> Missing
                          </span>
                        )}
                        <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                          {t.statusNote}
                        </div>
                      </td>
                      <td>
                        <div className="flex-row">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              runCommandWithConsent({
                                label: `Install / Update ${t.name}`,
                                command: t.installCommandWindows,
                                impactScope: 'System / Toolchain',
                                reversibleNote: `Reversible via: ${t.uninstallCommandWindows}`,
                              })
                            }
                          >
                            {t.installed ? 'Update' : 'Install'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              runCommandWithConsent({
                                label: `Remove ${t.name}`,
                                command: t.uninstallCommandWindows,
                                impactScope: 'System / Toolchain',
                                reversibleNote: `Reinstall anytime via: ${t.installCommandWindows}`,
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ecosystems' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>New Language Environment Setup Wizard</h3>
            <div className="muted" style={{ fontSize: '0.84rem' }}>
              Select any Windows desktop language or plugin ecosystem to inspect its decoupled UI frameworks, build tools, package managers, and setup command.
            </div>
            <select
              className="select"
              value={wizardLang}
              onChange={(e) => setWizardLang(e.target.value as LanguageId)}
            >
              {LANGUAGE_ADAPTERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {l.tier === 'first-class' ? 'Built-in Adapter' : 'Plugin-Defined Adapter'}
                </option>
              ))}
            </select>

            <div className="card-elevated stack-sm">
              <div className="flex-between">
                <strong>{selectedWizardAdapter.name}</strong>
                <span className="badge badge-accent">{selectedWizardAdapter.category}</span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {selectedWizardAdapter.windowsNotes}
              </p>
              <div style={{ fontSize: '0.82rem' }}>
                <strong>Project Files:</strong>{' '}
                <span className="mono">{selectedWizardAdapter.projectFiles.join(', ')}</span>
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <strong>Compatible Desktop UI Frameworks:</strong>{' '}
                {selectedWizardAdapter.supportedUIFrameworks
                  .map((uid) => UI_FRAMEWORKS.find((u) => u.id === uid)?.name || uid)
                  .join(' · ') || 'Custom / Plugin GUI'}
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <strong>Build Systems:</strong>{' '}
                {selectedWizardAdapter.supportedBuildSystems
                  .map((bid) => BUILD_SYSTEMS.find((b) => b.id === bid)?.name || bid)
                  .join(' · ') || 'Plugin Build Script'}
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <strong>Key Workflows:</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  {selectedWizardAdapter.desktopWorkflows.map((wf) => (
                    <li key={wf}>{wf}</li>
                  ))}
                </ul>
              </div>
              <div className="card-elevated mono" style={{ fontSize: '0.78rem' }}>
                {selectedWizardAdapter.installHintWindows}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  runCommandWithConsent({
                    label: `Setup ${selectedWizardAdapter.name} Environment`,
                    command: selectedWizardAdapter.installHintWindows,
                    impactScope: 'System / Toolchain',
                  })
                }
              >
                Run Consented Environment Setup
              </button>
            </div>
          </div>

          <div className="card stack-sm" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0 }}>
              Complete Desktop UI Framework Registry ({UI_FRAMEWORKS.length})
            </h3>
            {UI_FRAMEWORKS.map((ui) => (
              <div key={ui.id} className="card-elevated stack-sm">
                <div className="flex-between">
                  <strong>{ui.name}</strong>
                  <span className="badge">{ui.windowsTargetType}</span>
                </div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {ui.summary}
                </div>
                <div className="flex-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  <span className="badge badge-success">DPI: {ui.dpiSupport}</span>
                  {ui.packagingFormats.map((pf) => (
                    <span key={pf} className="badge" style={{ fontSize: '0.7rem' }}>
                      {pf}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'dependencies' && (
        <div className="stack-md">
          <div className="card stack-sm">
            <div className="flex-between">
              <div>
                <h3 style={{ margin: 0 }}>
                  Multi-Ecosystem Lockfile Dependency Graph & License Policy Gate
                </h3>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  Parses <code>package-lock.json</code>, <code>Cargo.lock</code>,{' '}
                  <code>packages.lock.json</code> / <code>*.csproj</code>, <code>uv.lock</code>, and{' '}
                  <code>vcpkg.json</code> into direct + transitive dependency graphs.
                </div>
              </div>
              {lockfileGraph && (
                <span
                  className={`badge ${
                    lockfileGraph.policyGate.passed ? 'badge-success' : 'badge-danger'
                  }`}
                >
                  {lockfileGraph.policyGate.passed
                    ? 'POLICY GATE: PASS'
                    : `POLICY GATE: ${lockfileGraph.policyGate.violations.length} VIOLATION(S)`}
                </span>
              )}
            </div>

            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input
                aria-label="Lockfile graph target directory"
                className="input mono"
                style={{ maxWidth: 260 }}
                value={graphDir}
                onChange={(e) => setGraphDir(e.target.value)}
                placeholder=". or workspaces/my-app"
              />
              <label className="flex-row" style={{ fontSize: '0.82rem', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={disallowCopyleft}
                  onChange={(e) => {
                    setDisallowCopyleft(e.target.checked);
                    loadLockfileGraph(graphDir, e.target.checked, disallowUnknown);
                  }}
                />
                Block Strong Copyleft (GPL/AGPL)
              </label>
              <label className="flex-row" style={{ fontSize: '0.82rem', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={disallowUnknown}
                  onChange={(e) => {
                    setDisallowUnknown(e.target.checked);
                    loadLockfileGraph(graphDir, disallowCopyleft, e.target.checked);
                  }}
                />
                Block Unknown SPDX License
              </label>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => loadLockfileGraph(graphDir, disallowCopyleft, disallowUnknown)}
              >
                <RefreshCw size={13} /> Analyze Lockfile Graph
              </button>
            </div>

            {lockfileGraph && (
              <div className="stack-sm">
                <div className="flex-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span className="badge badge-accent">
                    Manifests: {lockfileGraph.detectedFiles.join(', ') || 'None'}
                  </span>
                  <span className="badge">
                    Direct: {lockfileGraph.directCount} · Transitive: {lockfileGraph.transitiveCount}
                  </span>
                  <span className="badge">Graph Edges: {lockfileGraph.edges.length}</span>
                  {Object.entries(lockfileGraph.licenseCounts).map(([lic, cnt]) => (
                    <span key={lic} className="badge badge-success">
                      {lic}: {cnt}
                    </span>
                  ))}
                </div>

                {lockfileGraph.policyGate.violations.length > 0 && (
                  <div className="card-elevated" style={{ borderLeft: '3px solid var(--danger)' }}>
                    <strong style={{ fontSize: '0.82rem' }}>License Policy Violations:</strong>
                    <ul style={{ margin: '4px 0 0 18px', fontSize: '0.8rem' }}>
                      {lockfileGraph.policyGate.violations.slice(0, 6).map((v) => (
                        <li key={v.pkg}>
                          <code>{v.pkg}</code> ({v.license}) — {v.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {lockfileGraph.edges.length > 0 && (
                  <div style={{ fontSize: '0.78rem' }} className="muted mono">
                    Sample Edges:{' '}
                    {lockfileGraph.edges
                      .slice(0, 6)
                      .map((e) => `${e.from.split(':')[1]} → ${e.to.split(':')[1]}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card flex-between">
            <div>
              <strong>Active Package Manager Adapter: {activePkgMgr.name}</strong>
              <div className="muted" style={{ fontSize: '0.83rem' }}>
                Manifests: {activePkgMgr.manifestFiles.join(', ')}
              </div>
            </div>
            <div className="flex-row">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  runCommandWithConsent({
                    label: `${activePkgMgr.name}: Check Outdated`,
                    command: activePkgMgr.commands.outdated,
                    category: 'scan',
                  })
                }
              >
                Check Outdated
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  runCommandWithConsent({
                    label: `${activePkgMgr.name}: Vulnerability Audit`,
                    command: activePkgMgr.commands.audit,
                    category: 'scan',
                  })
                }
              >
                <ShieldAlert size={13} /> Run Advisory Audit
              </button>
            </div>
          </div>

          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Installed Version</th>
                  <th>Scope</th>
                  <th>License</th>
                  <th>Policy / Advisory</th>
                </tr>
              </thead>
              <tbody>
                {deps.map((d) => (
                  <tr key={d.name}>
                    <td className="mono">
                      <strong>{d.name}</strong>
                    </td>
                    <td className="mono">{d.currentVersion}</td>
                    <td>
                      <span className="badge">{d.devDependency ? 'devDependency' : 'runtime'}</span>
                    </td>
                    <td>
                      <span className="badge badge-success">{d.license}</span>
                    </td>
                    <td className="muted">
                      {d.licenseWarning || 'Permissive — Approved for desktop distribution'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'path' && (
        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>Host `PATH` Directory Health & Duplicate Inspector</h3>
          <div className="muted" style={{ fontSize: '0.84rem' }}>
            Flags broken missing directories and duplicate entries that slow command lookup or shadow SDK versions.
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Directory Path</th>
                <th>Exists on Disk</th>
                <th>Duplicate Check</th>
              </tr>
            </thead>
            <tbody>
              {pathEntries.map((pe) => (
                <tr key={`${pe.index}-${pe.path}`}>
                  <td className="muted">{pe.index}</td>
                  <td className="mono">{pe.path}</td>
                  <td>
                    {pe.exists ? (
                      <span className="badge badge-success">Exists</span>
                    ) : (
                      <span className="badge badge-warn">Missing Dir</span>
                    )}
                  </td>
                  <td>
                    {pe.duplicate ? (
                      <span className="badge badge-warn">Shadowed Duplicate</span>
                    ) : (
                      <span className="muted">Unique</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PackagesModule;
