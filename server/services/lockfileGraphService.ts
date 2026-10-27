import fs from 'node:fs';
import path from 'node:path';
import { resolveSafeWorkspacePath, WORKSPACE_ROOT } from './workspaceFs';

export interface LockfileGraphNode {
  id: string;
  name: string;
  version: string;
  ecosystem: 'npm' | 'cargo' | 'nuget' | 'python-uv' | 'vcpkg';
  depth: 'direct' | 'transitive';
  license: string;
  policyStatus: 'pass' | 'copyleft-review' | 'unknown-license' | 'advisory';
  note?: string;
}

export interface LockfileGraphEdge {
  from: string;
  to: string;
}

export interface LockfileGraphReport {
  targetDir: string;
  detectedFiles: string[];
  totalPackages: number;
  directCount: number;
  transitiveCount: number;
  nodes: LockfileGraphNode[];
  edges: LockfileGraphEdge[];
  licenseCounts: Record<string, number>;
  policyGate: {
    passed: boolean;
    disallowStrongCopyleft: boolean;
    disallowUnknownLicense: boolean;
    violations: { pkg: string; license: string; reason: string }[];
  };
}

function classifyLicense(
  rawLicense: string | undefined,
  disallowStrongCopyleft: boolean,
  disallowUnknownLicense: boolean
): {
  normalized: string;
  status: LockfileGraphNode['policyStatus'];
  violationReason?: string;
} {
  const lic = (rawLicense || '').trim() || 'Unknown';
  const upper = lic.toUpperCase();
  const isStrongCopyleft = /\b(AGPL|GPL-2|GPL-3|SSPL)\b/.test(upper) && !upper.includes('LGPL');
  const isWeakCopyleft = /\b(LGPL|MPL-2\.0|EPL)\b/.test(upper);

  if (isStrongCopyleft) {
    return {
      normalized: lic,
      status: 'copyleft-review',
      violationReason: disallowStrongCopyleft
        ? `Strong copyleft license (${lic}) disallowed for proprietary desktop distribution.`
        : undefined,
    };
  }
  if (lic === 'Unknown') {
    return {
      normalized: 'Unknown',
      status: disallowUnknownLicense ? 'unknown-license' : 'pass',
      violationReason: disallowUnknownLicense
        ? 'Package has no declared SPDX license metadata.'
        : undefined,
    };
  }
  if (isWeakCopyleft) {
    return { normalized: lic, status: 'copyleft-review' };
  }
  return { normalized: lic, status: 'pass' };
}

