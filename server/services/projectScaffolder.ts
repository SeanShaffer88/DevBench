import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUILD_SYSTEMS,
  DEBUGGER_ADAPTERS,
  LANGUAGE_ADAPTERS,
  TEST_RUNNERS,
  UI_FRAMEWORKS,
} from '../../shared/catalog/ecosystems';
import {
  LanguageId,
  ProjectTaskShortcut,
  ProjectWorkspace,
  ScaffoldedWorkspaceItem,
  ScaffoldPreviewFile,
  ScaffoldPreviewResponse,
  ScaffoldRequestOptions,
} from '../../shared/types';
import { generateMultiSizeIco, generateWin32ResourceRc } from './icoResourceService';
import { resolveSafeWorkspacePath, WORKSPACE_ROOT } from './workspaceFs';

const WIN32_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export class ScaffoldConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldConsentError';
  }
}

interface GeneratedArtifact {
  relativePath: string;
  role: ScaffoldPreviewFile['role'];
  lineEndings: 'CRLF' | 'LF' | 'BINARY';
  textContent?: string;
  binaryBuffer?: Buffer;
}

interface DerivedNames {
  displayName: string;
  folderName: string;
  pascalName: string;
  kebabSlug: string;
  snakeSlug: string;
  companyName: string;
  companyClean: string;
  packageIdentifier: string;
  guidUpper: string;
}

export function deriveProjectNames(
  rawProjectName: string,
  rawCompanyName: string,
  rawPackageId?: string
): DerivedNames {
  const trimmed = (rawProjectName || '').trim();
  if (!trimmed) {
    throw new Error('Project name cannot be empty.');
  }
  if (trimmed.length > 64) {
    throw new Error('Project name must be 64 characters or fewer.');
  }
  if (/[/\\<>:"|?*\x00-\x1f]/.test(trimmed) || trimmed.includes('..') || trimmed.endsWith('.')) {
    throw new Error(
      'Project name contains characters disallowed on Windows filesystems (< > : " / \\ | ? * or trailing dot).'
    );
  }

  const folderName = trimmed.replace(/\s+/g, '-');
  const baseStem = folderName.split('.')[0];
  if (WIN32_RESERVED_NAMES.test(folderName) || WIN32_RESERVED_NAMES.test(baseStem)) {
    throw new Error(
      `"${trimmed}" is a reserved Win32 device name on Windows (CON, PRN, AUX, NUL, COM1-9, LPT1-9). Choose a different name.`
    );
  }

  const words = trimmed
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let pascalName =
    words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('') || 'WindowsApp';
  if (/^[0-9]/.test(pascalName)) {
    pascalName = `App${pascalName}`;
  }

  let kebabSlug = words.map((w) => w.toLowerCase()).join('-') || 'windows-app';
  if (/^[0-9]/.test(kebabSlug)) {
    kebabSlug = `app-${kebabSlug}`;
  }

  const snakeSlug = kebabSlug.replace(/-/g, '_');
  const companyName = (rawCompanyName || 'DevBench Studio').trim() || 'DevBench Studio';
  const companyWords = companyName
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const companyClean = companyWords[0] || 'Contoso';

  const packageIdentifier =
    rawPackageId && rawPackageId.trim()
      ? rawPackageId.trim().replace(/[^A-Za-z0-9.-]/g, '')
      : `${companyClean}.${pascalName}`;

  // Deterministic GUID per project name so previews are stable
  const hashHex = crypto.createHash('sha256').update(`${companyClean}:${pascalName}`).digest('hex');
  const guidUpper = [
    hashHex.slice(0, 8),
    hashHex.slice(8, 12),
    '4' + hashHex.slice(13, 16),
    'A' + hashHex.slice(17, 20),
    hashHex.slice(20, 32),
  ]
    .join('-')
    .toUpperCase();

  return {
    displayName: trimmed,
    folderName,
    pascalName,
    kebabSlug,
    snakeSlug,
    companyName,
    companyClean,
    packageIdentifier,
    guidUpper,
  };
}

function buildWin32AppManifestXml(names: DerivedNames): string {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">`,
    `  <assemblyIdentity version="0.1.0.0" name="${names.packageIdentifier}.App"/>`,
    `  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">`,
    `    <security>`,
    `      <requestedPrivileges xmlns="urn:schemas-microsoft-com:asm.v3">`,
    `        <requestedExecutionLevel level="asInvoker" uiAccess="false" />`,
    `      </requestedPrivileges>`,
    `    </security>`,
    `  </trustInfo>`,
    `  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">`,
    `    <application>`,
    `      <!-- Windows 10 and Windows 11 -->`,
    `      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}" />`,
    `    </application>`,
    `  </compatibility>`,
    `  <application xmlns="urn:schemas-microsoft-com:asm.v3">`,
    `    <windowsSettings>`,
    `      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2, PerMonitor</dpiAwareness>`,
    `      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>`,
    `      <longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware>`,
    `      <heapType xmlns="http://schemas.microsoft.com/SMI/2020/WindowsSettings">SegmentHeap</heapType>`,
    `    </windowsSettings>`,
    `  </application>`,
    `</assembly>`,
    ``,
  ].join('\r\n');
}

function buildMsixAppxManifestXml(
  names: DerivedNames,
  archs: ('x64' | 'ARM64')[],
  sdkTarget: string
): string {
  const primaryArch = archs.includes('x64') ? 'x64' : 'arm64';
  const minVer = '10.0.19041.0';
  const maxTested = sdkTarget || '10.0.22621.0';
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<Package`,
    `  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"`,
    `  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"`,
    `  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"`,
    `  IgnorableNamespaces="uap rescap">`,
    `  <Identity`,
    `    Name="${names.packageIdentifier}"`,
    `    Publisher="CN=${names.companyName.replace(/"/g, '')}"`,
    `    Version="0.1.0.0"`,
    `    ProcessorArchitecture="${primaryArch}" />`,
    `  <Properties>`,
    `    <DisplayName>${names.displayName}</DisplayName>`,
    `    <PublisherDisplayName>${names.companyName}</PublisherDisplayName>`,
    `    <Logo>assets\\app.ico</Logo>`,
    `  </Properties>`,
    `  <Dependencies>`,
    `    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="${minVer}" MaxVersionTested="${maxTested}" />`,
    `  </Dependencies>`,
    `  <Resources>`,
    `    <Resource Language="en-us" />`,
    `  </Resources>`,
    `  <Applications>`,
    `    <Application Id="App" Executable="${names.pascalName}.exe" EntryPoint="Windows.FullTrustApplication">`,
    `      <uap:VisualElements`,
    `        DisplayName="${names.displayName}"`,
    `        Description="${names.displayName} Windows Desktop Client"`,
    `        BackgroundColor="transparent"`,
    `        Square150x150Logo="assets\\Square150x150Logo.png"`,
    `        Square44x44Logo="assets\\Square44x44Logo.png" />`,
    `    </Application>`,
    `  </Applications>`,
    `  <Capabilities>`,
    `    <rescap:Capability Name="runFullTrust" />`,
    `  </Capabilities>`,
    `</Package>`,
    ``,
  ].join('\r\n');
}

function buildGitignoreForLanguage(lang: LanguageId): string {
  const common = [
    '# OS & Editor artifacts',
    'Thumbs.db',
    '.DS_Store',
    '*.log',
    '.vs/',
    '.idea/',
    '.devbench/local.json',
    '',
  ];

  const byLang: Partial<Record<LanguageId, string[]>> = {
    csharp: ['bin/', 'obj/', '*.user', '*.suo', 'AppPackages/', 'BundleArtifacts/'],
    vbnet: ['bin/', 'obj/', '*.user', '*.suo'],
    fsharp: ['bin/', 'obj/', '*.user', '.ionide/'],
    cpp: ['build/', 'out/', 'CMakeFiles/', 'CMakeCache.txt', 'vcpkg_installed/', '*.obj', '*.pdb', '*.ilk'],
    rust: ['target/', '**/*.rs.bk'],
    python: ['.venv/', 'venv/', '__pycache__/', 'dist/', 'build/', '*.egg-info/', '.pytest_cache/'],
    java: ['target/', '*.class', '*.jar', 'output-installer/'],
    kotlin: ['.gradle/', 'build/', 'out/'],
    'ts-js': ['node_modules/', 'dist/', 'release/', 'out/'],
    dart: ['.dart_tool/', 'build/', '.flutter-plugins', '.flutter-plugins-dependencies'],
    go: ['bin/', 'build/bin/', '*.exe', '*.test'],
    swift: ['.build/', '.swiftpm/', 'Build/'],
    delphi: ['__history/', '__recovery/', 'Win32/', 'Win64/', '*.dcu', '*.identcache', '*.local'],
    powershell: ['output/', 'TestResult.xml'],
  };

  return [...common, '# Toolchain build outputs', ...(byLang[lang] || ['build/', 'dist/', 'out/']), ''].join('\n');
}

