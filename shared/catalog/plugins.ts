import { PluginManifest } from '../types';

export const BUILTIN_PLUGINS: PluginManifest[] = [
  {
    id: 'plugin.msix-packager',
    name: 'Windows MSIX & WiX v5 Packager',
    version: '1.4.2',
    publisher: 'DevBench Official',
    description: 'Adds Package.appxmanifest schema checks, MakeAppx / WiX v5 command builders, and PRI resource inspection.',
    category: 'Windows Packaging',
    enabled: true,
    isolatedWorker: true,
    permissions: ['filesystem:read', 'process:spawn', 'ui:panel'],
    projectFiles: ['Package.appxmanifest', '*.wxs', '*.wixproj'],
    requiredBinaries: ['makeappx.exe', 'wix'],
    commands: ['MSIX: Validate AppxManifest', 'WiX: Build Installer Package'],
  },
  {
    id: 'plugin.powershell-desktop',
    name: 'PowerShell Desktop & Admin GUI Adapter',
    version: '1.2.0',
    publisher: 'DevBench Official',
    description: 'Supports PowerShell 7 / Windows PowerShell WPF & WinForms scripts, PSScriptAnalyzer linting, and Pester test discovery.',
    category: 'Language Adapter',
    enabled: true,
    isolatedWorker: true,
    permissions: ['filesystem:read', 'process:spawn', 'env:read'],
    contributesLanguages: ['powershell'],
    projectFiles: ['*.ps1', '*.psm1', '*.psd1'],
    requiredBinaries: ['pwsh'],
    commands: ['PowerShell: Run PSScriptAnalyzer', 'PowerShell: Run Pester Tests'],
  },
  {
    id: 'plugin.windows-sandbox',
    name: 'Windows Sandbox & Hyper-V Clean-Room Tester',
    version: '1.1.0',
    publisher: 'DevBench Official',
    description: 'Generates read-only mapped .wsb sandbox configs to test installers in a disposable Windows 11 clean room.',
    category: 'Windows Packaging',
    enabled: true,
    isolatedWorker: true,
    permissions: ['filesystem:read', 'filesystem:write', 'ui:panel'],
    projectFiles: ['*.wsb'],
    requiredBinaries: ['WindowsSandbox.exe'],
    commands: ['Sandbox: Generate Clean-Room .wsb', 'Sandbox: Launch Installer Test'],
  },
  {
    id: 'plugin.delphi-pascal',
    name: 'Delphi / Object Pascal & Lazarus Adapter',
    version: '0.9.5',
    publisher: 'Community Pascal Maintainers',
    description: 'Adds .dpr/.dproj/.lpi discovery, dcc64 & Free Pascal build profiles, and VCL/FMX High-DPI manifest checks.',
    category: 'Language Adapter',
    enabled: false,
    isolatedWorker: true,
    permissions: ['filesystem:read', 'process:spawn'],
    contributesLanguages: ['delphi'],
    projectFiles: ['*.dpr', '*.dproj', '*.lpi', '*.dfm', '*.fmx'],
    requiredBinaries: ['dcc64', 'lazbuild'],
    commands: ['Delphi: Build Win64 Release', 'Lazarus: Compile LPI Project'],
  },
  {
    id: 'plugin.polyglot-legacy',
    name: 'Polyglot Pack (Ruby, PHP, Lua, Haskell, Julia)',
    version: '1.0.1',
    publisher: 'DevBench Ecosystem Labs',
    description: 'Plugin-defined project adapters for NativePHP, LÖVE/Lua Win32, GHC Cabal/Stack, Ruby OCRA, and Julia scientific GUIs.',
    category: 'Language Adapter',
    enabled: false,
    isolatedWorker: true,
    permissions: ['filesystem:read', 'process:spawn', 'env:read'],
    contributesLanguages: ['ruby', 'php', 'lua', 'haskell', 'julia', 'custom-legacy'],
    projectFiles: ['Gemfile', 'composer.json', '*.cabal', 'Project.toml', 'main.lua'],
    requiredBinaries: ['ruby', 'php', 'lua', 'cabal', 'julia'],
    commands: ['Polyglot: Detect Custom Runtime', 'Polyglot: Run Custom Build Script'],
  },
  {
    id: 'plugin.enterprise-legacy-sdk',
    name: 'Company / Legacy Toolchain Bridge (MFC, VB6, Custom SDK)',
    version: '2.0.0',
    publisher: 'Enterprise Internal Template',
    description: 'Declarative JSON bridge (`devbench.adapter.json`) for proprietary compilers, COM/ActiveX registration helpers, and internal NuGet/Artifactory feeds.',
    category: 'Enterprise / Legacy',
    enabled: false,
    isolatedWorker: true,
    permissions: ['filesystem:read', 'process:spawn', 'env:read', 'credentials:prompt'],
    contributesLanguages: ['custom-legacy'],
    projectFiles: ['devbench.adapter.json', '*.vbp', '*.dsp'],
    requiredBinaries: [],
    commands: ['Enterprise: Validate Custom Adapter JSON', 'Enterprise: Inspect COM / Side-by-Side Manifest'],
  },
];

