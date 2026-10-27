export type ModuleId =
  | 'home'
  | 'projects'
  | 'code'
  | 'build-run'
  | 'test'
  | 'debug'
  | 'git'
  | 'packages'
  | 'apis-data'
  | 'windows'
  | 'security'
  | 'team'
  | 'settings';

export type LanguageId =
  | 'csharp'
  | 'cpp'
  | 'vbnet'
  | 'fsharp'
  | 'rust'
  | 'python'
  | 'java'
  | 'kotlin'
  | 'ts-js'
  | 'dart'
  | 'go'
  | 'swift'
  | 'delphi'
  | 'powershell'
  | 'ruby'
  | 'php'
  | 'lua'
  | 'haskell'
  | 'julia'
  | 'custom-legacy';

export type PluginPermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'process:spawn'
  | 'network:local'
  | 'network:external'
  | 'env:read'
  | 'credentials:prompt'
  | 'ui:panel';

export interface ModuleManifest {
  id: ModuleId;
  label: string;
  shortLabel: string;
  description: string;
  shortcut: string;
  coreAlwaysVisible?: boolean;
  lazyLoad: boolean;
  supportedLanguages: LanguageId[] | 'all';
  projectFiles: string[];
  commands: string[];
  outputFormats: string[];
  requiredExternalTools: string[];
  gracefulFallbackNote: string;
}

export interface UIFrameworkSpec {
  id: string;
  name: string;
  compatibleLanguages: LanguageId[];
  windowsTargetType: 'Win32' | 'WinRT / Windows App SDK' | 'WPF / .NET' | 'WebView2 / Chromium' | 'Cross-Platform Native' | 'JVM Desktop';
  dpiSupport: string;
  packagingFormats: string[];
  projectMarkers: string[];
  summary: string;
}

export interface BuildSystemSpec {
  id: string;
  name: string;
  binary: string;
  configFiles: string[];
  compatibleLanguages: LanguageId[];
  defaultCommands: {
    build: string;
    clean: string;
    rebuild: string;
    publish: string;
  };
}

export interface PackageManagerSpec {
  id: string;
  name: string;
  binary: string;
  manifestFiles: string[];
  lockFiles: string[];
  compatibleLanguages: LanguageId[];
  commands: {
    install: string;
    outdated: string;
    audit: string;
    addTemplate: string;
  };
}

export interface DebuggerAdapterSpec {
  id: string;
  name: string;
  protocol: 'DAP' | 'Inspector' | 'JDWP' | 'Native WinDbg/CDB';
  binary: string;
  compatibleLanguages: LanguageId[];
  supportsAttach: boolean;
  supportsMinidump: boolean;
  summary: string;
}

export interface TestRunnerSpec {
  id: string;
  name: string;
  command: string;
  compatibleLanguages: LanguageId[];
  coverageFlag: string;
}

export interface LanguageAdapter {
  id: LanguageId;
  name: string;
  tier: 'first-class' | 'plugin-defined';
  category: '.NET Ecosystem' | 'Native & Systems' | 'JVM & Multiplatform' | 'Web & Scripting' | 'Plugin / Legacy';
  projectFiles: string[];
  versionPinFiles: string[];
  sdkDetectorBinaries: string[];
  supportedUIFrameworks: string[];
  supportedBuildSystems: string[];
  supportedPackageManagers: string[];
  supportedTestRunners: string[];
  supportedDebuggers: string[];
  windowsNotes: string;
  desktopWorkflows: string[];
  installHintWindows: string;
}

export interface ProjectTaskShortcut {
  id: string;
  label: string;
  command: string;
  category: 'build' | 'run' | 'test' | 'package' | 'lint' | 'custom';
}

export interface ProjectEnvVar {
  key: string;
  value: string;
  isSecretRef?: boolean;
  secretVaultKey?: string;
}

export interface ProjectTodo {
  id: string;
  text: string;
  done: boolean;
  tag?: string;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  path: string;
  isLiveWorkspace?: boolean;
  favorite: boolean;
  archived?: boolean;
  lastOpened: string;
  tags: string[];
  profileId: string;
  language: LanguageId;
  secondaryLanguages?: LanguageId[];
  uiFrameworkId: string;
  buildSystemId: string;
  packageManagerId: string;
  testRunnerId: string;
  debuggerId: string;
  pinnedVersions: Record<string, string>;
  targetArchitectures: ('x64' | 'ARM64' | 'x86')[];
  windowsSdkTarget?: string;
  notes: string;
  docLinks: { title: string; url: string }[];
  bookmarks: { label: string; file: string; line: number }[];
  todos: ProjectTodo[];
  shortcuts: ProjectTaskShortcut[];
  envVars: ProjectEnvVar[];
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  description: string;
  visibleModules: ModuleId[];
  preferredShell: string;
  defaultLanguage: LanguageId;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  category: 'Language Adapter' | 'Windows Packaging' | 'Enterprise / Legacy' | 'Quality & Ops' | 'Productivity';
  enabled: boolean;
  isolatedWorker: boolean;
  permissions: PluginPermission[];
  contributesLanguages?: LanguageId[];
  projectFiles: string[];
  requiredBinaries: string[];
  commands: string[];
}

export interface ConsentRequest {
  id: string;
  title: string;
  actionType: 'command' | 'install' | 'git-write' | 'file-mutate' | 'team-trust' | 'credential';
  description: string;
  commandPreview?: string;
  cwd?: string;
  impactScope: 'Local Project' | 'Git Working Tree' | 'User Environment' | 'System / Toolchain';
  reversibleNote: string;
}

export interface BackgroundJob {
  id: string;
  name: string;
  category: 'scan' | 'build' | 'test' | 'index' | 'diagnostics';
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  progress: number;
  detail: string;
  startedAt: string;
  finishedAt?: string;
  logs: string[];
}

export interface ToolchainProbeResult {
  id: string;
  name: string;
  category: 'Runtime / SDK' | 'Compiler' | 'Build System' | 'Package Manager' | 'Windows SDK / Host' | 'Container / Cloud';
  binary: string;
  installed: boolean;
  detectedVersion: string | null;
  path: string | null;
  source: 'live-host' | 'windows-simulated-preview';
  installCommandWindows: string;
  uninstallCommandWindows: string;
  compatibleLanguages: LanguageId[];
  statusNote: string;
}

export interface SecretFinding {
  id: string;
  file: string;
  line: number;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium';
  redactedSnippet: string;
  source: 'working-tree' | 'git-history';
}

export interface DependencyItem {
  name: string;
  currentVersion: string;
  latestVersion: string;
  ecosystem: string;
  devDependency: boolean;
  license: string;
  licenseWarning?: string;
  advisory?: {
    id: string;
    severity: 'low' | 'moderate' | 'high' | 'critical';
    title: string;
    fixedIn: string;
  };
}