function buildGitattributes(): string {
  return [
    '* text=auto eol=lf',
    '*.sln text eol=crlf',
    '*.csproj text eol=crlf',
    '*.vbproj text eol=crlf',
    '*.fsproj text eol=crlf',
    '*.manifest text eol=crlf',
    '*.appxmanifest text eol=crlf',
    '*.rc text eol=crlf',
    '*.ps1 text eol=crlf',
    '*.cmd text eol=crlf',
    '*.bat text eol=crlf',
    '*.dpr text eol=crlf',
    '*.dfm text eol=crlf',
    '*.ico binary',
    '',
  ].join('\r\n');
}

function buildPowerShellBuildScript(
  names: DerivedNames,
  buildCmd: string,
  testCmd: string,
  archs: ('x64' | 'ARM64')[]
): string {
  return [
    `<#`,
    `.SYNOPSIS`,
    `  Build, test, and package helper for ${names.displayName} (generated by DevBench).`,
    `#>`,
    `[CmdletBinding()]`,
    `param(`,
    `  [ValidateSet('Debug', 'Release')]`,
    `  [string]$Configuration = 'Debug',`,
    `  [ValidateSet(${archs.map((a) => `'${a}'`).join(', ')})]`,
    `  [string]$Platform = '${archs[0] || 'x64'}',`,
    `  [switch]$RunTests`,
    `)`,
    ``,
    `$ErrorActionPreference = 'Stop'`,
    `Write-Host "[${names.pascalName}] Building ($Configuration | $Platform)..." -ForegroundColor Cyan`,
    `Write-Host "  Command: ${buildCmd.replace(/"/g, '`"')}"`,
    `${buildCmd}`,
    ``,
    `if ($RunTests) {`,
    `  Write-Host "[${names.pascalName}] Running test suite..." -ForegroundColor Cyan`,
    `  ${testCmd}`,
    `}`,
    `Write-Host "[${names.pascalName}] Completed." -ForegroundColor Green`,
    ``,
  ].join('\r\n');
}

function buildLanguageTemplateFiles(
  opts: ScaffoldRequestOptions,
  names: DerivedNames
): {
  files: GeneratedArtifact[];
  entryFile: string;
  shortcuts: ProjectTaskShortcut[];
} {
  const files: GeneratedArtifact[] = [];
  const archSemis = opts.targetArchitectures.join(';');
  const sdk = opts.windowsSdkTarget || '10.0.22621.0';
  const P = names.pascalName;
  const K = names.kebabSlug;
  const S = names.snakeSlug;

  // Use templateId when its language matches opts.language; otherwise use language-based scaffold
  const effectiveTpl = opts.templateId;

  if (effectiveTpl === 'tpl-csharp-winui3' && opts.language === 'csharp') {
    files.push(
      {
        relativePath: `${P}.sln`,
        role: 'build',
        lineEndings: 'CRLF',
        textContent: [
          `Microsoft Visual Studio Solution File, Format Version 12.00`,
          `# Visual Studio Version 17`,
          `VisualStudioVersion = 17.11.35327.3`,
          `Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "${P}", "${P}.csproj", "{${names.guidUpper}}"`,
          `EndProject`,
          `Global`,
          `\tGlobalSection(SolutionConfigurationPlatforms) = preSolution`,
          `\t\tDebug|x64 = Debug|x64`,
          `\t\tRelease|x64 = Release|x64`,
          `\t\tDebug|ARM64 = Debug|ARM64`,
          `\t\tRelease|ARM64 = Release|ARM64`,
          `\tEndGlobalSection`,
          `EndGlobal`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `${P}.csproj`,
        role: 'manifest',
        lineEndings: 'CRLF',
        textContent: [
          `<Project Sdk="Microsoft.NET.Sdk">`,
          `  <PropertyGroup>`,
          `    <OutputType>WinExe</OutputType>`,
          `    <TargetFramework>net8.0-windows${sdk}</TargetFramework>`,
          `    <TargetPlatformMinVersion>10.0.19041.0</TargetPlatformMinVersion>`,
          `    <RootNamespace>${P}</RootNamespace>`,
          `    <UseWinUI>true</UseWinUI>`,
          `    <Nullable>enable</Nullable>`,
          `    <ImplicitUsings>enable</ImplicitUsings>`,
          `    <Platforms>${archSemis}</Platforms>`,
          opts.includeWin32Manifest ? `    <ApplicationManifest>app.manifest</ApplicationManifest>` : null,
          opts.includeBinaryIconAndRc ? `    <ApplicationIcon>assets\\app.ico</ApplicationIcon>` : null,
          `  </PropertyGroup>`,
          `  <ItemGroup>`,
          `    <PackageReference Include="Microsoft.WindowsAppSDK" Version="1.6.240923002" />`,
          `    <PackageReference Include="CommunityToolkit.Mvvm" Version="8.3.2" />`,
          `  </ItemGroup>`,
          `</Project>`,
          ``,
        ]
          .filter((l): l is string => l !== null)
          .join('\r\n'),
      },
      {
        relativePath: `global.json`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: JSON.stringify(
          { sdk: { version: '8.0.400', rollForward: 'latestFeature' } },
          null,
          2
        ) + '\n',
      },
      {
        relativePath: `MainWindow.xaml`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `<Window`,
          `    x:Class="${P}.MainWindow"`,
          `    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"`,
          `    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"`,
          `    Title="${names.displayName}">`,
          `    <Window.SystemBackdrop>`,
          `        <MicaBackdrop Kind="BaseAlt" />`,
          `    </Window.SystemBackdrop>`,
          `    <StackPanel Padding="28" Spacing="12" VerticalAlignment="Center">`,
          `        <TextBlock Text="${names.displayName}" Style="{StaticResource TitleTextBlockStyle}" />`,
          `        <TextBlock Text="WinUI 3 + Windows App SDK 1.6 • PerMonitorV2 High-DPI Ready" Opacity="0.78" />`,
          `        <Button x:Name="ActionBtn" Content="Run Diagnostics" Click="OnActionClicked" />`,
          `    </StackPanel>`,
          `</Window>`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `MainWindow.xaml.cs`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `using Microsoft.UI.Xaml;`,
          ``,
          `namespace ${P};`,
          ``,
          `public sealed partial class MainWindow : Window`,
          `{`,
          `    public ViewModels.MainViewModel ViewModel { get; } = new();`,
          ``,
          `    public MainWindow()`,
          `    {`,
          `        this.InitializeComponent();`,
          `        this.ExtendsContentIntoTitleBar = true;`,
          `    }`,
          ``,
          `    private void OnActionClicked(object sender, RoutedEventArgs e)`,
          `    {`,
          `        ActionBtn.Content = ViewModel.BuildStatusBanner();`,
          `    }`,
          `}`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `ViewModels/MainViewModel.cs`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `using System.Runtime.InteropServices;`,
          ``,
          `namespace ${P}.ViewModels;`,
          ``,
          `public sealed class MainViewModel`,
          `{`,
          `    public string AppTitle => "${names.displayName}";`,
          `    public string BuildStatusBanner() => $"Ready on {RuntimeInformation.ProcessArchitecture}";`,
          `}`,
          ``,
        ].join('\r\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `Tests/MainViewModelTests.cs`,
        role: 'test',
        lineEndings: 'CRLF',
        textContent: [
          `using Xunit;`,
          `using ${P}.ViewModels;`,
          ``,
          `namespace ${P}.Tests;`,
          ``,
          `public class MainViewModelTests`,
          `{`,
          `    [Fact]`,
          `    public void StatusBanner_IncludesProcessArchitecture()`,
          `    {`,
          `        var vm = new MainViewModel();`,
          `        Assert.Contains("Ready on", vm.BuildStatusBanner());`,
          `    }`,
          `}`,
          ``,
        ].join('\r\n'),
      });
    }
    return {
      files,
      entryFile: `MainWindow.xaml`,
      shortcuts: [
        { id: 'sc-restore', label: 'NuGet Restore', command: `dotnet restore ${P}.csproj`, category: 'build' },
        { id: 'sc-build', label: 'Build x64 Debug', command: `dotnet build ${P}.csproj -c Debug -p:Platform=x64`, category: 'build' },
        { id: 'sc-test', label: 'Run .NET Tests', command: `dotnet test`, category: 'test' },
        { id: 'sc-msix', label: 'Package MSIX Release', command: `dotnet publish ${P}.csproj -c Release -p:GenerateAppxPackageOnBuild=true`, category: 'package' },
      ],
    };
  }

  if (effectiveTpl === 'tpl-csharp-wpf' || opts.language === 'csharp') {
    files.push(
      {
        relativePath: `${P}.csproj`,
        role: 'manifest',
        lineEndings: 'CRLF',
        textContent: [
          `<Project Sdk="Microsoft.NET.Sdk">`,
          `  <PropertyGroup>`,
          `    <OutputType>WinExe</OutputType>`,
          `    <TargetFramework>net8.0-windows</TargetFramework>`,
          `    <RootNamespace>${P}</RootNamespace>`,
          `    <UseWPF>true</UseWPF>`,
          `    <Nullable>enable</Nullable>`,
          `    <ImplicitUsings>enable</ImplicitUsings>`,
          `    <Platforms>${archSemis}</Platforms>`,
          opts.includeWin32Manifest ? `    <ApplicationManifest>app.manifest</ApplicationManifest>` : null,
          opts.includeBinaryIconAndRc ? `    <ApplicationIcon>assets\\app.ico</ApplicationIcon>` : null,
          `  </PropertyGroup>`,
          `</Project>`,
          ``,
        ]
          .filter((l): l is string => l !== null)
          .join('\r\n'),
      },
      {
        relativePath: `App.xaml`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `<Application x:Class="${P}.App"`,
          `             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"`,
          `             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"`,
          `             StartupUri="MainWindow.xaml">`,
          `    <Application.Resources />`,
          `</Application>`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `MainWindow.xaml`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `<Window x:Class="${P}.MainWindow"`,
          `        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"`,
          `        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"`,
          `        Title="${names.displayName}" Width="760" Height="480" WindowStartupLocation="CenterScreen">`,
          `    <Grid Margin="24">`,
          `        <StackPanel VerticalAlignment="Center">`,
          `            <TextBlock Text="${names.displayName}" FontSize="24" FontWeight="SemiBold" />`,
          `            <TextBlock Text="WPF .NET 8 • PerMonitorV2 High-DPI Desktop Shell" Margin="0,6,0,14" />`,
          `            <Button Content="Verify Workstation" Width="160" HorizontalAlignment="Left" Click="OnVerifyClick" />`,
          `        </StackPanel>`,
          `    </Grid>`,
          `</Window>`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `MainWindow.xaml.cs`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `using System.Windows;`,
          ``,
          `namespace ${P};`,
          ``,
          `public partial class MainWindow : Window`,
          `{`,
          `    public MainWindow() => InitializeComponent();`,
          ``,
          `    private void OnVerifyClick(object sender, RoutedEventArgs e)`,
          `    {`,
          `        MessageBox.Show("${names.displayName} is running with PerMonitorV2 DPI scaling.", "${P}");`,
          `    }`,
          `}`,
          ``,
        ].join('\r\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `Tests/${P}Tests.cs`,
        role: 'test',
        lineEndings: 'CRLF',
        textContent: `using Xunit;\n\nnamespace ${P}.Tests;\n\npublic class ${P}Tests\n{\n    [Fact]\n    public void SanityCheck_Passes() => Assert.Equal("${P}", "${P}");\n}\n`,
      });
    }
    return {
      files,
      entryFile: `MainWindow.xaml`,
      shortcuts: [
        { id: 'sc-build', label: 'dotnet build', command: `dotnet build ${P}.csproj`, category: 'build' },
        { id: 'sc-run', label: 'dotnet run', command: `dotnet run --project ${P}.csproj`, category: 'run' },
        { id: 'sc-pub', label: 'Publish Single-File EXE', command: `dotnet publish ${P}.csproj -c Release -r win-x64 --self-contained false`, category: 'package' },
      ],
    };
  }

  if (opts.language === 'cpp') {
    files.push(
      {
        relativePath: `CMakeLists.txt`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: [
          `cmake_minimum_required(VERSION 3.28)`,
          `project(${P} VERSION 0.1.0 LANGUAGES CXX)`,
          `set(CMAKE_CXX_STANDARD 20)`,
          `set(CMAKE_CXX_STANDARD_REQUIRED ON)`,
          ``,
          `add_executable(${P} WIN32`,
          `  src/main.cpp`,
          opts.includeBinaryIconAndRc ? `  assets/app.rc` : null,
          `)`,
          ``,
          `if(MSVC)`,
          `  target_compile_options(${P} PRIVATE /W4 /WX- /permissive- /utf-8)`,
          `endif()`,
          ``,
          opts.includeUnitTests
            ? `enable_testing()\nadd_executable(${P}_tests tests/app_test.cpp)\nadd_test(NAME ${P}UnitSuite COMMAND ${P}_tests)`
            : null,
          ``,
        ]
          .filter((l): l is string => l !== null)
          .join('\n'),
      },
      {
        relativePath: `CMakePresets.json`,
        role: 'build',
        lineEndings: 'LF',
        textContent:
          JSON.stringify(
            {
              version: 6,
              configurePresets: [
                {
                  name: 'windows-msvc-x64',
                  displayName: 'Windows MSVC x64 (Ninja)',
                  generator: 'Ninja',
                  binaryDir: '${sourceDir}/build/${presetName}',
                  architecture: { value: 'x64', strategy: 'external' },
                  cacheVariables: { CMAKE_BUILD_TYPE: 'RelWithDebInfo' },
                },
                {
                  name: 'windows-msvc-arm64',
                  displayName: 'Windows MSVC ARM64 (Ninja)',
                  generator: 'Ninja',
                  binaryDir: '${sourceDir}/build/${presetName}',
                  architecture: { value: 'arm64', strategy: 'external' },
                  cacheVariables: { CMAKE_BUILD_TYPE: 'RelWithDebInfo' },
                },
              ],
            },
            null,
            2
          ) + '\n',
      },
      {
        relativePath: `vcpkg.json`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent:
          JSON.stringify(
            {
              name: K,
              'version-string': '0.1.0',
              dependencies: opts.uiFrameworkId === 'qt' ? ['qtbase', 'fmt'] : ['fmt'],
            },
            null,
            2
          ) + '\n',
      },
      {
        relativePath: `src/main.cpp`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `// ${names.displayName} — Modern C++20 Windows Desktop Entry Point`,
          `#ifdef _WIN32`,
          `#define WIN32_LEAN_AND_MEAN`,
          `#include <windows.h>`,
          ``,
          `int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int nCmdShow) {`,
          `    (void)hInstance; (void)nCmdShow;`,
          `    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);`,
          `    MessageBoxW(nullptr, L"${names.displayName} initialized with PerMonitorV2 DPI.", L"${P}", MB_OK | MB_ICONINFORMATION);`,
          `    return 0;`,
          `}`,
          `#else`,
          `#include <iostream>`,
          `int main() { std::cout << "${names.displayName}\\n"; return 0; }`,
          `#endif`,
          ``,
        ].join('\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `tests/app_test.cpp`,
        role: 'test',
        lineEndings: 'LF',
        textContent: `#include <cassert>\n#include <string>\n\nint main() {\n    std::string appName = "${P}";\n    assert(!appName.empty());\n    return 0;\n}\n`,
      });
    }
    return {
      files,
      entryFile: `src/main.cpp`,
      shortcuts: [
        { id: 'sc-cfg', label: 'CMake Configure (x64)', command: 'cmake --preset windows-msvc-x64', category: 'build' },
        { id: 'sc-bld', label: 'CMake Build', command: 'cmake --build build/windows-msvc-x64', category: 'build' },
        { id: 'sc-tst', label: 'Run CTest Suite', command: 'ctest --test-dir build/windows-msvc-x64 --output-on-failure', category: 'test' },
      ],
    };
  }

  if (opts.language === 'rust') {
    files.push(
      {
        relativePath: `Cargo.toml`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: [
          `[package]`,
          `name = "${K}"`,
          `version = "0.1.0"`,
          `edition = "2021"`,
          `description = "${names.displayName} Windows desktop application"`,
          ``,
          `[dependencies]`,
          `serde = { version = "1.0", features = ["derive"] }`,
          `serde_json = "1.0"`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `tauri.conf.json`,
        role: 'packaging',
        lineEndings: 'LF',
        textContent:
          JSON.stringify(
            {
              $schema: 'https://schema.tauri.app/config/2',
              productName: names.displayName,
              version: '0.1.0',
              identifier: names.packageIdentifier.toLowerCase(),
              app: {
                windows: [{ title: names.displayName, width: 1080, height: 720, resizable: true }],
              },
              bundle: {
                active: true,
                targets: ['nsis', 'msi'],
                icon: ['assets/app.ico'],
              },
            },
            null,
            2
          ) + '\n',
      },
      {
        relativePath: `src/main.rs`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`,
          ``,
          `pub fn app_banner() -> String {`,
          `    format!("${names.displayName} ({})", std::env::consts::ARCH)`,
          `}`,
          ``,
          `fn main() {`,
          `    println!("{}", app_banner());`,
          `}`,
          ``,
          opts.includeUnitTests
            ? `#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn banner_contains_project_name() {\n        assert!(app_banner().contains("${names.displayName}"));\n    }\n}`
            : null,
          ``,
        ]
          .filter((l): l is string => l !== null)
          .join('\n'),
      },
      {
        relativePath: `ui/index.html`,
        role: 'source',
        lineEndings: 'LF',
        textContent: `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8" /><title>${names.displayName}</title></head>\n<body><h1>${names.displayName}</h1><p>Rust + Edge WebView2 Desktop App</p></body>\n</html>\n`,
      }
    );
    return {
      files,
      entryFile: `src/main.rs`,
      shortcuts: [
        { id: 'sc-chk', label: 'Cargo Clippy Lint', command: 'cargo clippy -- -D warnings', category: 'lint' },
        { id: 'sc-bld', label: 'Cargo Build Release', command: 'cargo build --release', category: 'build' },
        { id: 'sc-tst', label: 'Cargo Test', command: 'cargo test', category: 'test' },
      ],
    };
  }

  if (opts.language === 'ts-js') {
    files.push(
      {
        relativePath: `package.json`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent:
          JSON.stringify(
            {
              name: K,
              version: '0.1.0',
              private: true,
              description: `${names.displayName} — Electron Windows Desktop App`,
              main: 'electron/main.cjs',
              scripts: {
                dev: 'vite',
                build: 'tsc --noEmit && vite build',
                test: 'vitest run',
                'dist:win': 'electron-builder --win nsis portable',
              },
            },
            null,
            2
          ) + '\n',
      },
      {
        relativePath: `tsconfig.json`,
        role: 'build',
        lineEndings: 'LF',
        textContent:
          JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2022',
                module: 'ESNext',
                moduleResolution: 'Bundler',
                strict: true,
                noEmit: true,
              },
              include: ['src', 'tests'],
            },
            null,
            2
          ) + '\n',
      },
      {
        relativePath: `electron/main.cjs`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `const { app, BrowserWindow } = require('electron');`,
          `const path = require('node:path');`,
          ``,
          `function createWindow() {`,
          `  const win = new BrowserWindow({`,
          `    width: 1200,`,
          `    height: 780,`,
          `    title: '${names.displayName.replace(/'/g, "\\'")}',`,
          `    webPreferences: {`,
          `      preload: path.join(__dirname, 'preload.cjs'),`,
          `      contextIsolation: true,`,
          `      nodeIntegration: false,`,
          `      sandbox: true,`,
          `    },`,
          `  });`,
          `  win.loadFile('index.html');`,
          `}`,
          ``,
          `app.whenReady().then(createWindow);`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `electron/preload.cjs`,
        role: 'source',
        lineEndings: 'LF',
        textContent: `const { contextBridge } = require('electron');\ncontextBridge.exposeInMainWorld('desktopHost', { arch: process.arch, platform: process.platform });\n`,
      },
      {
        relativePath: `src/main.ts`,
        role: 'source',
        lineEndings: 'LF',
        textContent: `export function getAppHeader(): string {\n  return '${names.displayName.replace(/'/g, "\\'")} (Windows Desktop Ready)';\n}\n`,
      },
      {
        relativePath: `electron-builder.yml`,
        role: 'packaging',
        lineEndings: 'LF',
        textContent: [
          `appId: ${names.packageIdentifier.toLowerCase()}`,
          `productName: ${names.displayName}`,
          `win:`,
          `  icon: assets/app.ico`,
          `  target:`,
          `    - target: nsis`,
          `      arch: [x64, arm64]`,
          ``,
        ].join('\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `tests/app.test.ts`,
        role: 'test',
        lineEndings: 'LF',
        textContent: `import { describe, expect, it } from 'vitest';\nimport { getAppHeader } from '../src/main';\n\ndescribe('${P}', () => {\n  it('returns desktop header', () => {\n    expect(getAppHeader()).toContain('${names.displayName.replace(/'/g, "\\'")}');\n  });\n});\n`,
      });
    }
    return {
      files,
      entryFile: `src/main.ts`,
      shortcuts: [
        { id: 'sc-dev', label: 'Start Vite Dev Server', command: 'npm run dev', category: 'run' },
        { id: 'sc-test', label: 'Run Vitest Suite', command: 'npm test', category: 'test' },
        { id: 'sc-pkg', label: 'Package Windows EXE', command: 'npm run dist:win', category: 'package' },
      ],
    };
  }

  if (opts.language === 'python') {
    files.push(
      {
        relativePath: `pyproject.toml`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: [
          `[project]`,
          `name = "${K}"`,
          `version = "0.1.0"`,
          `description = "${names.displayName} Windows Desktop Utility"`,
          `requires-python = ">=3.11"`,
          `dependencies = ["PySide6>=6.7.0"]`,
          ``,
          `[project.optional-dependencies]`,
          `dev = ["pytest>=8.3.0", "pyinstaller>=6.10.0"]`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `src/${S}/__init__.py`,
        role: 'source',
        lineEndings: 'LF',
        textContent: `__version__ = "0.1.0"\nAPP_TITLE = "${names.displayName}"\n`,
      },
      {
        relativePath: `src/${S}/main.py`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `import os`,
          `import sys`,
          `from PySide6.QtWidgets import QApplication, QLabel, QMainWindow, QVBoxLayout, QWidget`,
          ``,
          `os.environ.setdefault("QT_ENABLE_HIGHDPI_SCALING", "1")`,
          ``,
          `class MainWindow(QMainWindow):`,
          `    def __init__(self) -> None:`,
          `        super().__init__()`,
          `        self.setWindowTitle("${names.displayName}")`,
          `        self.resize(840, 520)`,
          `        root = QWidget()`,
          `        layout = QVBoxLayout(root)`,
          `        layout.addWidget(QLabel("${names.displayName} — PySide6 High-DPI Desktop Shell"))`,
          `        self.setCentralWidget(root)`,
          ``,
          `def main() -> int:`,
          `    app = QApplication(sys.argv)`,
          `    win = MainWindow()`,
          `    win.show()`,
          `    return app.exec()`,
          ``,
          `if __name__ == "__main__":`,
          `    raise SystemExit(main())`,
          ``,
        ].join('\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `tests/test_app.py`,
        role: 'test',
        lineEndings: 'LF',
        textContent: `from ${S} import APP_TITLE, __version__\n\ndef test_metadata() -> None:\n    assert APP_TITLE == "${names.displayName}"\n    assert __version__ == "0.1.0"\n`,
      });
    }
    return {
      files,
      entryFile: `src/${S}/main.py`,
      shortcuts: [
        { id: 'sc-sync', label: 'uv sync (.venv)', command: 'uv sync --all-extras', category: 'build' },
        { id: 'sc-run', label: 'Launch PySide6 App', command: `uv run python -m ${S}.main`, category: 'run' },
        { id: 'sc-test', label: 'Run pytest', command: 'uv run pytest', category: 'test' },
        { id: 'sc-exe', label: 'Build PyInstaller EXE', command: `uv run pyinstaller --noconsole --name ${P} --icon assets/app.ico src/${S}/main.py`, category: 'package' },
      ],
    };
  }

  if (opts.language === 'kotlin') {
    files.push(
      {
        relativePath: `settings.gradle.kts`,
        role: 'build',
        lineEndings: 'LF',
        textContent: `rootProject.name = "${K}"\n`,
      },
      {
        relativePath: `build.gradle.kts`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: [
          `import org.jetbrains.compose.desktop.application.dsl.TargetFormat`,
          ``,
          `plugins {`,
          `    kotlin("jvm") version "2.0.21"`,
          `    id("org.jetbrains.compose") version "1.7.0"`,
          `}`,
          ``,
          `compose.desktop {`,
          `    application {`,
          `        mainClass = "MainKt"`,
          `        nativeDistributions {`,
          `            targetFormats(TargetFormat.Msi, TargetFormat.Exe)`,
          `            packageName = "${P}"`,
          `            packageVersion = "1.0.0"`,
          `            windows {`,
          `                perUserInstall = true`,
          `                iconFile.set(project.file("assets/app.ico"))`,
          `            }`,
          `        }`,
          `    }`,
          `}`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `src/main/kotlin/Main.kt`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `import androidx.compose.material.MaterialTheme`,
          `import androidx.compose.material.Text`,
          `import androidx.compose.ui.window.Window`,
          `import androidx.compose.ui.window.application`,
          ``,
          `fun main() = application {`,
          `    Window(onCloseRequest = ::exitApplication, title = "${names.displayName}") {`,
          `        MaterialTheme {`,
          `            Text("${names.displayName} — Compose Multiplatform for Windows")`,
          `        }`,
          `    }`,
          `}`,
          ``,
        ].join('\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `src/test/kotlin/AppTest.kt`,
        role: 'test',
        lineEndings: 'LF',
        textContent: `import kotlin.test.Test\nimport kotlin.test.assertTrue\n\nclass AppTest {\n    @Test\n    fun sanity() {\n        assertTrue("${P}".isNotEmpty())\n    }\n}\n`,
      });
    }
    return {
      files,
      entryFile: `src/main/kotlin/Main.kt`,
      shortcuts: [
        { id: 'sc-run', label: 'Run Compose Desktop', command: './gradlew run', category: 'run' },
        { id: 'sc-test', label: 'Gradle Test', command: './gradlew test', category: 'test' },
        { id: 'sc-msi', label: 'Package Windows MSI', command: './gradlew packageMsi', category: 'package' },
      ],
    };
  }

  if (opts.language === 'dart') {
    files.push(
      {
        relativePath: `pubspec.yaml`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: [
          `name: ${S}`,
          `description: ${names.displayName} Windows desktop client.`,
          `publish_to: 'none'`,
          `version: 0.1.0+1`,
          `environment:`,
          `  sdk: ^3.5.0`,
          `dependencies:`,
          `  flutter:`,
          `    sdk: flutter`,
          `dev_dependencies:`,
          `  flutter_test:`,
          `    sdk: flutter`,
          `  msix: ^3.16.8`,
          `msix_config:`,
          `  display_name: ${names.displayName}`,
          `  identity_name: ${names.packageIdentifier}`,
          `  logo_path: assets/app.ico`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `lib/main.dart`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `import 'package:flutter/material.dart';`,
          ``,
          `void main() => runApp(const ${P}App());`,
          ``,
          `class ${P}App extends StatelessWidget {`,
          `  const ${P}App({super.key});`,
          `  @override`,
          `  Widget build(BuildContext context) {`,
          `    return MaterialApp(`,
          `      title: '${names.displayName.replace(/'/g, "\\'")}',`,
          `      theme: ThemeData(colorSchemeSeed: Colors.lightBlue, useMaterial3: true),`,
          `      home: const Scaffold(body: Center(child: Text('${names.displayName.replace(/'/g, "\\'")} • Flutter Windows'))),`,
          `    );`,
          `  }`,
          `}`,
          ``,
        ].join('\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `test/widget_test.dart`,
        role: 'test',
        lineEndings: 'LF',
        textContent: `import 'package:flutter_test/flutter_test.dart';\nimport 'package:${S}/main.dart';\n\nvoid main() {\n  testWidgets('renders title', (tester) async {\n    await tester.pumpWidget(const ${P}App());\n    expect(find.textContaining('${P.slice(0, 6)}'), findsWidgets);\n  });\n}\n`,
      });
    }
    return {
      files,
      entryFile: `lib/main.dart`,
      shortcuts: [
        { id: 'sc-run', label: 'Run Windows Target', command: 'flutter run -d windows', category: 'run' },
        { id: 'sc-bld', label: 'Build Release EXE', command: 'flutter build windows --release', category: 'build' },
        { id: 'sc-msix', label: 'Build MSIX Bundle', command: 'dart run msix:create', category: 'package' },
      ],
    };
  }

  if (opts.language === 'go') {
    files.push(
      {
        relativePath: `go.mod`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: `module example.com/${K}\n\ngo 1.23\n`,
      },
      {
        relativePath: `wails.json`,
        role: 'packaging',
        lineEndings: 'LF',
        textContent: JSON.stringify({ name: names.displayName, outputfilename: P }, null, 2) + '\n',
      },
      {
        relativePath: `main.go`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `package main`,
          ``,
          `import (`,
          `\t"fmt"`,
          `\t"runtime"`,
          `)`,
          ``,
          `func StatusBanner() string {`,
          `\treturn fmt.Sprintf("${names.displayName} (%s/%s)", runtime.GOOS, runtime.GOARCH)`,
          `}`,
          ``,
          `func main() {`,
          `\tfmt.Println(StatusBanner())`,
          `}`,
          ``,
        ].join('\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `main_test.go`,
        role: 'test',
        lineEndings: 'LF',
        textContent: `package main\n\nimport (\n\t"strings"\n\t"testing"\n)\n\nfunc TestStatusBanner(t *testing.T) {\n\tif !strings.Contains(StatusBanner(), "${names.displayName}") {\n\t\tt.Fatalf("unexpected banner")\n\t}\n}\n`,
      });
    }
    return {
      files,
      entryFile: `main.go`,
      shortcuts: [
        { id: 'sc-bld', label: 'Build GUI Binary (-H windowsgui)', command: `GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -H windowsgui" -o bin/${P}.exe .`, category: 'build' },
        { id: 'sc-tst', label: 'Run go test', command: 'go test ./...', category: 'test' },
      ],
    };
  }

  if (opts.language === 'vbnet') {
    files.push(
      {
        relativePath: `${P}.vbproj`,
        role: 'manifest',
        lineEndings: 'CRLF',
        textContent: [
          `<Project Sdk="Microsoft.NET.Sdk">`,
          `  <PropertyGroup>`,
          `    <OutputType>WinExe</OutputType>`,
          `    <TargetFramework>net8.0-windows</TargetFramework>`,
          `    <RootNamespace>${P}</RootNamespace>`,
          `    <StartupObject>Sub Main</StartupObject>`,
          `    <UseWindowsForms>true</UseWindowsForms>`,
          `    <ApplicationHighDpiMode>PerMonitorV2</ApplicationHighDpiMode>`,
          `    <Platforms>${archSemis}</Platforms>`,
          `  </PropertyGroup>`,
          `</Project>`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `Program.vb`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `Imports System.Windows.Forms`,
          ``,
          `Module Program`,
          `    <STAThread>`,
          `    Sub Main()`,
          `        ApplicationConfiguration.Initialize()`,
          `        Application.Run(New MainForm())`,
          `    End Sub`,
          `End Module`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `MainForm.vb`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `Imports System.Windows.Forms`,
          ``,
          `Public Class MainForm`,
          `    Inherits Form`,
          `    Public Sub New()`,
          `        Me.Text = "${names.displayName}"`,
          `        Me.Width = 760`,
          `        Me.Height = 480`,
          `    End Sub`,
          `End Class`,
          ``,
        ].join('\r\n'),
      }
    );
    return {
      files,
      entryFile: `MainForm.vb`,
      shortcuts: [
        { id: 'sc-bld', label: 'Build VB.NET WinForms', command: `dotnet build ${P}.vbproj`, category: 'build' },
        { id: 'sc-run', label: 'Run VB.NET App', command: `dotnet run --project ${P}.vbproj`, category: 'run' },
      ],
    };
  }

  if (opts.language === 'fsharp') {
    files.push(
      {
        relativePath: `${P}.fsproj`,
        role: 'manifest',
        lineEndings: 'CRLF',
        textContent: [
          `<Project Sdk="Microsoft.NET.Sdk">`,
          `  <PropertyGroup>`,
          `    <OutputType>WinExe</OutputType>`,
          `    <TargetFramework>net8.0</TargetFramework>`,
          `    <Platforms>${archSemis}</Platforms>`,
          `  </PropertyGroup>`,
          `  <ItemGroup>`,
          `    <Compile Include="Program.fs" />`,
          `  </ItemGroup>`,
          `  <ItemGroup>`,
          `    <PackageReference Include="Avalonia.Desktop" Version="11.2.0" />`,
          `    <PackageReference Include="Avalonia.FuncUI" Version="1.5.1" />`,
          `  </ItemGroup>`,
          `</Project>`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `Program.fs`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `module ${P}.Program`,
          ``,
          `open System.Runtime.InteropServices`,
          ``,
          `type Model = { Counter: int; Title: string }`,
          `let init () = { Counter = 0; Title = "${names.displayName}" }`,
          ``,
          `[<EntryPoint>]`,
          `let main _argv =`,
          `    let m = init ()`,
          `    printfn "%s ready on %O" m.Title RuntimeInformation.ProcessArchitecture`,
          `    0`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `scripts/InteractiveCheck.fsx`,
        role: 'source',
        lineEndings: 'LF',
        textContent: `printfn "[FSI] ${names.displayName} prototype environment active."\n`,
      }
    );
    return {
      files,
      entryFile: `Program.fs`,
      shortcuts: [
        { id: 'sc-bld', label: 'Build F# Project', command: `dotnet build ${P}.fsproj`, category: 'build' },
        { id: 'sc-fsi', label: 'Run F# Interactive Script', command: 'dotnet fsi scripts/InteractiveCheck.fsx', category: 'run' },
      ],
    };
  }

  if (opts.language === 'java') {
    const pkgLower = names.companyClean.toLowerCase();
    files.push(
      {
        relativePath: `pom.xml`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: [
          `<project xmlns="http://maven.apache.org/POM/4.0.0"`,
          `         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`,
          `         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">`,
          `  <modelVersion>4.0.0</modelVersion>`,
          `  <groupId>com.${pkgLower}</groupId>`,
          `  <artifactId>${K}</artifactId>`,
          `  <version>0.1.0</version>`,
          `  <properties>`,
          `    <maven.compiler.release>21</maven.compiler.release>`,
          `    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>`,
          `  </properties>`,
          `</project>`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `src/main/java/com/${pkgLower}/${P}App.java`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `package com.${pkgLower};`,
          ``,
          `public final class ${P}App {`,
          `    public static String banner() {`,
          `        return "${names.displayName} (Java " + Runtime.version() + ")";`,
          `    }`,
          `    public static void main(String[] args) {`,
          `        System.out.println(banner());`,
          `    }`,
          `}`,
          ``,
        ].join('\n'),
      }
    );
    return {
      files,
      entryFile: `src/main/java/com/${pkgLower}/${P}App.java`,
      shortcuts: [
        { id: 'sc-bld', label: 'Maven Package', command: 'mvn test package', category: 'build' },
        { id: 'sc-msi', label: 'Build jpackage MSI', command: `jpackage --name ${P} --input target --main-jar ${K}-0.1.0.jar --type msi --icon assets/app.ico`, category: 'package' },
      ],
    };
  }

  if (opts.language === 'swift') {
    files.push(
      {
        relativePath: `Package.swift`,
        role: 'manifest',
        lineEndings: 'LF',
        textContent: [
          `// swift-tools-version: 5.10`,
          `import PackageDescription`,
          ``,
          `let package = Package(`,
          `    name: "${P}",`,
          `    targets: [`,
          `        .executableTarget(name: "${P}"),`,
          opts.includeUnitTests ? `        .testTarget(name: "${P}Tests", dependencies: ["${P}"]),` : null,
          `    ]`,
          `)`,
          ``,
        ]
          .filter((l): l is string => l !== null)
          .join('\n'),
      },
      {
        relativePath: `Sources/${P}/main.swift`,
        role: 'source',
        lineEndings: 'LF',
        textContent: [
          `import Foundation`,
          ``,
          `public struct ${P}App {`,
          `    public static let title = "${names.displayName}"`,
          `}`,
          `print("\\(${P}App.title) — Swift on Windows Ready")`,
          ``,
        ].join('\n'),
      },
      {
        relativePath: `remote-build.json`,
        role: 'build',
        lineEndings: 'LF',
        textContent:
          JSON.stringify(
            {
              windowsTriple: 'x86_64-unknown-windows-msvc',
              optionalDarwinRemoteHost: 'ssh://mac-build-runner.internal',
            },
            null,
            2
          ) + '\n',
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `Tests/${P}Tests/${P}Tests.swift`,
        role: 'test',
        lineEndings: 'LF',
        textContent: `import XCTest\n@testable import ${P}\n\nfinal class ${P}Tests: XCTestCase {\n    func testTitle() {\n        XCTAssertEqual(${P}App.title, "${names.displayName}")\n    }\n}\n`,
      });
    }
    return {
      files,
      entryFile: `Sources/${P}/main.swift`,
      shortcuts: [
        { id: 'sc-bld', label: 'swift build', command: 'swift build', category: 'build' },
        { id: 'sc-tst', label: 'swift test', command: 'swift test', category: 'test' },
      ],
    };
  }

  if (opts.language === 'delphi') {
    files.push(
      {
        relativePath: `${P}.dpr`,
        role: 'manifest',
        lineEndings: 'CRLF',
        textContent: [
          `program ${P};`,
          ``,
          `uses`,
          `  Vcl.Forms,`,
          `  uMainForm in 'uMainForm.pas' {MainForm};`,
          ``,
          `{$R *.res}`,
          ``,
          `begin`,
          `  Application.Initialize;`,
          `  Application.MainFormOnTaskbar := True;`,
          `  Application.Title := '${names.displayName.replace(/'/g, "''")}';`,
          `  Application.CreateForm(TMainForm, MainForm);`,
          `  Application.Run;`,
          `end.`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `uMainForm.pas`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `unit uMainForm;`,
          ``,
          `interface`,
          `uses`,
          `  Winapi.Windows, System.Classes, Vcl.Controls, Vcl.Forms, Vcl.StdCtrls;`,
          ``,
          `type`,
          `  TMainForm = class(TForm)`,
          `  end;`,
          ``,
          `var`,
          `  MainForm: TMainForm;`,
          ``,
          `implementation`,
          `{$R *.dfm}`,
          `end.`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `uMainForm.dfm`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `object MainForm: TMainForm`,
          `  Left = 0`,
          `  Top = 0`,
          `  Caption = '${names.displayName.replace(/'/g, "''")}'`,
          `  ClientHeight = 460`,
          `  ClientWidth = 760`,
          `  PixelsPerInch = 96`,
          `end`,
          ``,
        ].join('\r\n'),
      }
    );
    return {
      files,
      entryFile: `${P}.dpr`,
      shortcuts: [
        { id: 'sc-dcc', label: 'Compile Win64 (dcc64)', command: `dcc64 -B ${P}.dpr`, category: 'build' },
      ],
    };
  }

  if (opts.language === 'powershell') {
    files.push(
      {
        relativePath: `${P}.psd1`,
        role: 'manifest',
        lineEndings: 'CRLF',
        textContent: [
          `@{`,
          `  RootModule = 'Show-${P}.ps1'`,
          `  ModuleVersion = '0.1.0'`,
          `  GUID = '${names.guidUpper.toLowerCase()}'`,
          `  Author = '${names.companyName.replace(/'/g, "''")}'`,
          `  CompanyName = '${names.companyName.replace(/'/g, "''")}'`,
          `  Description = '${names.displayName.replace(/'/g, "''")} WPF Desktop Utility'`,
          `  PowerShellVersion = '7.2'`,
          `}`,
          ``,
        ].join('\r\n'),
      },
      {
        relativePath: `Show-${P}.ps1`,
        role: 'source',
        lineEndings: 'CRLF',
        textContent: [
          `[CmdletBinding()]`,
          `param([switch]$HeadlessCheck)`,
          ``,
          `function Get-${P}Banner {`,
          `  return "${names.displayName} (PowerShell $($PSVersionTable.PSVersion))"` ,
          `}`,
          ``,
          `if ($HeadlessCheck) {`,
          `  Write-Output (Get-${P}Banner)`,
          `  return`,
          `}`,
          ``,
          `Add-Type -AssemblyName PresentationFramework`,
          `[xml]$xaml = @"`,
          `<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"`,
          `        Title="${names.displayName}" Width="640" Height="380" WindowStartupLocation="CenterScreen">`,
          `  <StackPanel Margin="24">`,
          `    <TextBlock Text="${names.displayName}" FontSize="20" FontWeight="SemiBold"/>`,
          `    <TextBlock Text="PowerShell + WPF Desktop Diagnostic Tool" Margin="0,8,0,0"/>`,
          `  </StackPanel>`,
          `</Window>`,
          `"@`,
          `$reader = New-Object System.Xml.XmlNodeReader $xaml`,
          `$window = [Windows.Markup.XamlReader]::Load($reader)`,
          `$null = $window.ShowDialog()`,
          ``,
        ].join('\r\n'),
      }
    );
    if (opts.includeUnitTests) {
      files.push({
        relativePath: `Tests/${P}.Tests.ps1`,
        role: 'test',
        lineEndings: 'CRLF',
        textContent: [
          `Describe '${P}' {`,
          `  It 'returns startup banner in headless mode' {`,
          `    $out = & "$PSScriptRoot/../Show-${P}.ps1" -HeadlessCheck`,
          `    $out | Should -Match '${P.slice(0, 6)}'`,
          `  }`,
          `}`,
          ``,
        ].join('\r\n'),
      });
    }
    return {
      files,
      entryFile: `Show-${P}.ps1`,
      shortcuts: [
        { id: 'sc-run', label: 'Run WPF Script', command: `pwsh -NoProfile -File ./Show-${P}.ps1`, category: 'run' },
        { id: 'sc-tst', label: 'Run Pester Suite', command: 'pwsh -NoProfile -Command "Invoke-Pester ./Tests"', category: 'test' },
      ],
    };
  }

  // Fallback for custom / plugin / legacy languages (Ruby, PHP, Lua, Haskell, Julia, custom-legacy)
  const defaultBuild =
    BUILD_SYSTEMS.find((b) => b.id === opts.buildSystemId)?.defaultCommands.build || 'echo "Configure build command"';
  files.push(
    {
      relativePath: `devbench.adapter.json`,
      role: 'manifest',
      lineEndings: 'LF',
      textContent:
        JSON.stringify(
          {
            schemaVersion: '1.1',
            id: `adapter-${K}`,
            name: `${names.displayName} Custom Toolchain`,
            language: opts.language,
            tasks: [{ id: 'build', label: 'Build Project', command: defaultBuild, category: 'build' }],
          },
          null,
          2
        ) + '\n',
    },
    {
      relativePath: `src/main.txt`,
      role: 'source',
      lineEndings: 'LF',
      textContent: `${names.displayName} (${opts.language}) — Custom Windows Toolchain Workspace\n`,
    }
  );
  return {
    files,
    entryFile: `devbench.adapter.json`,
    shortcuts: [{ id: 'sc-custom-bld', label: 'Run Custom Build', command: defaultBuild, category: 'build' }],
  };
}

