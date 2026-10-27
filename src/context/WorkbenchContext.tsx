import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CORE_MODULES } from '../../shared/catalog/modules';
import { BUILTIN_PLUGINS } from '../../shared/catalog/plugins';
import { DEFAULT_PROFILES, INITIAL_PROJECTS } from '../../shared/catalog/templates';
import { redactSensitiveText } from '../../shared/redaction';
import {
  BackgroundJob,
  ConsentRequest,
  ModuleId,
  PluginManifest,
  ProjectWorkspace,
  ToolchainProbeResult,
  WorkspaceProfile,
} from '../../shared/types';

export interface PersonalSettings {
  theme: 'dark' | 'light' | 'high-contrast';
  uiScale: number;
  editorFontSize: number;
  sidebarCollapsed: boolean;
  hiddenModules: ModuleId[];
  preferredShell: 'pwsh' | 'cmd' | 'vsdevcmd' | 'git-bash' | 'wsl';
  offlineMode: boolean;
  requireCommandConsent: boolean;
  autoRedactSecrets: boolean;
  telemetryEnabled: boolean;
  dataRetentionDays: number;
  updateChannel: 'Stable' | 'Preview' | 'Manual Only';
}

export interface SettingsBackup {
  id: string;
  label: string;
  createdAt: string;
  settings: PersonalSettings;
}

export interface CustomExternalTool {
  id: string;
  name: string;
  command: string;
  args: string;
  category: string;
}

export interface CodeSnippet {
  id: string;
  title: string;
  language: string;
  tags: string[];
  body: string;
}

interface PendingConsent {
  request: ConsentRequest;
  onApprove: () => void;
}

interface EditorJumpTarget {
  file: string;
  line?: number;
  ts: number;
}

