import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { LanguageId, ToolchainProbeResult } from '../../shared/types';

const execFileAsync = promisify(execFile);

interface ProbeSpec {
  id: string;
  name: string;
  category: ToolchainProbeResult['category'];
  binary: string;
  args: string[];
  compatibleLanguages: LanguageId[];
  installCommandWindows: string;
  uninstallCommandWindows: string;
}

const PROBE_SPECS: ProbeSpec[] = [
  {
    id: 'dotnet',
    name: '.NET SDK',
    category: 'Runtime / SDK',
    binary: 'dotnet',
    args: ['--version'],
    compatibleLanguages: ['csharp', 'vbnet', 'fsharp'],
    installCommandWindows: 'winget install Microsoft.DotNet.SDK.8 --exact',
    uninstallCommandWindows: 'winget uninstall Microsoft.DotNet.SDK.8',
  },
  {
    id: 'node',
    name: 'Node.js Runtime',
    category: 'Runtime / SDK',
    binary: 'node',
    args: ['--version'],
    compatibleLanguages: ['ts-js'],
    installCommandWindows: 'winget install OpenJS.NodeJS.LTS --exact',
    uninstallCommandWindows: 'winget uninstall OpenJS.NodeJS.LTS',
  },
  {
    id: 'npm',
    name: 'npm Package Manager',
    category: 'Package Manager',
    binary: 'npm',
    args: ['--version'],
    compatibleLanguages: ['ts-js'],
    installCommandWindows: 'winget install OpenJS.NodeJS.LTS --exact',
    uninstallCommandWindows: 'winget uninstall OpenJS.NodeJS.LTS',
  },
  {
    id: 'python3',
    name: 'Python Interpreter',
    category: 'Runtime / SDK',
    binary: process.platform === 'win32' ? 'python' : 'python3',
    args: ['--version'],
    compatibleLanguages: ['python'],
    installCommandWindows: 'winget install Python.Python.3.12 --exact',
    uninstallCommandWindows: 'winget uninstall Python.Python.3.12',
  },
  {
    id: 'uv',
    name: 'uv (Python Env & Package Manager)',
    category: 'Package Manager',
    binary: 'uv',
    args: ['--version'],
    compatibleLanguages: ['python'],
    installCommandWindows: 'winget install astral-sh.uv --exact',
    uninstallCommandWindows: 'winget uninstall astral-sh.uv',
  },
  {
    id: 'rustc',
    name: 'Rust Compiler (rustc)',
    category: 'Compiler',
    binary: 'rustc',
    args: ['--version'],
    compatibleLanguages: ['rust'],
    installCommandWindows: 'winget install Rustlang.Rustup --exact',
    uninstallCommandWindows: 'winget uninstall Rustlang.Rustup',
  },
  {
    id: 'cargo',
    name: 'Cargo Build & Package Manager',
    category: 'Build System',
    binary: 'cargo',
    args: ['--version'],
    compatibleLanguages: ['rust'],
    installCommandWindows: 'winget install Rustlang.Rustup --exact',
    uninstallCommandWindows: 'winget uninstall Rustlang.Rustup',
  },
  {
    id: 'cmake',
    name: 'CMake Build Generator',
    category: 'Build System',
    binary: 'cmake',
    args: ['--version'],
    compatibleLanguages: ['cpp', 'dart', 'swift'],
    installCommandWindows: 'winget install Kitware.CMake --exact',
    uninstallCommandWindows: 'winget uninstall Kitware.CMake',
  },
  {
    id: 'clang',
    name: 'LLVM / Clang++ Compiler',
    category: 'Compiler',
    binary: 'clang++',
    args: ['--version'],
    compatibleLanguages: ['cpp'],
    installCommandWindows: 'winget install LLVM.LLVM --exact',
    uninstallCommandWindows: 'winget uninstall LLVM.LLVM',
  },
  {
    id: 'ninja',
    name: 'Ninja Build System',
    category: 'Build System',
    binary: 'ninja',
    args: ['--version'],
    compatibleLanguages: ['cpp', 'swift'],
    installCommandWindows: 'winget install Ninja-build.Ninja --exact',
    uninstallCommandWindows: 'winget uninstall Ninja-build.Ninja',
  },
  {
    id: 'vcpkg',
    name: 'vcpkg C/C++ Package Manager',
    category: 'Package Manager',
    binary: 'vcpkg',
    args: ['version'],
    compatibleLanguages: ['cpp'],
    installCommandWindows: 'git clone https://github.com/microsoft/vcpkg C:\\vcpkg && C:\\vcpkg\\bootstrap-vcpkg.bat',
    uninstallCommandWindows: 'Remove-Item -Recurse -Force C:\\vcpkg',
  },
  {
    id: 'java',
    name: 'Java JDK (OpenJDK)',
    category: 'Runtime / SDK',
    binary: 'java',
    args: ['--version'],
    compatibleLanguages: ['java', 'kotlin'],
    installCommandWindows: 'winget install Microsoft.OpenJDK.21 --exact',
    uninstallCommandWindows: 'winget uninstall Microsoft.OpenJDK.21',
  },
  {
    id: 'gradle',
    name: 'Gradle Build Tool',
    category: 'Build System',
    binary: 'gradle',
    args: ['--version'],
    compatibleLanguages: ['kotlin', 'java'],
    installCommandWindows: 'winget install Gradle.Gradle --exact',
    uninstallCommandWindows: 'winget uninstall Gradle.Gradle',
  },
  {
    id: 'flutter',
    name: 'Flutter & Dart Desktop SDK',
    category: 'Runtime / SDK',
    binary: 'flutter',
    args: ['--version'],
    compatibleLanguages: ['dart'],
    installCommandWindows: 'winget install Google.Flutter --exact',
    uninstallCommandWindows: 'winget uninstall Google.Flutter',
  },
  {
    id: 'go',
    name: 'Go Toolchain',
    category: 'Runtime / SDK',
    binary: 'go',
    args: ['version'],
    compatibleLanguages: ['go'],
    installCommandWindows: 'winget install GoLang.Go --exact',
    uninstallCommandWindows: 'winget uninstall GoLang.Go',
  },
  {
    id: 'swift',
    name: 'Swift Toolchain',
    category: 'Compiler',
    binary: 'swift',
    args: ['--version'],
    compatibleLanguages: ['swift'],
    installCommandWindows: 'winget install Swift.Toolchain --exact',
    uninstallCommandWindows: 'winget uninstall Swift.Toolchain',
  },
  {
    id: 'pwsh',
    name: 'PowerShell 7 (pwsh)',
    category: 'Windows SDK / Host',
    binary: 'pwsh',
    args: ['--version'],
    compatibleLanguages: ['powershell'],
    installCommandWindows: 'winget install Microsoft.PowerShell --exact',
    uninstallCommandWindows: 'winget uninstall Microsoft.PowerShell',
  },
  {
    id: 'git',
    name: 'Git SCM',
    category: 'Windows SDK / Host',
    binary: 'git',
    args: ['--version'],
    compatibleLanguages: ['csharp', 'cpp', 'rust', 'python', 'ts-js', 'java', 'kotlin', 'go', 'dart', 'swift'],
    installCommandWindows: 'winget install Git.Git --exact',
    uninstallCommandWindows: 'winget uninstall Git.Git',
  },
  {
    id: 'gh',
    name: 'GitHub CLI (gh)',
    category: 'Container / Cloud',
    binary: 'gh',
    args: ['--version'],
    compatibleLanguages: ['ts-js', 'csharp', 'cpp', 'rust', 'python', 'go'],
    installCommandWindows: 'winget install GitHub.cli --exact',
    uninstallCommandWindows: 'winget uninstall GitHub.cli',
  },
  {
    id: 'docker',
    name: 'Docker / Container CLI',
    category: 'Container / Cloud',
    binary: 'docker',
    args: ['--version'],
    compatibleLanguages: ['ts-js', 'csharp', 'python', 'go', 'java'],
    installCommandWindows: 'winget install Docker.DockerDesktop --exact',
    uninstallCommandWindows: 'winget uninstall Docker.DockerDesktop',
  },
];

