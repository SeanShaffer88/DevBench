import React, { useEffect, useState } from 'react';
import { Download, Hammer, PackageCheck, Play, Plus, RefreshCw, TerminalSquare, Trash2 } from 'lucide-react';
import { BUILD_SYSTEMS } from '../../shared/catalog/ecosystems';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

export const BuildRunModule: React.FC = () => {
  const {
    activeProject,
    updateActiveProject,
    relevantFirst,
    runCommandWithConsent,
    copySafeText,
    setDockOpen,
    notify,
  } = useWorkbench();

  const [runArgs, setRunArgs] = useState('--enable-high-dpi --log-level=info');
  const [runArch, setRunArch] = useState<'x64' | 'ARM64'>('x64');
  const [winContext, setWinContext] = useState<'standard' | 'sandbox' | 'elevated'>('standard');
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskCmd, setNewTaskCmd] = useState('');
  const [launchMatrix, setLaunchMatrix] = useState<{
    debuggerName: string;
    profiles: {
      id: string;
      label: string;
      configuration: string;
      architecture: 'x64' | 'ARM64';
      buildCommand: string;
      debuggerType: string;
      symbolFormat: string;
    }[];
    vscodeLaunchJson: Record<string, unknown>;
    cmakePresetsJson: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/build/launch-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: activeProject.name,
        language: activeProject.language,
        buildSystemId: activeProject.buildSystemId,
        programArgs: runArgs,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setLaunchMatrix(d);
      })
      .catch(() => {});
  }, [activeProject.name, activeProject.language, activeProject.buildSystemId, runArgs]);

  const activeBuild =
    BUILD_SYSTEMS.find((b) => b.id === activeProject.buildSystemId) || BUILD_SYSTEMS[0];

  const visibleBuildSystems = relevantFirst
    ? BUILD_SYSTEMS.filter(
        (b) => b.id === activeProject.buildSystemId || b.compatibleLanguages.includes(activeProject.language)
      )
    : BUILD_SYSTEMS;

  const addTaskShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskLabel.trim() || !newTaskCmd.trim()) return;
    updateActiveProject((p) => ({
      ...p,
      shortcuts: [
        ...p.shortcuts,
        { id: `sc-${Date.now()}`, label: newTaskLabel.trim(), command: newTaskCmd.trim(), category: 'custom' },
      ],
    }));
    setNewTaskLabel('');
    setNewTaskCmd('');
    notify('Added custom project task.');
  };

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Build, clean, rebuild & publish profiles, run configurations, and consent-gated task runner" />

      {/* Active Build Adapter Lifecycle Controls */}
      <div className="card stack-sm">
        <div className="flex-between">
          <div>
            <h3 style={{ margin: 0 }}>
              Active Build Adapter: {activeBuild.name} (`{activeBuild.binary}`)
            </h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Config markers: {activeBuild.configFiles.join(', ')}
            </div>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setDockOpen(true)}>
            <TerminalSquare size={14} /> Open Unified Output & Logs
          </button>
        </div>

        <div className="grid-4" style={{ marginTop: 4 }}>
          <div className="card-elevated stack-sm">
            <strong>Build ({runArch})</strong>
            <code className="mono muted" style={{ fontSize: '0.76rem' }}>
              {activeBuild.defaultCommands.build}
            </code>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() =>
                runCommandWithConsent({
                  label: `Build ${activeProject.name} (${runArch})`,
                  command: activeBuild.defaultCommands.build,
                  category: 'build',
                })
              }
            >
              <Hammer size={13} /> Build
            </button>
          </div>

          <div className="card-elevated stack-sm">
            <strong>Rebuild All</strong>
            <code className="mono muted" style={{ fontSize: '0.76rem' }}>
              {activeBuild.defaultCommands.rebuild}
            </code>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                runCommandWithConsent({
                  label: `Rebuild ${activeProject.name}`,
                  command: activeBuild.defaultCommands.rebuild,
                  category: 'build',
                })
              }
            >
              <RefreshCw size={13} /> Rebuild
            </button>
          </div>

          <div className="card-elevated stack-sm">
            <strong>Clean Outputs</strong>
            <code className="mono muted" style={{ fontSize: '0.76rem' }}>
              {activeBuild.defaultCommands.clean}
            </code>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                runCommandWithConsent({
                  label: `Clean ${activeProject.name}`,
                  command: activeBuild.defaultCommands.clean,
                  category: 'build',
                  reversibleNote: 'Deletes compiled intermediate artifacts; source files remain untouched.',
                })
              }
            >
              <Trash2 size={13} /> Clean
            </button>
          </div>

          <div className="card-elevated stack-sm">
            <strong>Publish Windows Package</strong>
            <code className="mono muted" style={{ fontSize: '0.76rem' }}>
              {activeBuild.defaultCommands.publish}
            </code>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() =>
                runCommandWithConsent({
                  label: `Publish Release (${runArch})`,
                  command: activeBuild.defaultCommands.publish,
                  category: 'build',
                })
              }
            >
              <PackageCheck size={13} /> Publish
            </button>
          </div>
        </div>
      </div>

      {/* Run Configurations & Task Runner */}
      <div className="grid-2">
        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>Run Configuration & Windows Launch Context</h3>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label>
              <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                Target Architecture
              </div>
              <select
                className="select"
                value={runArch}
                onChange={(e) => setRunArch(e.target.value as 'x64' | 'ARM64')}
              >
                <option value="x64">Windows x64 (amd64)</option>
                <option value="ARM64">Windows ARM64 (Snapdragon / Surface)</option>
              </select>
            </label>

            <label>
              <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                Windows Execution Context
              </div>
              <select
                className="select"
                value={winContext}
                onChange={(e) => setWinContext(e.target.value as typeof winContext)}
              >
                <option value="standard">Standard User (`asInvoker` — Safe Default)</option>
                <option value="sandbox">Isolated Windows Sandbox (`.wsb`)</option>
                <option value="elevated">Authorized Admin Elevation Prompt (UAC)</option>
              </select>
            </label>
          </div>

          <label>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 3 }}>
              Program Arguments
            </div>
            <input
              className="input mono"
              value={runArgs}
              onChange={(e) => setRunArgs(e.target.value)}
            />
          </label>

          <div className="card-elevated mono" style={{ fontSize: '0.78rem' }}>
            cwd: {activeProject.path} | env overrides: {activeProject.envVars.length} configured
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              runCommandWithConsent({
                label: `Launch ${activeProject.name} [${winContext}]`,
                command: `${activeBuild.defaultCommands.build} && echo "Ready with args: ${runArgs}"`,
                category: 'build',
                impactScope: winContext === 'elevated' ? 'System / Toolchain' : 'Local Project',
              })
            }
          >
            <Play size={14} /> Launch Configuration
          </button>
        </div>

        <div className="card stack-sm">
          <h3 style={{ margin: 0 }}>Project Task Runner & Custom Scripts</h3>
          <div className="stack-sm">
            {activeProject.shortcuts.map((sc) => (
              <div key={sc.id} className="card-elevated flex-between">
                <div>
                  <strong>{sc.label}</strong>{' '}
                  <span className="badge" style={{ fontSize: '0.7rem' }}>
                    {sc.category}
                  </span>
                  <div className="mono muted" style={{ fontSize: '0.77rem' }}>
                    {sc.command}
                  </div>
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

          <form onSubmit={addTaskShortcut} className="flex-row" style={{ marginTop: 6 }}>
            <input
              className="input"
              placeholder="Task label..."
              value={newTaskLabel}
              onChange={(e) => setNewTaskLabel(e.target.value)}
            />
            <input
              className="input mono"
              placeholder="Command (e.g. npm run build)"
              value={newTaskCmd}
              onChange={(e) => setNewTaskCmd(e.target.value)}
            />
            <button type="submit" className="btn btn-sm">
              <Plus size={13} /> Save
            </button>
          </form>
        </div>
      </div>

      {/* Cross-Architecture Build & Launch Matrix */}
      {launchMatrix && (
        <div className="card stack-sm">
          <div className="flex-between">
            <div>
              <h3 style={{ margin: 0 }}>
                Cross-Architecture Build & DAP Launch Matrix ({launchMatrix.debuggerName})
              </h3>
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                Generated Debug, Release, Sanitizer, and Publish profiles for Windows x64 and ARM64.
              </div>
            </div>
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void copySafeText(
                    '.vscode/launch.json',
                    JSON.stringify(launchMatrix.vscodeLaunchJson, null, 2)
                  )
                }
              >
                <Download size={13} /> Copy launch.json
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void copySafeText(
                    'CMakePresets.json',
                    JSON.stringify(launchMatrix.cmakePresetsJson, null, 2)
                  )
                }
              >
                <Download size={13} /> Copy CMakePresets.json
              </button>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Arch</th>
                <th>Symbols</th>
                <th>Build Command</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {launchMatrix.profiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.label}</strong>
                  </td>
                  <td>
                    <span className="badge badge-accent">{p.architecture}</span>
                  </td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>
                    {p.symbolFormat}
                  </td>
                  <td className="mono" style={{ fontSize: '0.78rem' }}>
                    {p.buildCommand}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        runCommandWithConsent({
                          label: `${activeProject.name}: ${p.label}`,
                          command: p.buildCommand,
                          category: 'build',
                        })
                      }
                    >
                      <Play size={12} /> Run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Adapter Matrix */}
      <div className="card stack-sm">
        <h3 style={{ margin: 0 }}>
          Build System Adapters ({visibleBuildSystems.length} shown — toggle filter at top for all{' '}
          {BUILD_SYSTEMS.length})
        </h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Build System</th>
              <th>CLI Binary</th>
              <th>Project Markers</th>
              <th>Default Publish Command</th>
            </tr>
          </thead>
          <tbody>
            {visibleBuildSystems.map((bs) => (
              <tr key={bs.id}>
                <td>
                  <strong>{bs.name}</strong>
                </td>
                <td className="mono">{bs.binary}</td>
                <td className="mono muted">{bs.configFiles.join(', ')}</td>
                <td className="mono" style={{ fontSize: '0.8rem' }}>
                  {bs.defaultCommands.publish}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BuildRunModule;
