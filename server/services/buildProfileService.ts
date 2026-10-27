import fs from 'node:fs';
import path from 'node:path';
import { BUILD_SYSTEMS, DEBUGGER_ADAPTERS } from '../../shared/catalog/ecosystems';
import { LanguageId } from '../../shared/types';
import { resolveSafeWorkspacePath } from './workspaceFs';

export interface BuildLaunchProfileEntry {
  id: string;
  label: string;
  configuration: 'Debug' | 'Release' | 'Sanitizer' | 'Publish';
  architecture: 'x64' | 'ARM64';
  buildCommand: string;
  debuggerType: string;
  symbolFormat: string;
  env: Record<string, string>;
}

export interface BuildLaunchMatrixResult {
  projectName: string;
  language: LanguageId;
  buildSystemName: string;
  debuggerName: string;
  profiles: BuildLaunchProfileEntry[];
  vscodeLaunchJson: Record<string, unknown>;
  cmakePresetsJson: Record<string, unknown>;
}

export function buildLaunchProfileMatrix(opts: {
  projectName: string;
  language: LanguageId;
  buildSystemId: string;
  programArgs?: string;
}): BuildLaunchMatrixResult {
  const projectName = (opts.projectName || 'DesktopApp').trim();
  const buildSys =
    BUILD_SYSTEMS.find((b) => b.id === opts.buildSystemId) ||
    BUILD_SYSTEMS.find((b) => b.compatibleLanguages.includes(opts.language)) ||
    BUILD_SYSTEMS[0];
  const dbg =
    DEBUGGER_ADAPTERS.find((d) => d.compatibleLanguages.includes(opts.language)) ||
    DEBUGGER_ADAPTERS[0];

  const argsList = (opts.programArgs || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const isDotNet = ['csharp', 'vbnet', 'fsharp'].includes(opts.language);
  const isCpp = opts.language === 'cpp';
  const isRust = opts.language === 'rust';
  const isPython = opts.language === 'python';
  const isGo = opts.language === 'go';

  const debuggerType = isDotNet
    ? 'coreclr'
    : isCpp
      ? 'cppvsdbg'
      : isRust
        ? 'lldb'
        : isPython
          ? 'debugpy'
          : isGo
            ? 'go'
            : 'pwa-node';

  const symbolFormat =
    isDotNet ? 'Portable PDB (.pdb)' : isCpp || isRust ? 'Win32 Native PDB (.pdb)' : 'Source Maps / DWARF';

  const makeBuildCmd = (cfg: 'Debug' | 'Release' | 'Sanitizer' | 'Publish', arch: 'x64' | 'ARM64') => {
    const rid = arch === 'ARM64' ? 'win-arm64' : 'win-x64';
    if (isDotNet) {
      if (cfg === 'Publish') {
        return `dotnet publish -c Release -r ${rid} --self-contained true -p:PublishSingleFile=true`;
      }
      return `dotnet build -c ${cfg === 'Sanitizer' ? 'Debug' : cfg} -r ${rid}`;
    }
    if (isCpp) {
      if (cfg === 'Sanitizer') {
        return `cmake -B build/${arch.toLowerCase()}-asan -DCMAKE_CXX_FLAGS="/fsanitize=address /Zi" && cmake --build build/${arch.toLowerCase()}-asan`;
      }
      return `cmake --preset windows-${arch.toLowerCase()}-${cfg === 'Publish' ? 'release' : cfg.toLowerCase()} && cmake --build --preset windows-${arch.toLowerCase()}-${cfg === 'Publish' ? 'release' : cfg.toLowerCase()}`;
    }
    if (isRust) {
      const target = arch === 'ARM64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
      return cfg === 'Debug' || cfg === 'Sanitizer'
        ? `cargo build --target ${target}`
        : `cargo build --release --target ${target}`;
    }
    if (isGo) {
      const goarch = arch === 'ARM64' ? 'arm64' : 'amd64';
      return `GOOS=windows GOARCH=${goarch} go build -ldflags="-H=windowsgui" -o bin/${projectName}-${arch}.exe .`;
    }
    return cfg === 'Publish' ? buildSys.defaultCommands.publish : buildSys.defaultCommands.build;
  };

  const profiles: BuildLaunchProfileEntry[] = [
    {
      id: 'debug-x64',
      label: 'Debug (Windows x64)',
      configuration: 'Debug',
      architecture: 'x64',
      buildCommand: makeBuildCmd('Debug', 'x64'),
      debuggerType,
      symbolFormat,
      env: { DOTNET_ENVIRONMENT: 'Development', DEVBENCH_ARCH: 'x64', DPI_AWARENESS: 'PerMonitorV2' },
    },
    {
      id: 'debug-arm64',
      label: 'Debug (Windows ARM64)',
      configuration: 'Debug',
      architecture: 'ARM64',
      buildCommand: makeBuildCmd('Debug', 'ARM64'),
      debuggerType,
      symbolFormat,
      env: { DOTNET_ENVIRONMENT: 'Development', DEVBENCH_ARCH: 'ARM64', DPI_AWARENESS: 'PerMonitorV2' },
    },
    {
      id: 'release-x64',
      label: 'Release Optimized (Windows x64)',
      configuration: 'Release',
      architecture: 'x64',
      buildCommand: makeBuildCmd('Release', 'x64'),
      debuggerType,
      symbolFormat,
      env: { NODE_ENV: 'production', DEVBENCH_ARCH: 'x64' },
    },
    {
      id: 'release-arm64',
      label: 'Release Optimized (Windows ARM64)',
      configuration: 'Release',
      architecture: 'ARM64',
      buildCommand: makeBuildCmd('Release', 'ARM64'),
      debuggerType,
      symbolFormat,
      env: { NODE_ENV: 'production', DEVBENCH_ARCH: 'ARM64' },
    },
    {
      id: 'asan-x64',
      label: 'AddressSanitizer / Checked Heap (x64)',
      configuration: 'Sanitizer',
      architecture: 'x64',
      buildCommand: makeBuildCmd('Sanitizer', 'x64'),
      debuggerType,
      symbolFormat,
      env: { ASAN_OPTIONS: 'halt_on_error=1:symbolize=1', DEVBENCH_ARCH: 'x64' },
    },
    {
      id: 'publish-x64',
      label: 'Distributable Desktop Package (x64)',
      configuration: 'Publish',
      architecture: 'x64',
      buildCommand: makeBuildCmd('Publish', 'x64'),
      debuggerType,
      symbolFormat,
      env: { NODE_ENV: 'production', DEVBENCH_PACKAGING: 'MSIX_NSIS' },
    },
  ];

  const vscodeLaunchJson = {
    version: '0.2.0',
    configurations: profiles.slice(0, 4).map((p) => ({
      name: `${projectName}: ${p.label}`,
      type: p.debuggerType,
      request: 'launch',
      cwd: '${workspaceFolder}',
      args: argsList,
      env: p.env,
    })),
  };

  const cmakePresetsJson = {
    version: 6,
    cmakeMinimumRequired: { major: 3, minor: 26, patch: 0 },
    configurePresets: [
      {
        name: 'windows-x64-debug',
        displayName: 'Windows x64 Debug (Ninja + MSVC)',
        generator: 'Ninja',
        binaryDir: '${sourceDir}/build/x64-debug',
        architecture: { value: 'x64', strategy: 'external' },
        cacheVariables: { CMAKE_BUILD_TYPE: 'Debug' },
      },
      {
        name: 'windows-x64-release',
        displayName: 'Windows x64 Release (Ninja + MSVC)',
        generator: 'Ninja',
        binaryDir: '${sourceDir}/build/x64-release',
        architecture: { value: 'x64', strategy: 'external' },
        cacheVariables: { CMAKE_BUILD_TYPE: 'Release' },
      },
      {
        name: 'windows-arm64-release',
        displayName: 'Windows ARM64 Release (Cross/Native)',
        generator: 'Ninja',
        binaryDir: '${sourceDir}/build/arm64-release',
        architecture: { value: 'arm64', strategy: 'external' },
        cacheVariables: { CMAKE_BUILD_TYPE: 'Release' },
      },
    ],
  };

  return {
    projectName,
    language: opts.language,
    buildSystemName: buildSys.name,
    debuggerName: dbg.name,
    profiles,
    vscodeLaunchJson,
    cmakePresetsJson,
  };
}

export function saveLaunchConfigToWorkspace(opts: {
  workspaceSlug: string;
  vscodeLaunchJson: Record<string, unknown>;
  includeCmakePresets?: boolean;
  cmakePresetsJson?: Record<string, unknown>;
  consentConfirmed: boolean;
}) {
  if (!opts.consentConfirmed) {
    throw new Error('Explicit user consent is required before writing launch configurations to disk.');
  }
  const slug = (opts.workspaceSlug || '').trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(slug) || slug.includes('..')) {
    throw new Error('Invalid scaffolded workspace slug.');
  }
  const wsDir = resolveSafeWorkspacePath(`workspaces/${slug}`);
  if (!fs.existsSync(wsDir)) {
    throw new Error(`Workspace "workspaces/${slug}" does not exist.`);
  }

  const vscodeDir = path.join(wsDir, '.vscode');
  fs.mkdirSync(vscodeDir, { recursive: true });
  const launchRel = `workspaces/${slug}/.vscode/launch.json`;
  fs.writeFileSync(
    path.join(vscodeDir, 'launch.json'),
    JSON.stringify(opts.vscodeLaunchJson, null, 2) + '\n',
    'utf8'
  );

  const writtenFiles = [launchRel];
  if (opts.includeCmakePresets && opts.cmakePresetsJson) {
    const cmakeRel = `workspaces/${slug}/CMakePresets.json`;
    fs.writeFileSync(
      path.join(wsDir, 'CMakePresets.json'),
      JSON.stringify(opts.cmakePresetsJson, null, 2) + '\n',
      'utf8'
    );
    writtenFiles.push(cmakeRel);
  }

  return { writtenFiles };
}