export interface TroubleshootingGuide {
  id: string;
  errorPattern: string;
  title: string;
  ecosystem: string;
  symptoms: string;
  resolutionSteps: string[];
}

export const TROUBLESHOOTING_GUIDES: TroubleshootingGuide[] = [
  {
    id: 'guide-msb3644',
    errorPattern: 'MSB3644 / NETSDK1045',
    title: 'Missing .NET Targeting Pack or SDK Version Mismatch',
    ecosystem: 'C# / VB.NET / F#',
    symptoms: 'The reference assemblies for TargetFramework net8.0-windows10.0.22621.0 were not found, or global.json pins an uninstalled SDK.',
    resolutionSteps: [
      'Check `global.json` version in Packages > Toolchains and compare against `dotnet --list-sdks`.',
      'Install the matching .NET SDK via `winget install Microsoft.DotNet.SDK.8` or adjust `rollForward` to `latestMajor`.',
      'Ensure the matching Windows 10/11 SDK targeting pack (e.g. 10.0.22621.0) is installed in Visual Studio Build Tools.',
    ],
  },
  {
    id: 'guide-lnk1104-msvc',
    errorPattern: 'LNK1104 / C1083: Cannot open include file windows.h',
    title: 'MSVC / Windows SDK Include or Lib Path Missing',
    ecosystem: 'C / C++ / Rust (MSVC)',
    symptoms: 'cl.exe or link.exe fails to locate `windows.h`, `kernel32.lib`, or `ucrt.lib`.',
    resolutionSteps: [
      'Launch build via the `Developer Command Prompt / vcvars64.bat` shell profile in Build & Run.',
      'Open Windows Tools > SDK & Architecture Readiness to verify Windows 11 SDK installation.',
      'For Rust, run `rustup default stable-x86_64-pc-windows-msvc` and install "Desktop development with C++" workload.',
    ],
  },
  {
    id: 'guide-msix-0x800b0109',
    errorPattern: '0x800B0109 / CertTrustError',
    title: 'MSIX Package Certificate Chain Untrusted During Local Sideload',
    ecosystem: 'Windows Packaging (MSIX)',
    symptoms: 'App Installer fails with 0x800B0109 because the dev/test signing certificate is not in Trusted People / Root store.',
    resolutionSteps: [
      'Never commit `.pfx` private keys to Git. Use Azure Trusted Signing or a local user-store dev cert.',
      'Verify signature chain with `signtool verify /pa /v MyPackage.msix` in Windows Tools > Signing Guidance.',
      'Test untrusted installer behavior inside an isolated Windows Sandbox (`.wsb`) first.',
    ],
  },
  {
    id: 'guide-webview2-missing',
    errorPattern: 'WebView2RuntimeNotFoundException / HRESULT 0x80070002',
    title: 'Microsoft Edge WebView2 Runtime Missing on Target Machine',
    ecosystem: 'Tauri / WinUI / WPF / Go Wails',
    symptoms: 'Application fails on clean Windows Server or LTSC machines lacking the Evergreen WebView2 Runtime.',
    resolutionSteps: [
      'Include the Evergreen Bootstrapper check in your installer (NSIS / WiX / Inno Setup).',
      'Verify registry key `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`.',
      'Test clean-machine startup using DevBench Windows Sandbox generator.',
    ],
  },
  {
    id: 'guide-dpi-blurry',
    errorPattern: 'Blurry GDI Scaling on 150% / 200% Secondary Monitor',
    title: 'Missing PerMonitorV2 DPI Awareness in Application Manifest',
    ecosystem: 'Win32 / WinForms / WPF / C++ / Delphi',
    symptoms: 'Window renders crisp on primary 100% display but bitmap-stretches when dragged to a 150%+ 4K display.',
    resolutionSteps: [
      'Open Windows Tools > Manifest Validator and verify `<dpiAwareness>PerMonitorV2, PerMonitor</dpiAwareness>`.',
      'Handle `WM_DPICHANGED` (Win32) or enable `ApplicationHighDpiMode.PerMonitorV2` (.NET WinForms).',
      'Run the Multi-Monitor & Scaling Checklist at 125%, 150%, and 200% in Windows Tools.',
    ],
  },
];
