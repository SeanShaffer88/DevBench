import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../server/index';

process.env.NODE_ENV = 'production';

async function main() {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'Expected bound TCP address');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`[E2E Smoke] Bound DevBench HTTP+WS server at ${baseUrl}`);

  const smokeDir = path.resolve(process.cwd(), 'workspaces', 'ci-smoke-proj');

  try {
    // 1. Static production SPA bundle check (if dist/ exists)
    if (fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'))) {
      const htmlRes = await fetch(`${baseUrl}/`);
      assert.equal(htmlRes.status, 200);
      const html = await htmlRes.text();
      assert(html.includes('<div id="root"></div>'), 'Served index.html must contain root mount');
      console.log('[E2E Smoke] PASS 1/7: Production static bundle served at /');
    } else {
      console.log('[E2E Smoke] SKIP 1/7: dist/ not built yet');
    }

    // 2. Health endpoint v1.4.0
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.version, '1.4.0');
    console.log('[E2E Smoke] PASS 2/8: /api/health v1.4.0 verified');

    // 3. Live V8 Inspector session evaluation
    const snapRes = await fetch(`${baseUrl}/api/debug/inspector-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expressions: ['21 * 2', 'process.version'] }),
    });
    assert.equal(snapRes.status, 200);
    const snap = await snapRes.json();
    assert.equal(snap.watches[0].value, '42');
    assert(snap.heapTotalMB > 0);
    console.log('[E2E Smoke] PASS 3/7: Live node:inspector DAP watch & heap snapshot verified');

    // 4. Binary Windows Minidump (MDMP) synthesis & stream parser
    const dmpRes = await fetch(`${baseUrl}/api/debug/minidump/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arch: 'ARM64', exceptionCode: 0xc0000005 }),
    });
    assert.equal(dmpRes.status, 200);
    const dmp = await dmpRes.json();
    assert.equal(dmp.parsed.valid, true);
    assert.equal(dmp.parsed.signature, 'MDMP');
    assert.equal(dmp.parsed.systemInfo.architecture, 'ARM64');
    assert.equal(dmp.parsed.exception.exceptionName, 'STATUS_ACCESS_VIOLATION');
    assert(dmp.parsed.modules.length >= 4);
    console.log('[E2E Smoke] PASS 4/7: Binary Windows Minidump (MDMP) parser verified');

    // 5. Multi-ecosystem Lockfile Dependency Graph & License Gate
    const graphRes = await fetch(`${baseUrl}/api/packages/lockfile-graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: '.', disallowStrongCopyleft: true }),
    });
    assert.equal(graphRes.status, 200);
    const graph = await graphRes.json();
    assert(graph.totalPackages > 5, 'Expected parsed packages from package-lock.json');
    assert(graph.directCount >= 3);
    console.log(
      `[E2E Smoke] PASS 5/7: Lockfile graph parsed (${graph.totalPackages} nodes, ${graph.edges.length} edges)`
    );

    // 6. Permission-enforced worker_threads Plugin Sandbox
    const allowRun = await (
      await fetch(`${baseUrl}/api/plugins/sandbox-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: 'plugin.msix-packager', action: 'inspect-workspace' }),
      })
    ).json();
    assert.equal(allowRun.ok, true);
    assert.equal(allowRun.auditLog[0].decision, 'ALLOWED');

    const denyRun = await (
      await fetch(`${baseUrl}/api/plugins/sandbox-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId: 'plugin.msix-packager',
          action: 'test-unauthorized-write',
        }),
      })
    ).json();
    assert.equal(denyRun.ok, false);
    assert.equal(denyRun.auditLog[0].decision, 'DENIED');
    console.log('[E2E Smoke] PASS 6/7: worker_threads Plugin Sandbox allow + capability block verified');

    // 7. Multi-file Search & Replace preview -> consent block -> apply -> undo restore
    fs.mkdirSync(smokeDir, { recursive: true });
    const sampleFile = path.join(smokeDir, 'AppConfig.json');
    const originalText = '{\n  "channel": "AlphaChannel",\n  "dpi": "PerMonitorV2"\n}\n';
    fs.writeFileSync(sampleFile, originalText, 'utf8');

    const prev = await (
      await fetch(`${baseUrl}/api/files/replace/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: 'AlphaChannel',
          replace: 'StableChannel',
          includePrefix: 'workspaces/ci-smoke-proj',
        }),
      })
    ).json();
    assert.equal(prev.totalReplacements, 1);

    const blockedExec = await fetch(`${baseUrl}/api/files/replace/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: 'AlphaChannel',
        replace: 'StableChannel',
        includePrefix: 'workspaces/ci-smoke-proj',
        consentConfirmed: false,
      }),
    });
    assert.equal(blockedExec.status, 403);

    const exec = await (
      await fetch(`${baseUrl}/api/files/replace/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: 'AlphaChannel',
          replace: 'StableChannel',
          includePrefix: 'workspaces/ci-smoke-proj',
          consentConfirmed: true,
        }),
      })
    ).json();
    assert(fs.readFileSync(sampleFile, 'utf8').includes('StableChannel'));

    const undone = await (
      await fetch(`${baseUrl}/api/files/replace/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ undoId: exec.undoId, consentConfirmed: true }),
      })
    ).json();
    assert.equal(undone.restoredFiles.length, 1);
    assert.equal(fs.readFileSync(sampleFile, 'utf8'), originalText);
    console.log('[E2E Smoke] PASS 7/8: Multi-file replace preview + consent + undo verified');

    // 8. v1.4 SARIF 2.1.0, LCOV coverage parser, OpenAPI 3.1 & Compose YAML validators
    const sarif = await (await fetch(`${baseUrl}/api/security/sarif`)).json();
    assert.equal(sarif.version, '2.1.0');
    assert(Array.isArray(sarif.runs) && sarif.runs.length === 1);

    const cov = await (
      await fetch(`${baseUrl}/api/test/parse-coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'SF:src/App.tsx\nLF:50\nLH:45\nBRF:10\nBRH:9\nend_of_record\n',
        }),
      })
    ).json();
    assert.equal(cov.overallLinePct, 90);

    const oapi = await (
      await fetch(`${baseUrl}/api/specs/validate-openapi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'Smoke API', version: '1.4.0' },
            paths: { '/ping': { get: { summary: 'Ping', responses: { '200': {} } } } },
          }),
        }),
      })
    ).json();
    assert.equal(oapi.valid, true);
    assert.equal(oapi.endpointCount, 1);

    const comp = await (
      await fetch(`${baseUrl}/api/specs/validate-compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yaml: 'services:\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "127.0.0.1:6379:6379"\n',
        }),
      })
    ).json();
    assert.equal(comp.valid, true);
    assert.equal(comp.serviceCount, 1);
    console.log('[E2E Smoke] PASS 8/8: SARIF 2.1.0, LCOV parser, OpenAPI 3.1 & Compose validators verified');
  } finally {
    fs.rmSync(smokeDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('[E2E Smoke] FAILED:', err);
  process.exit(1);
});
