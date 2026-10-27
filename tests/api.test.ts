import fs from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpServer } from '../server/index';

describe('DevBench Modular Host API & Safety Gates (v1.1)', () => {
  let server: Server;
  let baseUrl = '';
  let wsUrl = '';

  beforeAll(async () => {
    server = createHttpServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        wsUrl = `ws://127.0.0.1:${addr.port}/api/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves health metadata with DevBench v1.1 branding', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.app).toContain('DevBench');
    expect(body.version).toBe('1.1.0');
  });

  it('prevents path traversal outside workspace root', async () => {
    const res = await fetch(`${baseUrl}/api/files/read?path=${encodeURIComponent('../../etc/passwd')}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('escapes workspace root');
  });

  it('validates both Win32 app.manifest and MSIX Package.appxmanifest', async () => {
    const win32Xml = fs.readFileSync('windows/DevBench.app.manifest', 'utf8');
    const res1 = await fetch(`${baseUrl}/api/windows/validate-manifest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: win32Xml }),
    });
    expect(res1.status).toBe(200);
    const { checks: win32Checks } = await res1.json();
    expect(win32Checks.every((c: { status: string }) => c.status === 'pass')).toBe(true);

    const appxXml = fs.readFileSync('windows/Package.appxmanifest', 'utf8');
    const res2 = await fetch(`${baseUrl}/api/windows/validate-appx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: appxXml }),
    });
    expect(res2.status).toBe(200);
    const { checks: appxChecks } = await res2.json();
    expect(appxChecks.every((c: { status: string }) => c.status === 'pass')).toBe(true);
  });

  it('generates valid multi-size binary .ico and Win32 VERSIONINFO .rc scripts', async () => {
    const res = await fetch(`${baseUrl}/api/windows/generate-ico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accentHex: '#0284c7',
        productName: 'DevBench',
        companyName: 'DevBench Contributors',
        version: '1.1.0.0',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const buf = Buffer.from(body.icoBase64, 'base64');
    // ICONDIR header: reserved=0, type=1 (ICO), count=4 (16, 32, 48, 256)
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(buf.readUInt16LE(4)).toBe(4);
    expect(body.rcText).toContain('VS_VERSION_INFO VERSIONINFO');
  });

  it('serves Windows host diagnostics, custom adapter schema, and directory comparison', async () => {
    const diagRes = await fetch(`${baseUrl}/api/windows/host-diagnostics`);
    expect(diagRes.status).toBe(200);
    const diag = await diagRes.json();
    expect(Array.isArray(diag.registry)).toBe(true);
    expect(diag.registry.length).toBeGreaterThanOrEqual(4);

    const adapterRes = await fetch(`${baseUrl}/api/adapters/custom`);
    expect(adapterRes.status).toBe(200);
    const adapterBody = await adapterRes.json();
    expect(adapterBody.exists).toBe(true);
    expect(adapterBody.adapter.schemaVersion).toBe('1.1');

    const cmpRes = await fetch(`${baseUrl}/api/files/compare-dirs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leftDir: 'windows', rightDir: 'electron' }),
    });
    expect(cmpRes.status).toBe(200);
    const cmpBody = await cmpRes.json();
    expect(cmpBody.entries.length).toBeGreaterThan(0);
  });

  it('scans working tree and Git commit history for leaked secrets with auto-redaction', async () => {
    const res = await fetch(`${baseUrl}/api/security/secrets?includeHistory=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scannedFiles).toBeGreaterThan(20);
    expect(body.scannedCommits).toBeGreaterThanOrEqual(1);
    expect(body.findings.some((f: { source?: string }) => f.source === 'working-tree')).toBe(true);
    expect(body.findings.some((f: { source?: string }) => f.source === 'git-history')).toBe(true);
    expect(
      body.findings.every((f: { redactedSnippet: string }) => f.redactedSnippet.includes('[REDACTED:'))
    ).toBe(true);
  });

  it('executes live SQLite SELECT queries and blocks unconsented SQL mutations', async () => {
    const schemaRes = await fetch(`${baseUrl}/api/sqlite/schema`);
    expect(schemaRes.status).toBe(200);
    const schema = await schemaRes.json();
    expect(schema.tables.some((t: { name: string }) => t.name === 'desktop_releases')).toBe(true);

    const readRes = await fetch(`${baseUrl}/api/sqlite/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT * FROM desktop_releases;' }),
    });
    expect(readRes.status).toBe(200);
    const readData = await readRes.json();
    expect(readData.rowCount).toBeGreaterThanOrEqual(5);

    const blockedWrite = await fetch(`${baseUrl}/api/sqlite/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'DELETE FROM desktop_releases;', allowMutation: false }),
    });
    expect(blockedWrite.status).toBe(400);
  });

  it('rejects command execution when explicit user consent is missing', async () => {
    const res = await fetch(`${baseUrl}/api/jobs/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'Unapproved Run',
        command: 'node -v',
        consentConfirmed: false,
      }),
    });
    expect(res.status).toBe(403);
  });

  it('blocks external HTTP calls in Offline Mode while allowing loopback', async () => {
    const blocked = await fetch(`${baseUrl}/api/network/http-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        url: 'https://api.github.com',
        offlineMode: true,
      }),
    });
    expect(blocked.status).toBe(403);

    const allowedLoopback = await fetch(`${baseUrl}/api/network/http-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        url: `${baseUrl}/api/health`,
        offlineMode: true,
      }),
    });
    expect(allowedLoopback.status).toBe(200);
  });

  it('supports RFC 6455 WebSocket upgrade and bidirectional JSON frame echo on /api/ws', async () => {
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => reject(new Error('WebSocket test timed out')), 4000);
      ws.addEventListener('message', (ev) => {
        received.push(String(ev.data));
        if (received.length === 1) {
          ws.send(JSON.stringify({ ping: 'devbench-ws-check' }));
        } else if (received.length >= 2) {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('WebSocket error'));
      });
    });

    expect(JSON.parse(received[0]).type).toBe('welcome');
    const echo = JSON.parse(received[1]);
    expect(echo.type).toBe('echo');
    expect(JSON.parse(echo.received).ping).toBe('devbench-ws-check');
  });

  it('generates CycloneDX 1.5 SBOM and redacted diagnostic bundle', async () => {
    const sbomRes = await fetch(`${baseUrl}/api/security/sbom`);
    expect(sbomRes.status).toBe(200);
    const sbom = await sbomRes.json();
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.specVersion).toBe('1.5');
    expect(sbom.metadata.component.name).toBe('devbench');

    const bundleRes = await fetch(`${baseUrl}/api/security/diagnostic-bundle`, { method: 'POST' });
    expect(bundleRes.status).toBe(200);
    const { bundle } = await bundleRes.json();
    expect(bundle).toContain('DevBench Redacted Diagnostic Bundle');
  });
});