async function resolveBinaryPath(binary: string): Promise<string | null> {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(locator, [binary], { timeout: 1500 });
    const first = stdout.trim().split(/\r?\n/)[0];
    return first || null;
  } catch {
    return null;
  }
}

export async function probeAllToolchains(): Promise<{
  hostPlatform: string;
  hostArch: string;
  isWindowsHost: boolean;
  results: ToolchainProbeResult[];
}> {
  const results = await Promise.all(
    PROBE_SPECS.map(async (spec): Promise<ToolchainProbeResult> => {
      const binPath = await resolveBinaryPath(spec.binary);
      if (!binPath) {
        return {
          id: spec.id,
          name: spec.name,
          category: spec.category,
          binary: spec.binary,
          installed: false,
          detectedVersion: null,
          path: null,
          source: 'live-host',
          installCommandWindows: spec.installCommandWindows,
          uninstallCommandWindows: spec.uninstallCommandWindows,
          compatibleLanguages: spec.compatibleLanguages,
          statusNote: 'Not detected on host PATH — install on demand when needed by a project.',
        };
      }
      try {
        const { stdout, stderr } = await execFileAsync(spec.binary, spec.args, { timeout: 2500 });
        const raw = (stdout || stderr).trim().split(/\r?\n/)[0] || 'Detected';
        return {
          id: spec.id,
          name: spec.name,
          category: spec.category,
          binary: spec.binary,
          installed: true,
          detectedVersion: raw.slice(0, 80),
          path: binPath,
          source: 'live-host',
          installCommandWindows: spec.installCommandWindows,
          uninstallCommandWindows: spec.uninstallCommandWindows,
          compatibleLanguages: spec.compatibleLanguages,
          statusNote: 'Ready on host PATH',
        };
      } catch {
        return {
          id: spec.id,
          name: spec.name,
          category: spec.category,
          binary: spec.binary,
          installed: true,
          detectedVersion: 'Installed (version probe restricted)',
          path: binPath,
          source: 'live-host',
          installCommandWindows: spec.installCommandWindows,
          uninstallCommandWindows: spec.uninstallCommandWindows,
          compatibleLanguages: spec.compatibleLanguages,
          statusNote: 'Binary located on PATH',
        };
      }
    })
  );

  // Check Windows SDK kit presence (real check on win32; transparent preview descriptor off-win32)
  const winKitsDir = 'C:\\Program Files (x86)\\Windows Kits\\10\\Include';
  const isWin = process.platform === 'win32';
  let winSdkInstalled = false;
  let winSdkVer: string | null = null;
  if (isWin && fs.existsSync(winKitsDir)) {
    const versions = fs.readdirSync(winKitsDir).filter((d) => d.startsWith('10.0.'));
    if (versions.length > 0) {
      winSdkInstalled = true;
      winSdkVer = versions.sort().reverse()[0];
    }
  }

  results.unshift({
    id: 'windows-sdk',
    name: 'Windows 11 SDK (Windows Kits 10)',
    category: 'Windows SDK / Host',
    binary: 'signtool.exe / makeappx.exe',
    installed: winSdkInstalled,
    detectedVersion: winSdkVer,
    path: winSdkInstalled ? winKitsDir : null,
    source: isWin ? 'live-host' : 'windows-simulated-preview',
    installCommandWindows: 'winget install Microsoft.WindowsSDK.10.0.22621 --exact',
    uninstallCommandWindows: 'winget uninstall Microsoft.WindowsSDK.10.0.22621',
    compatibleLanguages: ['csharp', 'cpp', 'rust', 'vbnet', 'fsharp', 'dart', 'swift'],
    statusNote: isWin
      ? winSdkInstalled
        ? `Windows SDK ${winSdkVer} verified`
        : 'Windows Kits 10 directory not found'
      : 'Running in non-Windows container preview; manifest validation & .wsb generation remain active.',
  });

  return {
    hostPlatform: process.platform,
    hostArch: process.arch,
    isWindowsHost: isWin,
    results,
  };
}

export function inspectPathEntries(): {
  delimiter: string;
  entries: { index: number; path: string; exists: boolean; duplicate: boolean }[];
} {
  const raw = process.env.PATH || '';
  const delimiter = path.delimiter;
  const parts = raw.split(delimiter).filter(Boolean);
  const seen = new Set<string>();

  const entries = parts.map((p, index) => {
    const normalized = process.platform === 'win32' ? p.toLowerCase() : p;
    const duplicate = seen.has(normalized);
    seen.add(normalized);
    let exists = false;
    try {
      exists = fs.existsSync(p);
    } catch {
      exists = false;
    }
    return { index: index + 1, path: p, exists, duplicate };
  });

  return { delimiter, entries };
}
