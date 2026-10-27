import fs from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpServer } from '../server/index';
import {
  captureLiveInspectorSnapshot,
  parseWindowsMinidumpBuffer,
  synthesizeSampleWindowsMinidump,
} from '../server/services/debugMinidumpService';
import { buildLockfileDependencyGraph } from '../server/services/lockfileGraphService';
import { runPluginInWorkerSandbox } from '../server/services/pluginWorkerSandbox';
import App from '../src/App';

describe('DevBench v1.3 Upgrades (DAP/Minidump, Lockfile Graph, Worker Sandbox, Multi-File Replace & Splitters)', () => {
  let server: Server;
  let baseUrl = '';
  const tmpFixtureDir = path.resolve(process.cwd(), 'workspaces', 'v13-test-fixture');

  beforeAll(async () => {
    fs.rmSync(tmpFixtureDir, { recursive: true, force: true });
    fs.mkdirSync(tmpFixtureDir, { recursive: true });
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
    fs.rmSync(tmpFixtureDir, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('Feature 1a: attaches node:inspector Runtime.evaluate, returns V8 heap spaces & redacts secrets', async () => {
    const fakeToken = `ghp_${'A'.repeat(36)}`;
    const snap = await captureLiveInspectorSnapshot([
      '6 * 7',
      `'token=${fakeToken}'`,
      'typeof process.versions.v8',
    ]);
    expect(snap.protocol).toContain('V8 Inspector');
    expect(snap.watches[0].value).toBe('42');
    expect(snap.watches[1].value).not.toContain(fakeToken);
    expect(snap.watches[1].value).toContain('REDACTED');
    expect(snap.watches[2].value).toBe('string');
    expect(snap.heapSpaces.length).toBeGreaterThan(2);
    expect(snap.callStack.length).toBeGreaterThan(0);
  });

  it('Feature 1b: synthesizes & parses binary Windows Minidump (MDMP) streams and rejects non-MDMP files', () => {
    const dmpBuf = synthesizeSampleWindowsMinidump({
      arch: 'ARM64',
      exceptionCode: 0xc0000409,
    });
    const parsed = parseWindowsMinidumpBuffer(dmpBuf, 'arm64-crash.dmp');
    expect(parsed.valid).toBe(true);
    expect(parsed.signature).toBe('MDMP');
    expect(parsed.systemInfo?.architecture).toBe('ARM64');
    expect(parsed.exception?.exceptionCodeHex).toBe('0xC0000409');
    expect(parsed.exception?.exceptionName).toBe('STATUS_STACK_BUFFER_OVERRUN');
    expect(parsed.modules.map((m) => m.name)).toContain('C:\\Windows\\System32\\ntdll.dll');

    const invalid = parseWindowsMinidumpBuffer(Buffer.from('NOT_A_DUMP_HEADER_12345678901234567890'));
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('Invalid signature');
  });

  it('Feature 2: parses multi-ecosystem lockfiles (npm + Cargo.lock + packages.lock.json) & enforces copyleft gate', () => {
    // 1. Repository root package-lock.json
    const rootGraph = buildLockfileDependencyGraph({
      targetDir: '.',
      disallowStrongCopyleft: true,
    });
    expect(rootGraph.detectedFiles).toContain('package-lock.json');
    expect(rootGraph.directCount).toBeGreaterThanOrEqual(4);
    expect(rootGraph.transitiveCount).toBeGreaterThan(5);
    expect(rootGraph.edges.length).toBeGreaterThan(0);

    // 2. Polyglot fixture with Cargo.lock + GPL package in package-lock.json
    fs.writeFileSync(
      path.join(tmpFixtureDir, 'Cargo.toml'),
      '[package]\nname = "native-gui"\nversion = "0.1.0"\n\n[dependencies]\neframe = "0.29.1"\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpFixtureDir, 'Cargo.lock'),
      '[[package]]\nname = "eframe"\nversion = "0.29.1"\ndependencies = [\n "egui 0.29.1",\n]\n\n[[package]]\nname = "egui"\nversion = "0.29.1"\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpFixtureDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/gpl-addon': { version: '1.2.3', license: 'GPL-3.0-only' },
        },
      }),
      'utf8'
    );

    const fixtureGraph = buildLockfileDependencyGraph({
      targetDir: 'workspaces/v13-test-fixture',
      disallowStrongCopyleft: true,
    });
    expect(fixtureGraph.detectedFiles).toEqual(
      expect.arrayContaining(['Cargo.toml', 'Cargo.lock', 'package-lock.json'])
    );
    expect(fixtureGraph.edges).toContainEqual({ from: 'cargo:eframe', to: 'cargo:egui' });
    expect(fixtureGraph.policyGate.passed).toBe(false);
    expect(fixtureGraph.policyGate.violations[0].pkg).toBe('gpl-addon@1.2.3');
  });

  it('Feature 3: enforces plugin permissions & timeout inside isolated worker_threads', async () => {
    // Allowed filesystem:read for MSIX packager
    const okRun = await runPluginInWorkerSandbox({
      pluginId: 'plugin.msix-packager',
      action: 'inspect-workspace',
    });
    expect(okRun.ok).toBe(true);
    expect(okRun.isolatedThreadId).toBeGreaterThan(0);
    expect(okRun.auditLog.some((a) => a.capability === 'filesystem:read' && a.decision === 'ALLOWED')).toBe(
      true
    );
    expect(okRun.structuredOutput?.hasIdentity).toBe(true);

    // Denied filesystem:write when plugin lacks permission
    const deniedRun = await runPluginInWorkerSandbox({
      pluginId: 'plugin.msix-packager',
      action: 'test-unauthorized-write',
    });
    expect(deniedRun.ok).toBe(false);
    expect(
      deniedRun.auditLog.some((a) => a.capability === 'filesystem:write' && a.decision === 'DENIED')
    ).toBe(true);

    // Runaway infinite loop terminated cleanly
    const loopRun = await runPluginInWorkerSandbox({
      pluginId: 'plugin.msix-packager',
      action: 'infinite-loop-probe',
      timeoutMs: 1200,
    });
    expect(loopRun.ok).toBe(false);
  });

  it('Feature 4a: multi-file search-and-replace previews diff hunks, enforces consent, and restores undo snapshot', async () => {
    const f1 = path.join(tmpFixtureDir, 'ModuleA.cs');
    const f2 = path.join(tmpFixtureDir, 'ModuleB.cs');
    const origA = 'namespace Contoso.LegacyApp;\r\npublic class ModuleA {}\r\n';
    const origB = 'namespace Contoso.LegacyApp;\npublic class ModuleB {}\n';
    fs.writeFileSync(f1, origA, 'utf8');
    fs.writeFileSync(f2, origB, 'utf8');

    const prevRes = await fetch(`${baseUrl}/api/files/replace/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: 'Contoso.LegacyApp',
        replace: 'Contoso.ModernWinUI',
        includePrefix: 'workspaces/v13-test-fixture',
      }),
    });
    expect(prevRes.status).toBe(200);
    const preview = await prevRes.json();
    expect(preview.totalFilesMatched).toBe(2);
    expect(preview.totalReplacements).toBe(2);

    // Rejects without consent
    const unconsented = await fetch(`${baseUrl}/api/files/replace/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: 'Contoso.LegacyApp',
        replace: 'Contoso.ModernWinUI',
        includePrefix: 'workspaces/v13-test-fixture',
        consentConfirmed: false,
      }),
    });
    expect(unconsented.status).toBe(403);

    // Applies with consent & preserves CRLF vs LF per file
    const execRes = await fetch(`${baseUrl}/api/files/replace/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: 'Contoso.LegacyApp',
        replace: 'Contoso.ModernWinUI',
        includePrefix: 'workspaces/v13-test-fixture',
        consentConfirmed: true,
      }),
    });
    expect(execRes.status).toBe(200);
    const execData = await execRes.json();
    expect(fs.readFileSync(f1, 'utf8')).toBe(
      'namespace Contoso.ModernWinUI;\r\npublic class ModuleA {}\r\n'
    );

    // Restores exact bytes via undo snapshot
    const undoRes = await fetch(`${baseUrl}/api/files/replace/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ undoId: execData.undoId, consentConfirmed: true }),
    });
    expect(undoRes.status).toBe(200);
    expect(fs.readFileSync(f1, 'utf8')).toBe(origA);
    expect(fs.readFileSync(f2, 'utf8')).toBe(origB);
  });

  it('Feature 4b: renders WCAG-accessible resizable splitters for Sidebar and BottomDock', () => {
    const g = globalThis as unknown as { localStorage?: Storage };
    const prev = g.localStorage;
    const store = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };
    try {
      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain('role="separator"');
      expect(html).toContain('aria-label="Resize Module Sidebar"');
      expect(html).toContain('aria-label="Resize Bottom Output Dock"');
    } finally {
      g.localStorage = prev;
    }
  });
});
