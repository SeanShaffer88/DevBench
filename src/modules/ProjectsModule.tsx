import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  Code2,
  Download,
  Eye,
  FileCode2,
  FolderOpen,
  FolderPlus,
  GitFork,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
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
import {
  LanguageId,
  ProjectWorkspace,
  ScaffoldedWorkspaceItem,
  ScaffoldPreviewResponse,
} from '../../shared/types';
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
    openFileInEditor,
    createBackup,
    notify,
  } = useWorkbench();

  const [tab, setTab] = useState<'overview' | 'wizard' | 'env' | 'profiles'>('overview');
  const [showArchived, setShowArchived] = useState(false);

  // On-disk scaffolded workspaces state
  const [scaffoldedDiskList, setScaffoldedDiskList] = useState<ScaffoldedWorkspaceItem[]>([]);
  const [expandedDiskSlug, setExpandedDiskSlug] = useState<string | null>(null);

  // New-Project Wizard & Real Disk Scaffolder state
  const [tplSearch, setTplSearch] = useState('');
  const [selectedTplId, setSelectedTplId] = useState(STARTER_TEMPLATES[0].id);
  const [projName, setProjName] = useState('AuroraWinClient');
  const [companyName, setCompanyName] = useState('Contoso Desktop Engineering');
  const [packageIdentifier, setPackageIdentifier] = useState('');
  const [accentHex, setAccentHex] = useState('#0284c7');
  const [customLang, setCustomLang] = useState<LanguageId>('csharp');
  const [customUi, setCustomUi] = useState('winui3');
  const [customBuild, setCustomBuild] = useState('msbuild-dotnet');
  const [customPkg, setCustomPkg] = useState('nuget');
  const [targetArchs, setTargetArchs] = useState<('x64' | 'ARM64')[]>(['x64', 'ARM64']);
  const [winSdkTarget, setWinSdkTarget] = useState('10.0.22621.0');

  // Granular file-generation flags
  const [scaffoldToDisk, setScaffoldToDisk] = useState(true);
  const [includeWin32Manifest, setIncludeWin32Manifest] = useState(true);
  const [includeMsixManifest, setIncludeMsixManifest] = useState(true);
  const [includeBinaryIconAndRc, setIncludeBinaryIconAndRc] = useState(true);
  const [includeUnitTests, setIncludeUnitTests] = useState(true);
  const [includeBuildScripts, setIncludeBuildScripts] = useState(true);
  const [includeGitScaffold, setIncludeGitScaffold] = useState(true);
  const [initGitRepo, setInitGitRepo] = useState(false);
  const [allowOverwrite, setAllowOverwrite] = useState(false);

  // Live scaffold preview state
  const [scaffoldPreview, setScaffoldPreview] = useState<ScaffoldPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<string>('');

  // Clone helper
  const [cloneUrl, setCloneUrl] = useState('https://github.com/SeanShaffer88/DevBench.git');

  // Env var state
  const [envKey, setEnvKey] = useState('');
  const [envVal, setEnvVal] = useState('');
  const [envSecret, setEnvSecret] = useState(false);

  // Import state
  const [importJson, setImportJson] = useState('');

  const refreshScaffoldedWorkspaces = useCallback(async () => {
    try {
      const r = await fetch('/api/projects/scaffolded');
      if (!r.ok) return;
      const d = await r.json();
      setScaffoldedDiskList(d.workspaces || []);
    } catch {
      // ignore offline
    }
  }, []);

  useEffect(() => {
    refreshScaffoldedWorkspaces();
  }, [refreshScaffoldedWorkspaces]);

  const currentScaffoldPayload = useMemo(
    () => ({
      templateId: selectedTplId,
      projectName: projName,
      companyName,
      packageIdentifier: packageIdentifier.trim() || undefined,
      accentHex,
      language: customLang,
      uiFrameworkId: customUi,
      buildSystemId: customBuild,
      packageManagerId: customPkg,
      targetArchitectures: targetArchs.length > 0 ? targetArchs : (['x64'] as ('x64' | 'ARM64')[]),
      windowsSdkTarget: winSdkTarget,
      includeWin32Manifest,
      includeMsixManifest,
      includeBinaryIconAndRc,
      includeUnitTests,
      includeBuildScripts,
      includeGitScaffold,
      initGitRepo,
    }),
    [
      selectedTplId,
      projName,
      companyName,
      packageIdentifier,
      accentHex,
      customLang,
      customUi,
      customBuild,
      customPkg,
      targetArchs,
      winSdkTarget,
      includeWin32Manifest,
      includeMsixManifest,
      includeBinaryIconAndRc,
      includeUnitTests,
      includeBuildScripts,
      includeGitScaffold,
      initGitRepo,
    ]
  );

  // Fetch dry-run scaffold preview whenever wizard inputs change
  useEffect(() => {
    if (tab !== 'wizard') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/projects/scaffold/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentScaffoldPayload),
        });
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setPreviewError(d.error || 'Invalid scaffold parameters');
          setScaffoldPreview(null);
          return;
        }
        setPreviewError(null);
        setScaffoldPreview(d);
        setSelectedPreviewFile((prev) =>
          d.files?.some((f: { relativePath: string }) => f.relativePath === prev)
            ? prev
            : d.files?.[0]?.relativePath || ''
        );
      } catch (err) {
        if (!cancelled) setPreviewError((err as Error).message);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, currentScaffoldPayload]);

  const handleSelectTemplate = (tplId: string) => {
    setSelectedTplId(tplId);
    const tpl = STARTER_TEMPLATES.find((t) => t.id === tplId);
    if (tpl) {
      setCustomLang(tpl.language);
      setCustomUi(tpl.uiFrameworkId);
      setCustomBuild(tpl.buildSystemId);
      setCustomPkg(tpl.packageManagerId);
      setTargetArchs([...tpl.recommendedArchitectures]);
    }
  };

  const toggleTargetArch = (arch: 'x64' | 'ARM64') => {
    setTargetArchs((prev) => {
      if (prev.includes(arch)) {
        return prev.length > 1 ? prev.filter((a) => a !== arch) : prev;
      }
      return [...prev, arch];
    });
  };

  const createNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = projName.trim() || 'NewWindowsApp';
    const tpl = STARTER_TEMPLATES.find((t) => t.id === selectedTplId);

    if (!scaffoldToDisk) {
      const runner =
        TEST_RUNNERS.find((r) => r.compatibleLanguages.includes(customLang))?.id || 'vitest';
      const dbg =
        DEBUGGER_ADAPTERS.find((d) => d.compatibleLanguages.includes(customLang))?.id ||
        'node-inspector';
      const langObj = LANGUAGE_ADAPTERS.find((l) => l.id === customLang);
      const uiObj = UI_FRAMEWORKS.find((u) => u.id === customUi);

      const virtualProj: ProjectWorkspace = {
        id: `proj-${Date.now()}`,
        name: cleanName,
        path: `C:\\Projects\\${cleanName}`,
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
        targetArchitectures: targetArchs,
        windowsSdkTarget: winSdkTarget,
        notes: `Virtual workspace profile (${tpl?.name || 'Custom Stack'}).`,
        docLinks: [],
        bookmarks: [],
        todos: [
          {
            id: `t-${Date.now()}`,
            text: 'Verify SDK & manifest configuration',
            done: false,
            tag: 'Setup',
          },
        ],
        shortcuts: [
          {
            id: `sc-${Date.now()}`,
            label: 'Default Build',
            command:
              BUILD_SYSTEMS.find((b) => b.id === customBuild)?.defaultCommands.build || 'echo Build',
            category: 'build',
          },
        ],
        envVars: [],
      };
      setProjects((prev) => [virtualProj, ...prev]);
      setActiveProjectId(virtualProj.id);
      setTab('overview');
      notify(`Created virtual project profile "${cleanName}"`);
      return;
    }

    if (previewError || !scaffoldPreview) {
      notify(previewError || 'Please resolve validation issues before scaffolding.');
      return;
    }

    if (scaffoldPreview.alreadyExists && scaffoldPreview.existingFileCount > 0 && !allowOverwrite) {
      notify(
        `Folder ${scaffoldPreview.targetDir} already exists. Check "Allow overwriting existing folder" or choose another name.`
      );
      return;
    }

    requestConsent(
      {
        id: `scaf-${Date.now()}`,
        title: `Scaffold ${scaffoldPreview.totalFiles} Project Files to Disk (${scaffoldPreview.targetDir})`,
        actionType: 'file-mutate',
        description: `Creates "${scaffoldPreview.targetDir}" with ${scaffoldPreview.totalFiles} parameterized starter files (${(
          scaffoldPreview.totalBytes / 1024
        ).toFixed(1)} KB)${initGitRepo ? ' and initializes a local Git repository' : ''}.`,
        commandPreview: `mkdir -p ${scaffoldPreview.targetDir} && write ${scaffoldPreview.totalFiles} files (${scaffoldPreview.files
          .slice(0, 4)
          .map((f) => f.relativePath)
          .join(', ')}${scaffoldPreview.totalFiles > 4 ? ', ...' : ''})${initGitRepo ? ' && git init' : ''}`,
        cwd: scaffoldPreview.targetDir,
        impactScope: 'Local Project',
        reversibleNote: `Use the one-click "Delete / Rollback" button on ${scaffoldPreview.targetDir} in Projects -> Workspace Projects at any time.`,
      },
      async () => {
        const r = await fetch('/api/projects/scaffold/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...currentScaffoldPayload,
            consentConfirmed: true,
            overwrite: allowOverwrite,
          }),
        });
        const d = await r.json();
        if (!r.ok) {
          notify(`Scaffold failed: ${d.error || 'Unknown error'}`);
          return;
        }
        const createdProj: ProjectWorkspace = d.workspaceProject;
        setProjects((prev) => [
          createdProj,
          ...prev.filter((p) => p.path !== createdProj.path),
        ]);
        setActiveProjectId(createdProj.id);
        await refreshScaffoldedWorkspaces();
        setTab('overview');
        notify(
          `Scaffolded ${d.preview.totalFiles} files into ${d.preview.targetDir} and activated "${createdProj.name}"!`
        );
      }
    );
  };

  const handleDeleteScaffoldedDisk = (item: ScaffoldedWorkspaceItem) => {
    requestConsent(
      {
        id: `del-scaf-${Date.now()}`,
        title: `Remove Scaffolded Directory ${item.workspaceDir}`,
        actionType: 'file-mutate',
        description: `Permanently deletes ${item.fileCount} scaffolded files (${(
          item.totalBytes / 1024
        ).toFixed(1)} KB) inside ${item.workspaceDir}.`,
        commandPreview: `rm -rf ${item.workspaceDir}`,
        impactScope: 'Local Project',
        reversibleNote: 'You can re-scaffold the template from the New-Project Wizard at any time.',
      },
      async () => {
        const r = await fetch('/api/projects/scaffolded/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: item.slug, consentConfirmed: true }),
        });
        const d = await r.json();
        if (!r.ok) {
          notify(`Delete failed: ${d.error}`);
          return;
        }
        setProjects((prev) => prev.filter((p) => p.path !== item.workspaceDir));
        await refreshScaffoldedWorkspaces();
        notify(`Removed ${d.deleted}`);
      }
    );
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

  const filteredTemplates = useMemo(() => {
    const q = tplSearch.trim().toLowerCase();
    if (!q) return STARTER_TEMPLATES;
    return STARTER_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        t.uiFrameworkId.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [tplSearch]);

  const compatibleDetectedTools = toolchains.filter(
    (t) => t.installed && t.compatibleLanguages.includes(customLang)
  );

  const activePreviewFileObj =
    scaffoldPreview?.files.find((f) => f.relativePath === selectedPreviewFile) ||
    scaffoldPreview?.files[0] ||
    null;

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Multi-project workspace, real 15-language disk scaffolder, profiles & portable config" />

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
          <FolderPlus size={14} /> New-Project Wizard & Disk Scaffolder
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
            <div className="flex-row">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setTab('wizard')}
              >
                <FolderPlus size={14} /> Scaffold New Project
              </button>
              <label className="flex-row" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <span>Show Archived</span>
              </label>
            </div>
          </div>

          {scaffoldedDiskList.length > 0 && (
            <div className="card stack-sm">
              <div className="flex-between">
                <div className="flex-row">
                  <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
                  <strong>Scaffolded Projects on Disk (`workspaces/`)</strong>
                  <span className="badge badge-success">{scaffoldedDiskList.length} on disk</span>
                </div>
                <button type="button" className="btn btn-sm" onClick={refreshScaffoldedWorkspaces}>
                  <RefreshCw size={13} /> Refresh Disk
                </button>
              </div>

              <div className="grid-2">
                {scaffoldedDiskList.map((sw) => (
                  <div key={sw.slug} className="card-elevated stack-sm">
                    <div className="flex-between">
                      <div>
                        <strong>{sw.name}</strong>{' '}
                        <span className="badge badge-accent">{sw.language}</span>{' '}
                        {sw.gitInitialized && <span className="badge badge-success">.git</span>}
                        <div className="muted mono" style={{ fontSize: '0.76rem', marginTop: 2 }}>
                          {sw.workspaceDir} · {sw.fileCount} files · {(sw.totalBytes / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex-row">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => openFileInEditor(sw.entryFile, 1)}
                          title="Open generated entry file in Code Editor"
                        >
                          <Code2 size={13} /> Open Entry
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            setExpandedDiskSlug((prev) => (prev === sw.slug ? null : sw.slug))
                          }
                        >
                          {expandedDiskSlug === sw.slug ? 'Hide Files' : 'Files'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteScaffoldedDisk(sw)}
                          title="Delete / Rollback scaffolded folder"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {expandedDiskSlug === sw.slug && (
                      <div
                        className="flex-row"
                        style={{ flexWrap: 'wrap', gap: 5, paddingTop: 4 }}
                      >
                        {sw.files.map((rel) => (
                          <button
                            key={rel}
                            type="button"
                            className="btn btn-sm mono"
                            style={{ fontSize: '0.74rem' }}
                            onClick={() => openFileInEditor(`${sw.workspaceDir}/${rel}`, 1)}
                          >
                            <FileCode2 size={12} /> {rel}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
        <div className="stack-md">
          <div className="grid-2">
            {/* Step 1: 15-Language Template Picker */}
            <div className="card stack-sm" style={{ maxHeight: 740, overflowY: 'auto' }}>
              <div className="flex-between">
                <h3 style={{ margin: 0 }}>1. Choose Starter Template ({filteredTemplates.length}/15)</h3>
              </div>
              <div className="flex-row">
                <Search size={14} className="muted" />
                <input
                  className="input"
                  placeholder="Filter by language, UI framework (WinUI, Qt, Tauri, PySide6, Flutter...)"
                  value={tplSearch}
                  onChange={(e) => setTplSearch(e.target.value)}
                />
              </div>

              <div className="stack-sm">
                {filteredTemplates.map((tpl) => (
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
                    <div className="muted" style={{ fontSize: '0.79rem', marginTop: 3 }}>
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Parameterized Stack & Disk Scaffolder Options */}
            <form onSubmit={createNewProject} className="card stack-sm">
              <h3 style={{ margin: 0 }}>2. Configure Stack, Manifests & Disk Generator</h3>
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                Generates real project directories, entry-point code, build scripts, `.gitignore`, binary `.ico`/`.rc`, and Windows manifests onto disk with user consent.
              </div>

              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label>
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>Project Name</div>
                  <input
                    className="input"
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>Company / Publisher CN</div>
                  <input
                    className="input"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid-3" style={{ gridTemplateColumns: '1fr 150px 74px' }}>
                <label>
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                    Package / Namespace ID (optional)
                  </div>
                  <input
                    className="input mono"
                    placeholder="Auto-derived from Company.Project"
                    value={packageIdentifier}
                    onChange={(e) => setPackageIdentifier(e.target.value)}
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>Windows SDK</div>
                  <select
                    className="select mono"
                    value={winSdkTarget}
                    onChange={(e) => setWinSdkTarget(e.target.value)}
                  >
                    <option value="10.0.22621.0">10.0.22621.0 (22H2)</option>
                    <option value="10.0.26100.0">10.0.26100.0 (24H2)</option>
                    <option value="10.0.19041.0">10.0.19041.0 (Win10)</option>
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>`.ico` Color</div>
                  <input
                    type="color"
                    value={accentHex}
                    onChange={(e) => setAccentHex(e.target.value)}
                    style={{ width: '100%', height: 34, border: 'none', background: 'none' }}
                  />
                </label>
              </div>

              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label>
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>Language Adapter</div>
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
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>Desktop UI Framework</div>
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
              </div>

              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label>
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>Build System</div>
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
                  <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>Package Manager</div>
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

              <div className="flex-row" style={{ gap: 16 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Target Architectures:</span>
                {(['x64', 'ARM64'] as const).map((arch) => (
                  <label key={arch} className="flex-row" style={{ cursor: 'pointer', fontSize: '0.83rem' }}>
                    <input
                      type="checkbox"
                      checked={targetArchs.includes(arch)}
                      onChange={() => toggleTargetArch(arch)}
                    />
                    <span>{arch}</span>
                  </label>
                ))}
              </div>

              {/* Granular File Generator Checkboxes */}
              <div className="card-elevated stack-sm" style={{ fontSize: '0.82rem' }}>
                <label className="flex-row" style={{ cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={scaffoldToDisk}
                    onChange={(e) => setScaffoldToDisk(e.target.checked)}
                  />
                  <span>
                    Scaffold real project directory & files onto disk (`
                    {scaffoldPreview?.targetDir || `workspaces/${projName || 'App'}`}`)
                  </span>
                </label>

                {scaffoldToDisk && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px 12px',
                      paddingTop: 4,
                    }}
                  >
                    <label className="flex-row" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeWin32Manifest}
                        onChange={(e) => setIncludeWin32Manifest(e.target.checked)}
                      />
                      <span>Win32 `app.manifest` (PerMonitorV2)</span>
                    </label>
                    <label className="flex-row" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeMsixManifest}
                        onChange={(e) => setIncludeMsixManifest(e.target.checked)}
                      />
                      <span>MSIX `Package.appxmanifest`</span>
                    </label>
                    <label className="flex-row" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeBinaryIconAndRc}
                        onChange={(e) => setIncludeBinaryIconAndRc(e.target.checked)}
                      />
                      <span>Binary `assets/app.ico` + `app.rc`</span>
                    </label>
                    <label className="flex-row" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeUnitTests}
                        onChange={(e) => setIncludeUnitTests(e.target.checked)}
                      />
                      <span>Starter Unit Test Suite</span>
                    </label>
                    <label className="flex-row" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeBuildScripts}
                        onChange={(e) => setIncludeBuildScripts(e.target.checked)}
                      />
                      <span>PowerShell `build-windows.ps1`</span>
                    </label>
                    <label className="flex-row" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeGitScaffold}
                        onChange={(e) => setIncludeGitScaffold(e.target.checked)}
                      />
                      <span>`.gitignore` + CRLF `.gitattributes`</span>
                    </label>
                    <label className="flex-row" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={initGitRepo}
                        onChange={(e) => setInitGitRepo(e.target.checked)}
                      />
                      <span>Initialize Git repo (`git init`)</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="card-elevated" style={{ fontSize: '0.8rem' }}>
                <strong>Host Toolchain Check:</strong>{' '}
                {compatibleDetectedTools.length > 0 ? (
                  <span>
                    Detected:{' '}
                    {compatibleDetectedTools.map((t) => `${t.name} (${t.detectedVersion})`).join(', ')}
                  </span>
                ) : (
                  <span className="muted">
                    Target SDK not currently on host PATH — files will still scaffold cleanly on disk with setup guidance in Home & Packages.
                  </span>
                )}
              </div>

              {previewError && (
                <div className="card-elevated" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: '0.82rem' }}>
                  <AlertTriangle size={14} /> {previewError}
                </div>
              )}

              {scaffoldToDisk && scaffoldPreview?.alreadyExists && scaffoldPreview.existingFileCount > 0 && (
                <div className="card-elevated stack-sm" style={{ borderColor: 'var(--warning)', fontSize: '0.82rem' }}>
                  <div className="flex-row" style={{ color: 'var(--warning)' }}>
                    <AlertTriangle size={14} />
                    <strong>
                      Target directory `{scaffoldPreview.targetDir}` already contains {scaffoldPreview.existingFileCount} file(s).
                    </strong>
                  </div>
                  <label className="flex-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allowOverwrite}
                      onChange={(e) => setAllowOverwrite(e.target.checked)}
                    />
                    <span>Allow overwriting files in `{scaffoldPreview.targetDir}`</span>
                  </label>
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={Boolean(previewError)}>
                <Plus size={15} />{' '}
                {scaffoldToDisk
                  ? `Scaffold ${scaffoldPreview?.totalFiles || ''} Files to Disk (Consent Required)`
                  : 'Create Virtual Project Profile'}
              </button>
            </form>
          </div>

          {/* Step 3: Live Dry-Run File Tree & Generated Content Inspector */}
          {scaffoldToDisk && scaffoldPreview && (
            <div className="card stack-sm">
              <div className="flex-between">
                <div className="flex-row">
                  <Eye size={16} style={{ color: 'var(--accent)' }} />
                  <h3 style={{ margin: 0 }}>
                    3. Dry-Run File Tree Preview — `{scaffoldPreview.targetDir}/`
                  </h3>
                </div>
                <div className="flex-row">
                  <span className="badge badge-accent">{scaffoldPreview.totalFiles} Files</span>
                  <span className="badge">{(scaffoldPreview.totalBytes / 1024).toFixed(1)} KB Total</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
                <div
                  className="stack-sm"
                  style={{ maxHeight: 310, overflowY: 'auto', paddingRight: 4 }}
                >
                  {scaffoldPreview.files.map((f) => (
                    <button
                      key={f.relativePath}
                      type="button"
                      className={`btn btn-sm ${
                        activePreviewFileObj?.relativePath === f.relativePath ? 'btn-primary' : ''
                      }`}
                      style={{ justifyContent: 'space-between', fontSize: '0.78rem' }}
                      onClick={() => setSelectedPreviewFile(f.relativePath)}
                    >
                      <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.relativePath}
                      </span>
                      <span className="badge" style={{ fontSize: '0.68rem' }}>
                        {f.lineEndings}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="card-elevated stack-sm" style={{ margin: 0 }}>
                  {activePreviewFileObj && (
                    <>
                      <div className="flex-between" style={{ fontSize: '0.8rem' }}>
                        <strong className="mono">{activePreviewFileObj.workspacePath}</strong>
                        <div className="flex-row">
                          <span className="badge">{activePreviewFileObj.role}</span>
                          <span className="badge">{activePreviewFileObj.lineEndings}</span>
                          <span className="badge">{activePreviewFileObj.bytes} B</span>
                        </div>
                      </div>
                      <pre
                        className="mono"
                        style={{
                          margin: 0,
                          maxHeight: 250,
                          overflow: 'auto',
                          fontSize: '0.77rem',
                          whiteSpace: 'pre',
                        }}
                      >
                        {activePreviewFileObj.previewContent}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'env' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>
              Environment Variables & Secret References — {activeProject.name}
            </h3>
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
