import fs from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpServer } from '../server/index';
import { buildLaunchProfileMatrix } from '../server/services/buildProfileService';
import { probeWindowsHostDiagnostics } from '../server/services/windowsHostBridge';

describe('DevBench v1.5 Upgrades (Cross-Arch Build/Launch Matrix, Git Stash/Tag/Patch Flows & Windows Host Registry)', () => {
  let server: Server;
  let baseUrl = '';
  const wsSlug = 'v15-git-launch-fixture';
  const wsDir = path.resolve(process.cwd(), 'workspaces', wsSlug);

  beforeAll(async () => {
    fs.rmSync(wsDir, { recursive: true, force: true });
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'README.md'), '# Fixture App\n', 'utf8');

    server = createHttpServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    fs.rmSync(wsDir, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('generates x64/ARM64 Debug/Release/Sanitizer/Publish launch matrices across C#, C++, Rust & Go', () => {
    const csMatrix = buildLaunchProfileMatrix({
      projectName: 'TelemetryWinUI',
      language: 'csharp',
      buildSystemId: 'msbuild-dotnet',
      programArgs: '--dpi=pmv2',
    });
    expect(csMatrix.profiles).toHaveLength(6);
    expect(csMatrix.profiles.some((p) => p.architecture === 'ARM64' && p.buildCommand.includes('win-arm64'))).toBe(
      true
    );

    const cppMatrix = buildLaunchProfileMatrix({
      projectName: 'VoxelEngine',
      language: 'cpp',
      buildSystemId: 'cmake',
    });
    expect(cppMatrix.profiles.find((p) => p.configuration === 'Sanitizer')?.buildCommand).toContain(
      '/fsanitize=address'
    );
    expect(cppMatrix.cmakePresetsJson.version).toBe(6);

    const rustMatrix = buildLaunchProfileMatrix({
      projectName: 'IronVault',
      language: 'rust',
      buildSystemId: 'cargo',
    });
    expect(rustMatrix.profiles.some((p) => p.buildCommand.includes('aarch64-pc-windows-msvc'))).toBe(true);
  });

  it('consent-gates saving .vscode/launch.json and CMakePresets.json into a workspace', async () => {
    const matrix = buildLaunchProfileMatrix({
      projectName: 'VoxelEngine',
      language: 'cpp',
      buildSystemId: 'cmake',
    });

    const blocked = await fetch(`${baseUrl}/api/build/save-launch-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: wsSlug,
        vscodeLaunchJson: matrix.vscodeLaunchJson,
        consentConfirmed: false,
      }),
    });
    expect(blocked.status).toBe(403);

    const saved = await fetch(`${baseUrl}/api/build/save-launch-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: wsSlug,
        vscodeLaunchJson: matrix.vscodeLaunchJson,
        includeCmakePresets: true,
        cmakePresetsJson: matrix.cmakePresetsJson,
        consentConfirmed: true,
      }),
    });
    expect(saved.status).toBe(200);
    expect(fs.existsSync(path.join(wsDir, '.vscode', 'launch.json'))).toBe(true);
    expect(fs.existsSync(path.join(wsDir, 'CMakePresets.json'))).toBe(true);
  });

  it('supports commit patch preview and consented workspace stash -> stash-pop -> tag Git flows', async () => {
    // 1. Preview HEAD commit patch on root repo
    const overview = await (await fetch(`${baseUrl}/api/git/overview`)).json();
    const headSha = overview.commits[0]?.hash;
    expect(headSha).toBeTruthy();

    const patchRes = await fetch(`${baseUrl}/api/git/commit-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitHash: headSha }),
    });
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.patch).toContain('commit');

    // 2. Init + initial commit in isolated workspace
    const commit1 = await fetch(`${baseUrl}/api/git/workspace-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: wsSlug,
        action: 'commit',
        message: 'chore: initial fixture commit',
        consentConfirmed: true,
      }),
    });
    expect(commit1.status).toBe(200);

    // 3. Create dirty change -> stash -> verify clean -> stash-pop -> verify restored -> create-tag
    const notesPath = path.join(wsDir, 'NOTES.txt');
    fs.writeFileSync(notesPath, 'wip stash payload\n', 'utf8');

    const stashed = await fetch(`${baseUrl}/api/git/workspace-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: wsSlug,
        action: 'stash',
        message: 'WIP notes',
        consentConfirmed: true,
      }),
    });
    expect(stashed.status).toBe(200);
    expect(fs.existsSync(notesPath)).toBe(false);

    const popped = await fetch(`${baseUrl}/api/git/workspace-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: wsSlug,
        action: 'stash-pop',
        consentConfirmed: true,
      }),
    });
    expect(popped.status).toBe(200);
    expect(fs.readFileSync(notesPath, 'utf8')).toBe('wip stash payload\n');

    const tagged = await fetch(`${baseUrl}/api/git/workspace-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug: wsSlug,
        action: 'create-tag',
        tagName: 'v0.1.0',
        message: 'Initial fixture release',
        consentConfirmed: true,
      }),
    });
    expect(tagged.status).toBe(200);
    const tagBody = await tagged.json();
    expect(tagBody.output).toContain('v0.1.0');
  });

  it('always returns all 4 developer Registry checks in probeWindowsHostDiagnostics', async () => {
    const diag = await probeWindowsHostDiagnostics();
    expect(diag.registry).toHaveLength(4);
    expect(diag.registry.map((r) => r.valueName)).toEqual([
      'LongPathsEnabled',
      'AllowDevelopmentWithoutDevLicense',
      'pv',
      'DumpType',
    ]);
  });
});
