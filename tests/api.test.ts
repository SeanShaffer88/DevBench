import fs from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServerApp } from '../server/index';

describe('DevBench Modular Host API & Safety Gates', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = createServerApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves health metadata with DevBench branding', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.app).toContain('DevBench');
  });

  it('prevents path traversal outside workspace root', async () => {
    const res = await fetch(`${baseUrl}/api/files/read?path=${encodeURIComponent('../../etc/passwd')}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('escapes workspace root');
  });

  it('validates Windows PerMonitorV2 application manifest', async () => {
    const xml = fs.readFileSync('windows/DevBench.app.manifest', 'utf8');
    const res = await fetch(`${baseUrl}/api/windows/validate-manifest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    expect(res.status).toBe(200);
    const { checks } = await res.json();
    expect(checks.every((c: { status: string }) => c.status === 'pass')).toBe(true);
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