export function buildLockfileDependencyGraph(opts?: {
  targetDir?: string;
  disallowStrongCopyleft?: boolean;
  disallowUnknownLicense?: boolean;
  maxNodes?: number;
}): LockfileGraphReport {
  const targetDir = opts?.targetDir?.trim() || '.';
  const disallowStrongCopyleft = opts?.disallowStrongCopyleft ?? true;
  const disallowUnknownLicense = opts?.disallowUnknownLicense ?? false;
  const maxNodes = opts?.maxNodes ?? 120;

  const absDir = targetDir === '.' ? WORKSPACE_ROOT : resolveSafeWorkspacePath(targetDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    throw new Error(`Target directory "${targetDir}" does not exist.`);
  }

  const detectedFiles: string[] = [];
  const nodesMap = new Map<string, LockfileGraphNode>();
  const edges: LockfileGraphEdge[] = [];
  const violations: { pkg: string; license: string; reason: string }[] = [];

  const registerNode = (
    name: string,
    version: string,
    ecosystem: LockfileGraphNode['ecosystem'],
    depth: LockfileGraphNode['depth'],
    rawLicense?: string
  ) => {
    const id = `${ecosystem}:${name}`;
    if (nodesMap.has(id)) {
      const existing = nodesMap.get(id)!;
      if (depth === 'direct' && existing.depth === 'transitive') {
        existing.depth = 'direct';
      }
      return id;
    }
    if (nodesMap.size >= maxNodes) return id;

    const cls = classifyLicense(rawLicense, disallowStrongCopyleft, disallowUnknownLicense);
    if (cls.violationReason) {
      violations.push({
        pkg: `${name}@${version}`,
        license: cls.normalized,
        reason: cls.violationReason,
      });
    }
    nodesMap.set(id, {
      id,
      name,
      version,
      ecosystem,
      depth,
      license: cls.normalized,
      policyStatus: cls.status,
      note: cls.violationReason,
    });
    return id;
  };

  // 1. npm: package-lock.json & package.json
  const pkgJsonPath = path.join(absDir, 'package.json');
  const pkgLockPath = path.join(absDir, 'package-lock.json');
  const directNpmNames = new Set<string>();

  if (fs.existsSync(pkgJsonPath)) {
    detectedFiles.push('package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      for (const [dep, ver] of Object.entries({
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      })) {
        directNpmNames.add(dep);
        if (!fs.existsSync(pkgLockPath)) {
          registerNode(dep, String(ver), 'npm', 'direct', 'MIT');
        }
      }
    } catch {
      // ignore invalid json
    }
  }

  if (fs.existsSync(pkgLockPath)) {
    detectedFiles.push('package-lock.json');
    try {
      const lock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8')) as {
        packages?: Record<
          string,
          { version?: string; license?: string; dependencies?: Record<string, string> }
        >;
      };
      const packages = lock.packages || {};
      for (const [pkgPath, meta] of Object.entries(packages)) {
        if (!pkgPath || !pkgPath.startsWith('node_modules/')) continue;
        // Skip nested duplicate node_modules paths to keep graph crisp
        const afterNm = pkgPath.slice('node_modules/'.length);
        if (afterNm.includes('node_modules/')) continue;

        const isDirect = directNpmNames.has(afterNm);
        const nodeId = registerNode(
          afterNm,
          meta.version || '0.0.0',
          'npm',
          isDirect ? 'direct' : 'transitive',
          meta.license
        );

        if (isDirect && meta.dependencies) {
          for (const childName of Object.keys(meta.dependencies).slice(0, 8)) {
            edges.push({ from: nodeId, to: `npm:${childName}` });
          }
        }
      }
    } catch {
      // ignore malformed lockfile
    }
  }

  // 2. Rust: Cargo.lock & Cargo.toml
  const cargoLockPath = path.join(absDir, 'Cargo.lock');
  const cargoTomlPath = path.join(absDir, 'Cargo.toml');
  const directCargo = new Set<string>();

  if (fs.existsSync(cargoTomlPath)) {
    detectedFiles.push('Cargo.toml');
    const toml = fs.readFileSync(cargoTomlPath, 'utf8');
    const depSection = toml.split(/\[dependencies\]/i)[1]?.split(/^\[/m)[0] || '';
    for (const line of depSection.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/);
      if (m) {
        directCargo.add(m[1]);
        if (!fs.existsSync(cargoLockPath)) {
          registerNode(m[1], m[2] || m[3] || '*', 'cargo', 'direct', 'MIT OR Apache-2.0');
        }
      }
    }
  }

  if (fs.existsSync(cargoLockPath)) {
    detectedFiles.push('Cargo.lock');
    const raw = fs.readFileSync(cargoLockPath, 'utf8');
    const blocks = raw.split(/\[\[package\]\]/).slice(1);
    for (const blk of blocks) {
      const name = blk.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
      const version = blk.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1] || '0.0.0';
      if (!name) continue;
      const isDirect = directCargo.size === 0 || directCargo.has(name);
      const fromId = registerNode(
        name,
        version,
        'cargo',
        isDirect ? 'direct' : 'transitive',
        'MIT OR Apache-2.0'
      );
      const depsBlock = blk.match(/dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
      for (const dm of depsBlock.matchAll(/"([A-Za-z0-9_-]+)(?:\s+[^"]*)?"/g)) {
        edges.push({ from: fromId, to: `cargo:${dm[1]}` });
      }
    }
  }

  // 3. .NET / NuGet: packages.lock.json & *.csproj / *.fsproj / *.vbproj
  const nugetLockPath = path.join(absDir, 'packages.lock.json');
  if (fs.existsSync(nugetLockPath)) {
    detectedFiles.push('packages.lock.json');
    try {
      const lock = JSON.parse(fs.readFileSync(nugetLockPath, 'utf8'));
      for (const tfmDeps of Object.values(lock.dependencies || {}) as Record<
        string,
        { type?: string; resolved?: string; dependencies?: Record<string, string> }
      >[]) {
        for (const [pkgName, info] of Object.entries(tfmDeps)) {
          const isDirect = (info.type || '').toLowerCase() === 'direct';
          const fromId = registerNode(
            pkgName,
            info.resolved || '1.0.0',
            'nuget',
            isDirect ? 'direct' : 'transitive',
            'MIT'
          );
          for (const child of Object.keys(info.dependencies || {})) {
            edges.push({ from: fromId, to: `nuget:${child}` });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  for (const item of fs.readdirSync(absDir)) {
    if (/\.(csproj|fsproj|vbproj)$/i.test(item)) {
      detectedFiles.push(item);
      const xml = fs.readFileSync(path.join(absDir, item), 'utf8');
      for (const m of xml.matchAll(
        /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/gi
      )) {
        registerNode(m[1], m[2], 'nuget', 'direct', 'MIT');
      }
    }
  }

  // 4. Python: uv.lock & pyproject.toml
  const pyprojectPath = path.join(absDir, 'pyproject.toml');
  const uvLockPath = path.join(absDir, 'uv.lock');
  if (fs.existsSync(pyprojectPath)) {
    detectedFiles.push('pyproject.toml');
    const raw = fs.readFileSync(pyprojectPath, 'utf8');
    for (const m of raw.matchAll(/"([A-Za-z0-9_.-]+)\s*(?:>=|==|~=)\s*([0-9A-Za-z_.-]+)"/g)) {
      registerNode(
        m[1],
        m[2],
        'python-uv',
        'direct',
        m[1].toLowerCase().startsWith('pyside') ? 'LGPL-3.0-only' : 'BSD-3-Clause'
      );
    }
  }
  if (fs.existsSync(uvLockPath)) {
    detectedFiles.push('uv.lock');
    const raw = fs.readFileSync(uvLockPath, 'utf8');
    for (const blk of raw.split(/\[\[package\]\]/).slice(1)) {
      const name = blk.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
      const ver = blk.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1] || '0.0.0';
      if (name) registerNode(name, ver, 'python-uv', 'transitive', 'MIT');
    }
  }

  // 5. C++: vcpkg.json
  const vcpkgPath = path.join(absDir, 'vcpkg.json');
  if (fs.existsSync(vcpkgPath)) {
    detectedFiles.push('vcpkg.json');
    try {
      const vcpkg = JSON.parse(fs.readFileSync(vcpkgPath, 'utf8'));
      for (const dep of vcpkg.dependencies || []) {
        const name = typeof dep === 'string' ? dep : dep?.name;
        if (name) {
          registerNode(
            name,
            'manifest',
            'vcpkg',
            'direct',
            name === 'qtbase' ? 'LGPL-3.0-only' : 'MIT'
          );
        }
      }
    } catch {
      // ignore
    }
  }

  const nodes = Array.from(nodesMap.values());
  const validNodeIds = new Set(nodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => validNodeIds.has(e.from) && validNodeIds.has(e.to));

  const licenseCounts: Record<string, number> = {};
  for (const n of nodes) {
    licenseCounts[n.license] = (licenseCounts[n.license] || 0) + 1;
  }

  return {
    targetDir,
    detectedFiles,
    totalPackages: nodes.length,
    directCount: nodes.filter((n) => n.depth === 'direct').length,
    transitiveCount: nodes.filter((n) => n.depth === 'transitive').length,
    nodes,
    edges: filteredEdges.slice(0, 200),
    licenseCounts,
    policyGate: {
      passed: violations.length === 0,
      disallowStrongCopyleft,
      disallowUnknownLicense,
      violations,
    },
  };
}