interface WorkbenchContextValue {
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;
  loadedModules: ModuleId[];
  projects: ProjectWorkspace[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectWorkspace[]>>;
  activeProject: ProjectWorkspace;
  setActiveProjectId: (id: string) => void;
  updateActiveProject: (updater: (prev: ProjectWorkspace) => ProjectWorkspace) => void;
  profiles: WorkspaceProfile[];
  activeProfile: WorkspaceProfile;
  applyProfile: (profileId: string) => void;
  relevantFirst: boolean;
  setRelevantFirst: (v: boolean) => void;
  settings: PersonalSettings;
  updateSettings: (patch: Partial<PersonalSettings>) => void;
  backups: SettingsBackup[];
  createBackup: (label?: string) => void;
  restoreBackup: (id: string) => void;
  plugins: PluginManifest[];
  togglePlugin: (id: string) => void;
  customTools: CustomExternalTool[];
  addCustomTool: (tool: Omit<CustomExternalTool, 'id'>) => void;
  removeCustomTool: (id: string) => void;
  snippets: CodeSnippet[];
  addSnippet: (snippet: Omit<CodeSnippet, 'id'>) => void;
  clipboardHistory: string[];
  copySafeText: (label: string, text: string, redactPaths?: boolean) => Promise<void>;
  teamConfig: Record<string, unknown> | null;
  teamConfigTrusted: boolean;
  setTeamConfigTrusted: (trusted: boolean) => void;
  toolchains: ToolchainProbeResult[];
  hostPlatform: string;
  hostArch: string;
  pathEntries: { index: number; path: string; exists: boolean; duplicate: boolean }[];
  refreshToolchains: () => Promise<void>;
  jobs: BackgroundJob[];
  triggerScanJob: (kind: 'secret-scan' | 'disk-cache-scan' | 'toolchain-probe') => Promise<void>;
  runCommandWithConsent: (opts: {
    label: string;
    command: string;
    category?: BackgroundJob['category'];
    impactScope?: ConsentRequest['impactScope'];
    reversibleNote?: string;
  }) => void;
  cancelJobById: (id: string) => Promise<void>;
  requestConsent: (request: ConsentRequest, onApprove: () => void) => void;
  pendingConsent: PendingConsent | null;
  resolveConsent: (approved: boolean) => void;
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
  outputLines: string[];
  appendOutput: (line: string) => void;
  clearOutput: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  editorTarget: EditorJumpTarget | null;
  openFileInEditor: (file: string, line?: number) => void;
  statusToast: string | null;
  notify: (msg: string) => void;
}

const DEFAULT_SETTINGS: PersonalSettings = {
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
};

const INITIAL_SNIPPETS: CodeSnippet[] = [
  {
    id: 'snip-win32-dpi',
    title: 'Win32 Per-Monitor DPI v2 Entry Initialization (C++)',
    language: 'cpp',
    tags: ['Win32', 'High-DPI', 'C++'],
    body: `#include <windows.h>\n\nint WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR cmdLine, int nCmdShow) {\n  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);\n  // Initialize window class & message loop...\n  return 0;\n}`,
  },
  {
    id: 'snip-csharp-winui-dialog',
    title: 'WinUI 3 ContentDialog with XamlRoot Binding (C#)',
    language: 'csharp',
    tags: ['C#', 'WinUI 3', 'XAML'],
    body: `var dialog = new ContentDialog {\n    Title = "${'{DialogTitle}'}",\n    Content = "Confirm configuration update?",\n    PrimaryButtonText = "Apply",\n    CloseButtonText = "Cancel",\n    DefaultButton = ContentDialogButton.Primary,\n    XamlRoot = this.Content.XamlRoot\n};\nvar result = await dialog.ShowAsync();`,
  },
  {
    id: 'snip-signtool-azure',
    title: 'SignTool SHA-256 Timestamped Authenticode Command',
    language: 'powershell',
    tags: ['Windows', 'Signing', 'Release'],
    body: `signtool.exe sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /n "$SubjectName" ".\\release\\MyAppSetup.exe"`,
  },
];

const INITIAL_CUSTOM_TOOLS: CustomExternalTool[] = [
  {
    id: 'tool-windbg',
    name: 'WinDbg Preview (Attach / Dump)',
    command: 'WinDbgX.exe',
    args: '-z "${DumpFile}"',
    category: 'Diagnostics',
  },
  {
    id: 'tool-inspect-uia',
    name: 'Accessibility Insights / Inspect.exe',
    command: 'inspect.exe',
    args: '',
    category: 'Windows A11y',
  },
];

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export const WorkbenchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModuleState] = useState<ModuleId>('home');
  const [loadedModules, setLoadedModules] = useState<ModuleId[]>(['home']);

  const [projects, setProjects] = useState<ProjectWorkspace[]>(() => {
    try {
      const saved = localStorage.getItem('devbench.projects.v1');
      return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
    } catch {
      return INITIAL_PROJECTS;
    }
  });
  const [activeProjectId, setActiveProjectId] = useState<string>(INITIAL_PROJECTS[0].id);

  const [profiles] = useState<WorkspaceProfile[]>(DEFAULT_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>(DEFAULT_PROFILES[0].id);
  const [relevantFirst, setRelevantFirst] = useState<boolean>(true);

  const [settings, setSettings] = useState<PersonalSettings>(() => {
    try {
      const raw = localStorage.getItem('devbench.personal.v1');
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [backups, setBackups] = useState<SettingsBackup[]>(() => {
    try {
      const raw = localStorage.getItem('devbench.backups.v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [plugins, setPlugins] = useState<PluginManifest[]>(BUILTIN_PLUGINS);
  const [customTools, setCustomTools] = useState<CustomExternalTool[]>(INITIAL_CUSTOM_TOOLS);
  const [snippets, setSnippets] = useState<CodeSnippet[]>(INITIAL_SNIPPETS);
  const [clipboardHistory, setClipboardHistory] = useState<string[]>([]);

  const [teamConfig, setTeamConfig] = useState<Record<string, unknown> | null>(null);
  const [teamConfigTrusted, setTeamConfigTrusted] = useState<boolean>(false);

  const [toolchains, setToolchains] = useState<ToolchainProbeResult[]>([]);
  const [hostPlatform, setHostPlatform] = useState<string>('win32');
  const [hostArch, setHostArch] = useState<string>('x64');
  const [pathEntries, setPathEntries] = useState<
    { index: number; path: string; exists: boolean; duplicate: boolean }[]
  >([]);

  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null);

  const [dockOpen, setDockOpen] = useState<boolean>(false);
  const [outputLines, setOutputLines] = useState<string[]>([
    '[DevBench] Modular Workbench ready. Press Ctrl+K from anywhere to search tools, commands, SDKs, or settings.',
    '[DevBench] Lazy module loader active: optional integrations stay unloaded until opened.',
  ]);

  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
  const [editorTarget, setEditorTarget] = useState<EditorJumpTarget | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setStatusToast(msg);
  }, []);

  useEffect(() => {
    if (!statusToast) return;
    const t = setTimeout(() => setStatusToast(null), 3500);
    return () => clearTimeout(t);
  }, [statusToast]);

  // Apply theme, UI scale, and editor font size CSS variables
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
    document.documentElement.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`);
    try {
      localStorage.setItem('devbench.personal.v1', JSON.stringify(settings));
    } catch {
      // ignore storage quota errors
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem('devbench.projects.v1', JSON.stringify(projects));
    } catch {
      // ignore
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem('devbench.backups.v1', JSON.stringify(backups));
    } catch {
      // ignore
    }
  }, [backups]);

  const setActiveModule = useCallback((id: ModuleId) => {
    setActiveModuleState(id);
    setLoadedModules((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0],
    [projects, activeProjectId]
  );

  const updateActiveProject = useCallback(
    (updater: (prev: ProjectWorkspace) => ProjectWorkspace) => {
      setProjects((prev) => prev.map((p) => (p.id === activeProject.id ? updater(p) : p)));
    },
    [activeProject.id]
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );

  const updateSettings = useCallback((patch: Partial<PersonalSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyProfile = useCallback(
    (profileId: string) => {
      const prof = profiles.find((p) => p.id === profileId);
      if (!prof) return;
      setActiveProfileId(profileId);
      const hidden = CORE_MODULES.filter(
        (m) => !m.coreAlwaysVisible && !prof.visibleModules.includes(m.id)
      ).map((m) => m.id);
      updateSettings({
        hiddenModules: hidden,
        preferredShell: prof.preferredShell as PersonalSettings['preferredShell'],
      });
      notify(`Switched workspace profile to "${prof.name}"`);
    },
    [profiles, updateSettings, notify]
  );

  const createBackup = useCallback(
    (label?: string) => {
      const snap: SettingsBackup = {
        id: `bkp-${Date.now()}`,
        label: label || `Settings Snapshot (${new Date().toLocaleTimeString()})`,
        createdAt: new Date().toISOString(),
        settings,
      };
      setBackups((prev) => [snap, ...prev].slice(0, 15));
      notify('Saved local configuration backup snapshot.');
    },
    [settings, notify]
  );

  const restoreBackup = useCallback(
    (id: string) => {
      const snap = backups.find((b) => b.id === id);
      if (!snap) return;
      setSettings(snap.settings);
      notify(`Restored settings backup: ${snap.label}`);
    },
    [backups, notify]
  );

  const appendOutput = useCallback(
    (line: string) => {
      const clean = settings.autoRedactSecrets ? redactSensitiveText(line) : line;
      setOutputLines((prev) => [...prev.slice(-300), clean]);
    },
    [settings.autoRedactSecrets]
  );

  const clearOutput = useCallback(() => setOutputLines([]), []);

  const refreshToolchains = useCallback(async () => {
    try {
      const r = await fetch('/api/toolchains');
      if (!r.ok) return;
      const data = await r.json();
      setToolchains(data.results || []);
      setHostPlatform(data.hostPlatform || 'unknown');
      setHostArch(data.hostArch || 'x64');
      setPathEntries(data.pathInfo?.entries || []);
    } catch {
      // graceful offline fallback
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const r = await fetch('/api/jobs');
      if (!r.ok) return;
      const data = await r.json();
      setJobs(data.jobs || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshToolchains();
    fetchJobs();
    fetch('/api/team/config')
      .then((r) => r.json())
      .then((d) => {
        if (d.exists) setTeamConfig(d.config);
      })
      .catch(() => {});
  }, [refreshToolchains, fetchJobs]);

  // Stream real-time job updates via Server-Sent Events (SSE) when any job is running
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running');
    if (!hasRunning) return;

    if (typeof EventSource !== 'undefined') {
      const es = new EventSource('/api/jobs/stream');
      es.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (Array.isArray(parsed.jobs)) {
            setJobs(parsed.jobs);
          }
        } catch {
          // ignore malformed SSE frame
        }
      };
      es.onerror = () => {
        es.close();
      };
      return () => es.close();
    }

    const timer = setInterval(fetchJobs, 500);
    return () => clearInterval(timer);
  }, [jobs, fetchJobs]);

  const requestConsent = useCallback((request: ConsentRequest, onApprove: () => void) => {
    setPendingConsent({ request, onApprove });
  }, []);

  const resolveConsent = useCallback(
    (approved: boolean) => {
      if (!pendingConsent) return;
      const current = pendingConsent;
      setPendingConsent(null);
      if (approved) {
        current.onApprove();
      } else {
        notify('Action cancelled — no changes were made.');
      }
    },
    [pendingConsent, notify]
  );

  const triggerScanJob = useCallback(
    async (kind: 'secret-scan' | 'disk-cache-scan' | 'toolchain-probe') => {
      const r = await fetch('/api/jobs/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const data = await r.json();
      if (data.job) {
        setJobs((prev) => [data.job, ...prev]);
        setDockOpen(true);
        appendOutput(`[Job Started] ${data.job.name}`);
      }
    },
    [appendOutput]
  );

  const runCommandWithConsent = useCallback(
    (opts: {
      label: string;
      command: string;
      category?: BackgroundJob['category'];
      impactScope?: ConsentRequest['impactScope'];
      reversibleNote?: string;
    }) => {
      const execute = async () => {
        try {
          const r = await fetch('/api/jobs/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: opts.label,
              command: opts.command,
              category: opts.category || 'build',
              consentConfirmed: true,
            }),
          });
          const data = await r.json();
          if (!r.ok) {
            notify(`Command blocked: ${data.error}`);
            appendOutput(`[Blocked] ${data.error}`);
            return;
          }
          setJobs((prev) => [data.job, ...prev]);
          setDockOpen(true);
          appendOutput(`$ ${opts.command}`);
          notify(`Started: ${opts.label}`);
        } catch (err) {
          notify(`Failed to start command: ${(err as Error).message}`);
        }
      };

      requestConsent(
        {
          id: `consent-${Date.now()}`,
          title: `Approve Command Execution: ${opts.label}`,
          actionType: 'command',
          description:
            'DevBench requires explicit developer approval before spawning shell processes or toolchain commands.',
          commandPreview: opts.command,
          cwd: activeProject.path,
          impactScope: opts.impactScope || 'Local Project',
          reversibleNote:
            opts.reversibleNote || 'Process runs inside workspace directory and can be cancelled at any time from the Jobs dock.',
        },
        execute
      );
    },
    [activeProject.path, appendOutput, notify, requestConsent]
  );

  const cancelJobById = useCallback(
    async (id: string) => {
      await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' });
      await fetchJobs();
      notify('Cancelled background job.');
    },
    [fetchJobs, notify]
  );

  const togglePlugin = useCallback(
    (id: string) => {
      setPlugins((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const next = !p.enabled;
          notify(`${next ? 'Enabled' : 'Disabled'} plugin: ${p.name}`);
          return { ...p, enabled: next };
        })
      );
    },
    [notify]
  );

  const addCustomTool = useCallback(
    (tool: Omit<CustomExternalTool, 'id'>) => {
      setCustomTools((prev) => [...prev, { ...tool, id: `ct-${Date.now()}` }]);
      notify(`Added external tool: ${tool.name}`);
    },
    [notify]
  );

  const removeCustomTool = useCallback((id: string) => {
    setCustomTools((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addSnippet = useCallback(
    (snippet: Omit<CodeSnippet, 'id'>) => {
      setSnippets((prev) => [{ ...snippet, id: `snip-${Date.now()}` }, ...prev]);
      notify(`Saved snippet: ${snippet.title}`);
    },
    [notify]
  );

  const copySafeText = useCallback(
    async (label: string, text: string, redactPaths = false) => {
      const safe = settings.autoRedactSecrets ? redactSensitiveText(text, redactPaths) : text;
      try {
        await navigator.clipboard.writeText(safe);
      } catch {
        // fallback when clipboard API unavailable in iframe
      }
      setClipboardHistory((prev) => [safe, ...prev.filter((x) => x !== safe)].slice(0, 12));
      notify(`Copied ${label}${settings.autoRedactSecrets ? ' (secrets redacted)' : ''}`);
    },
    [settings.autoRedactSecrets, notify]
  );

  const openFileInEditor = useCallback(
    (file: string, line?: number) => {
      setEditorTarget({ file, line, ts: Date.now() });
      setActiveModule('code');
    },
    [setActiveModule]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setDockOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setActiveModule('settings');
      } else if (e.altKey && /^[0-9-=]$/.test(e.key)) {
        const keyMap: Record<string, ModuleId> = {
          '1': 'home',
          '2': 'projects',
          '3': 'code',
          '4': 'build-run',
          '5': 'test',
          '6': 'debug',
          '7': 'git',
          '8': 'packages',
          '9': 'apis-data',
          '0': 'windows',
          '-': 'security',
          '=': 'team',
        };
        const target = keyMap[e.key];
        if (target) {
          e.preventDefault();
          setActiveModule(target);
        }
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        setShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settings.sidebarCollapsed, updateSettings, setActiveModule]);

  const value: WorkbenchContextValue = {
    activeModule,
    setActiveModule,
    loadedModules,
    projects,
    setProjects,
    activeProject,
    setActiveProjectId,
    updateActiveProject,
    profiles,
    activeProfile,
    applyProfile,
    relevantFirst,
    setRelevantFirst,
    settings,
    updateSettings,
    backups,
    createBackup,
    restoreBackup,
    plugins,
    togglePlugin,
    customTools,
    addCustomTool,
    removeCustomTool,
    snippets,
    addSnippet,
    clipboardHistory,
    copySafeText,
    teamConfig,
    teamConfigTrusted,
    setTeamConfigTrusted,
    toolchains,
    hostPlatform,
    hostArch,
    pathEntries,
    refreshToolchains,
    jobs,
    triggerScanJob,
    runCommandWithConsent,
    cancelJobById,
    requestConsent,
    pendingConsent,
    resolveConsent,
    dockOpen,
    setDockOpen,
    outputLines,
    appendOutput,
    clearOutput,
    paletteOpen,
    setPaletteOpen,
    shortcutsOpen,
    setShortcutsOpen,
    editorTarget,
    openFileInEditor,
    statusToast,
    notify,
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
};

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error('useWorkbench must be used inside WorkbenchProvider');
  return ctx;
}