function assembleScaffoldArtifacts(opts: ScaffoldRequestOptions): {
  names: DerivedNames;
  artifacts: GeneratedArtifact[];
  entryFile: string;
  shortcuts: ProjectTaskShortcut[];
} {
  const names = deriveProjectNames(opts.projectName, opts.companyName, opts.packageIdentifier);
  const archs = opts.targetArchitectures.length > 0 ? opts.targetArchitectures : (['x64'] as ('x64' | 'ARM64')[]);
  const { files: langFiles, entryFile, shortcuts } = buildLanguageTemplateFiles(
    { ...opts, targetArchitectures: archs },
    names
  );

  const artifacts: GeneratedArtifact[] = [...langFiles];

  if (opts.includeWin32Manifest) {
    artifacts.push({
      relativePath: `app.manifest`,
      role: 'packaging',
      lineEndings: 'CRLF',
      textContent: buildWin32AppManifestXml(names),
    });
  }

  if (opts.includeMsixManifest) {
    artifacts.push({
      relativePath: `Package.appxmanifest`,
      role: 'packaging',
      lineEndings: 'CRLF',
      textContent: buildMsixAppxManifestXml(names, archs, opts.windowsSdkTarget || '10.0.22621.0'),
    });
  }

  if (opts.includeBinaryIconAndRc) {
    const icoBuf = generateMultiSizeIco(opts.accentHex || '#0284c7', [16, 32, 48, 256]);
    const rcScript = generateWin32ResourceRc({
      productName: names.displayName,
      companyName: names.companyName,
      fileDescription: `${names.displayName} Windows Desktop Application`,
      version: '0.1.0.0',
      icoFilename: 'app.ico',
    });
    artifacts.push(
      {
        relativePath: `assets/app.ico`,
        role: 'packaging',
        lineEndings: 'BINARY',
        binaryBuffer: icoBuf,
      },
      {
        relativePath: `assets/app.rc`,
        role: 'packaging',
        lineEndings: 'CRLF',
        textContent: rcScript,
      }
    );
  }

  if (opts.includeBuildScripts) {
    const buildCmd = shortcuts.find((s) => s.category === 'build')?.command || 'echo "Build"';
    const testCmd = shortcuts.find((s) => s.category === 'test')?.command || 'echo "Test"';
    artifacts.push({
      relativePath: `scripts/build-windows.ps1`,
      role: 'build',
      lineEndings: 'CRLF',
      textContent: buildPowerShellBuildScript(names, buildCmd, testCmd, archs),
    });
  }

  if (opts.includeGitScaffold) {
    artifacts.push(
      {
        relativePath: `.gitignore`,
        role: 'git',
        lineEndings: 'LF',
        textContent: buildGitignoreForLanguage(opts.language),
      },
      {
        relativePath: `.gitattributes`,
        role: 'git',
        lineEndings: 'CRLF',
        textContent: buildGitattributes(),
      }
    );
  }

  const langLabel = LANGUAGE_ADAPTERS.find((l) => l.id === opts.language)?.name || opts.language;
  const uiLabel = UI_FRAMEWORKS.find((u) => u.id === opts.uiFrameworkId)?.name || opts.uiFrameworkId;

  artifacts.push(
    {
      relativePath: `README.md`,
      role: 'docs',
      lineEndings: 'LF',
      textContent: [
        `# ${names.displayName}`,
        ``,
        `Scaffolded with **DevBench Windows Software Development Toolkit**.`,
        ``,
        `- **Language**: ${langLabel}`,
        `- **UI Framework**: ${uiLabel}`,
        `- **Publisher**: ${names.companyName} (\`${names.packageIdentifier}\`)`,
        `- **Architectures**: ${archs.join(', ')}`,
        `- **Windows SDK Target**: \`${opts.windowsSdkTarget || '10.0.22621.0'}\``,
        ``,
        `## Quick Start (PowerShell)`,
        ``,
        '```powershell',
        `./scripts/build-windows.ps1 -Configuration Debug -Platform ${archs[0]} -RunTests`,
        '```',
        ``,
      ].join('\n'),
    },
    {
      relativePath: `.devbench-project.json`,
      role: 'manifest',
      lineEndings: 'LF',
      textContent:
        JSON.stringify(
          {
            schema: 'devbench-scaffolded-project/v1.2',
            name: names.displayName,
            slug: names.folderName,
            companyName: names.companyName,
            packageIdentifier: names.packageIdentifier,
            templateId: opts.templateId,
            language: opts.language,
            uiFrameworkId: opts.uiFrameworkId,
            buildSystemId: opts.buildSystemId,
            packageManagerId: opts.packageManagerId,
            targetArchitectures: archs,
            windowsSdkTarget: opts.windowsSdkTarget || '10.0.22621.0',
            entryFile,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        ) + '\n',
    }
  );

  return { names, artifacts, entryFile, shortcuts };
}

function countExistingFiles(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  const walk = (d: string) => {
    for (const item of fs.readdirSync(d, { withFileTypes: true })) {
      if (item.name === '.git') continue;
      const full = path.join(d, item.name);
      if (item.isDirectory()) walk(full);
      else count++;
    }
  };
  walk(dirPath);
  return count;
}

export function previewProjectScaffold(opts: ScaffoldRequestOptions): ScaffoldPreviewResponse {
  const { names, artifacts, entryFile, shortcuts } = assembleScaffoldArtifacts(opts);
  const targetDir = `workspaces/${names.folderName}`;
  const absTarget = resolveSafeWorkspacePath(targetDir);
  const alreadyExists = fs.existsSync(absTarget);
  const existingFileCount = alreadyExists ? countExistingFiles(absTarget) : 0;

  const files: ScaffoldPreviewFile[] = artifacts.map((art) => {
    const workspacePath = `${targetDir}/${art.relativePath}`;
    if (art.lineEndings === 'BINARY' && art.binaryBuffer) {
      return {
        relativePath: art.relativePath,
        workspacePath,
        bytes: art.binaryBuffer.length,
        isBinary: true,
        lineEndings: 'BINARY',
        role: art.role,
        previewContent: `[Binary Multi-Resolution Windows .ico — ${art.binaryBuffer.length} bytes | Frames: 16x16, 32x32, 48x48, 256x256 RGBA PNG]`,
      };
    }
    const text = art.textContent || '';
    return {
      relativePath: art.relativePath,
      workspacePath,
      bytes: Buffer.byteLength(text, 'utf8'),
      isBinary: false,
      lineEndings: art.lineEndings,
      role: art.role,
      previewContent: text,
    };
  });

  const totalBytes = files.reduce((acc, f) => acc + f.bytes, 0);
  const suggestedBookmarks: { label: string; file: string; line: number }[] = [
    { label: 'Application Entry Point', file: `${targetDir}/${entryFile}`, line: 1 },
  ];
  if (opts.includeWin32Manifest) {
    suggestedBookmarks.push({
      label: 'Win32 PerMonitorV2 Manifest',
      file: `${targetDir}/app.manifest`,
      line: 19,
    });
  }
  if (opts.includeMsixManifest) {
    suggestedBookmarks.push({
      label: 'MSIX Package.appxmanifest',
      file: `${targetDir}/Package.appxmanifest`,
      line: 1,
    });
  }

  return {
    projectSlug: names.folderName,
    projectPascal: names.pascalName,
    targetDir,
    alreadyExists,
    existingFileCount,
    totalFiles: files.length,
    totalBytes,
    entryFile: `${targetDir}/${entryFile}`,
    files,
    suggestedShortcuts: shortcuts,
    suggestedBookmarks,
  };
}

export function executeProjectScaffold(
  opts: ScaffoldRequestOptions,
  consentConfirmed: boolean,
  overwrite = false
): {
  preview: ScaffoldPreviewResponse;
  workspaceProject: ProjectWorkspace;
  gitInitialized: boolean;
} {
  if (!consentConfirmed) {
    throw new ScaffoldConsentError(
      'Explicit user consent is required before scaffolding project directories and files onto disk.'
    );
  }

  const preview = previewProjectScaffold(opts);
  const absTarget = resolveSafeWorkspacePath(preview.targetDir);
  const workspacesRoot = resolveSafeWorkspacePath('workspaces');
  if (!absTarget.startsWith(workspacesRoot + path.sep)) {
    throw new Error('Scaffolded projects must reside directly inside workspaces/<projectName>.');
  }

  if (preview.alreadyExists && preview.existingFileCount > 0 && !overwrite) {
    throw new Error(
      `Directory "${preview.targetDir}" already exists with ${preview.existingFileCount} file(s). Enable overwrite or pick a new project name.`
    );
  }

  const { names, artifacts } = assembleScaffoldArtifacts(opts);
  fs.mkdirSync(absTarget, { recursive: true });

  for (const art of artifacts) {
    const fileAbs = resolveSafeWorkspacePath(`${preview.targetDir}/${art.relativePath}`);
    if (!fileAbs.startsWith(absTarget + path.sep)) {
      throw new Error(`Invalid artifact path: ${art.relativePath}`);
    }
    fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
    if (art.lineEndings === 'BINARY' && art.binaryBuffer) {
      fs.writeFileSync(fileAbs, art.binaryBuffer);
    } else {
      const normalized = (art.textContent || '').replace(/\r?\n/g, art.lineEndings === 'CRLF' ? '\r\n' : '\n');
      fs.writeFileSync(fileAbs, normalized, 'utf8');
    }
  }

  let gitInitialized = false;
  if (opts.initGitRepo) {
    try {
      execFileSync('git', ['init'], { cwd: absTarget, stdio: 'ignore' });
      gitInitialized = true;
    } catch {
      gitInitialized = false;
    }
  }

  const runnerId =
    opts.testRunnerId ||
    TEST_RUNNERS.find((r) => r.compatibleLanguages.includes(opts.language))?.id ||
    'vitest';
  const debuggerId =
    opts.debuggerId ||
    DEBUGGER_ADAPTERS.find((d) => d.compatibleLanguages.includes(opts.language))?.id ||
    'node-inspector';
  const langObj = LANGUAGE_ADAPTERS.find((l) => l.id === opts.language);
  const uiObj = UI_FRAMEWORKS.find((u) => u.id === opts.uiFrameworkId);

  const workspaceProject: ProjectWorkspace = {
    id: `proj-scaf-${names.kebabSlug}-${Date.now()}`,
    name: names.displayName,
    path: preview.targetDir,
    isLiveWorkspace: true,
    favorite: true,
    lastOpened: new Date().toISOString(),
    tags: [
      'Scaffolded on Disk',
      langObj?.name || opts.language,
      uiObj?.name.split(' ')[0] || opts.uiFrameworkId,
    ],
    profileId: 'profile-full',
    language: opts.language,
    uiFrameworkId: opts.uiFrameworkId,
    buildSystemId: opts.buildSystemId,
    packageManagerId: opts.packageManagerId,
    testRunnerId: runnerId,
    debuggerId,
    pinnedVersions: {},
    targetArchitectures: opts.targetArchitectures.length > 0 ? opts.targetArchitectures : ['x64'],
    windowsSdkTarget: opts.windowsSdkTarget || '10.0.22621.0',
    notes: `Scaffolded on disk at ${preview.targetDir} (${preview.totalFiles} files, Publisher: ${names.companyName}).`,
    docLinks: [],
    bookmarks: preview.suggestedBookmarks,
    todos: [
      {
        id: `td-1-${Date.now()}`,
        text: `Inspect generated entry file ${preview.entryFile} in Code Editor`,
        done: false,
        tag: 'Scaffold',
      },
      {
        id: `td-2-${Date.now()}`,
        text: `Verify Windows PerMonitorV2 & MSIX settings in ${preview.targetDir}`,
        done: false,
        tag: 'Windows',
      },
    ],
    shortcuts: preview.suggestedShortcuts,
    envVars: [
      {
        key: 'SIGNING_CERT_REF',
        value: `vault://windows-signing/${names.kebabSlug}`,
        isSecretRef: true,
        secretVaultKey: 'SIGNING_CERT_REF',
      },
    ],
  };

  return { preview, workspaceProject, gitInitialized };
}

export function listScaffoldedWorkspaces(): ScaffoldedWorkspaceItem[] {
  const workspacesDir = path.join(WORKSPACE_ROOT, 'workspaces');
  if (!fs.existsSync(workspacesDir)) return [];

  const out: ScaffoldedWorkspaceItem[] = [];
  for (const dirent of fs.readdirSync(workspacesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue;
    const projDir = path.join(workspacesDir, dirent.name);
    const metaPath = path.join(projDir, '.devbench-project.json');
    let meta: Record<string, unknown> = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        meta = {};
      }
    }

    const relFiles: string[] = [];
    let totalBytes = 0;
    const walk = (d: string) => {
      for (const item of fs.readdirSync(d, { withFileTypes: true })) {
        if (item.name === '.git' || item.name === 'node_modules' || item.name === 'target') continue;
        const full = path.join(d, item.name);
        if (item.isDirectory()) walk(full);
        else {
          const st = fs.statSync(full);
          totalBytes += st.size;
          relFiles.push(path.relative(projDir, full).split(path.sep).join('/'));
        }
      }
    };
    walk(projDir);
    relFiles.sort();

    const stat = fs.statSync(projDir);
    const entryRel = typeof meta.entryFile === 'string' ? meta.entryFile : relFiles[0] || 'README.md';
    out.push({
      slug: dirent.name,
      name: typeof meta.name === 'string' ? meta.name : dirent.name,
      workspaceDir: `workspaces/${dirent.name}`,
      language: (meta.language as LanguageId) || 'csharp',
      uiFrameworkId: typeof meta.uiFrameworkId === 'string' ? meta.uiFrameworkId : 'winui3',
      buildSystemId: typeof meta.buildSystemId === 'string' ? meta.buildSystemId : 'msbuild-dotnet',
      packageManagerId: typeof meta.packageManagerId === 'string' ? meta.packageManagerId : 'nuget',
      templateId: typeof meta.templateId === 'string' ? meta.templateId : 'custom',
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : stat.mtime.toISOString(),
      fileCount: relFiles.length,
      totalBytes,
      entryFile: `workspaces/${dirent.name}/${entryRel}`,
      gitInitialized: fs.existsSync(path.join(projDir, '.git')),
      files: relFiles,
    });
  }

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteScaffoldedWorkspace(slug: string, consentConfirmed: boolean): { deleted: string } {
  if (!consentConfirmed) {
    throw new ScaffoldConsentError(
      'Explicit user consent is required before deleting a scaffolded workspace directory.'
    );
  }
  const clean = (slug || '').trim();
  if (!clean || clean.includes('/') || clean.includes('\\') || clean.includes('..')) {
    throw new Error('Invalid workspace slug.');
  }
  const workspacesRoot = resolveSafeWorkspacePath('workspaces');
  const targetAbs = resolveSafeWorkspacePath(`workspaces/${clean}`);
  if (path.dirname(targetAbs) !== workspacesRoot) {
    throw new Error('Deletion target must be a direct subdirectory inside workspaces/.');
  }
  if (!fs.existsSync(targetAbs)) {
    throw new Error(`Scaffolded workspace "workspaces/${clean}" does not exist.`);
  }
  fs.rmSync(targetAbs, { recursive: true, force: true });
  return { deleted: `workspaces/${clean}` };
}
