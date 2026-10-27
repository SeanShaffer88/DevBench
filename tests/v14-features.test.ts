import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpServer } from '../server/index';
import { generateSarifReport } from '../server/services/securityScanner';
import { validateComposeSpec, validateOpenApiSpec } from '../server/services/specComposeValidator';
import { parseCoverageReport } from '../server/services/testCoverageService';

describe('DevBench v1.4 Upgrades (Live Vitest JSON, LCOV/Cobertura Coverage, SARIF 2.1.0, OpenAPI & Compose Validators)', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('enforces explicit consent and executes live Vitest JSON suite via /api/test/run-vitest', async () => {
    const blocked = await fetch(`${baseUrl}/api/test/run-vitest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'tests/redaction.test.ts', consentConfirmed: false }),
    });
    expect(blocked.status).toBe(403);

    const allowed = await fetch(`${baseUrl}/api/test/run-vitest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'tests/redaction.test.ts', consentConfirmed: true }),
    });
    expect(allowed.status).toBe(200);
    const data = await allowed.json();
    expect(data.ok).toBe(true);
    expect(data.totalSuites).toBe(1);
    expect(data.passedTests).toBeGreaterThanOrEqual(2);
    expect(data.suites[0].file).toBe('tests/redaction.test.ts');
  });

  it('parses both LCOV (lcov.info) and Cobertura XML coverage reports accurately', () => {
    const lcov = parseCoverageReport({
      content: [
        'TN:Unit',
        'SF:shared/redaction.ts',
        'LF:80',
        'LH:76',
        'BRF:20',
        'BRH:18',
        'end_of_record',
      ].join('\n'),
    });
    expect(lcov.format).toBe('lcov');
    expect(lcov.overallLinePct).toBe(95);
    expect(lcov.overallBranchPct).toBe(90);

    const cobertura = parseCoverageReport({
      content: `<?xml version="1.0"?>
<coverage line-rate="0.75" branch-rate="0.50">
  <packages>
    <package name="Core">
      <classes>
        <class name="WinBridge" filename="src/WinBridge.cs">
          <lines>
            <line number="1" hits="4" condition-coverage="100% (2/2)" />
            <line number="2" hits="3" condition-coverage="50% (1/2)" />
            <line number="3" hits="1" />
            <line number="4" hits="0" />
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`,
    });
    expect(cobertura.format).toBe('cobertura-xml');
    expect(cobertura.overallLinePct).toBe(75);
    expect(cobertura.overallBranchPct).toBe(75);
  });

  it('generates spec-compliant OASIS SARIF 2.1.0 report with git-history & manifest coverage', async () => {
    const sarif = generateSarifReport(true);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-2.1.0.json');
    expect(sarif.runs[0].tool.driver.version).toBe('1.5.0');
    expect(sarif.runs[0].invocations[0].properties.scannedFiles).toBeGreaterThan(20);

    const httpRes = await fetch(`${baseUrl}/api/security/sarif?includeHistory=0`);
    expect(httpRes.status).toBe(200);
    const body = await httpRes.json();
    expect(body.version).toBe('2.1.0');
  });

  it('validates OpenAPI 3.0/3.1 contracts and Docker/Podman Compose security & tag hygiene', () => {
    const goodOpenApi = validateOpenApiSpec(
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Desktop IPC Service', version: '1.4.0' },
        paths: {
          '/v1/status': {
            get: {
              operationId: 'getStatus',
              summary: 'Return host status',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      })
    );
    expect(goodOpenApi.valid).toBe(true);
    expect(goodOpenApi.endpointCount).toBe(1);

    const badOpenApi = validateOpenApiSpec(JSON.stringify({ openapi: '2.0', paths: {} }));
    expect(badOpenApi.valid).toBe(false);

    const compose = validateComposeSpec(
      [
        'services:',
        '  db:',
        '    image: postgres:latest',
        '    ports:',
        '      - "5432:5432"',
        '    environment:',
        '      POSTGRES_PASSWORD: hardcoded_password_value',
      ].join('\n')
    );
    expect(compose.valid).toBe(true);
    expect(compose.serviceCount).toBe(1);
    expect(compose.diagnostics.some((d) => d.message.includes('unpinned image tag'))).toBe(true);
    expect(compose.diagnostics.some((d) => d.message.includes('POSTGRES_PASSWORD'))).toBe(true);
  });
});
