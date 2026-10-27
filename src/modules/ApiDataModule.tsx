import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Database,
  Download,
  Globe,
  Network,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

const SAMPLE_OPENAPI = JSON.stringify(
  {
    openapi: '3.1.0',
    info: { title: 'DevBench Local Host API', version: '1.0.0' },
    paths: {
      '/api/health': { get: { summary: 'Host health & runtime metadata' } },
      '/api/toolchains': { get: { summary: 'Probe installed compilers & SDKs' } },
      '/api/sqlite/schema': { get: { summary: 'Inspect local SQLite tables & migrations' } },
      '/api/security/sbom': { get: { summary: 'Generate CycloneDX 1.5 SBOM' } },
    },
  },
  null,
  2
);

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXZiZW5jaC1kZXYiLCJyb2xlIjoiZGVza3RvcC1lbmdpbmVlciIsImV4cCI6MTg5MzQ1NjAwMH0.signature_placeholder';

export const ApiDataModule: React.FC = () => {
  const { settings, toolchains, runCommandWithConsent, requestConsent, notify } = useWorkbench();

  const [tab, setTab] = useState<'http' | 'sqlite' | 'network' | 'containers'>('http');

  // HTTP / GraphQL / OpenAPI state
  const [envPreset, setEnvPreset] = useState<'dev' | 'test' | 'staging'>('dev');
  const [httpMethod, setHttpMethod] = useState('GET');
  const [httpUrl, setHttpUrl] = useState('http://127.0.0.1:4780/api/health');
  const [httpBody, setHttpBody] = useState('');
  const [httpResp, setHttpResp] = useState<{
    status?: number;
    elapsedMs?: number;
    body?: string;
    error?: string;
  } | null>(null);
  const [openApiSpec, setOpenApiSpec] = useState(SAMPLE_OPENAPI);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsInput, setWsInput] = useState('{"action":"ping","target":"winui-desktop"}');
  const [wsFrames, setWsFrames] = useState<{ dir: 'IN' | 'OUT'; text: string; ts: string }[]>([]);

  const toggleWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    wsRef.current = socket;
    socket.onopen = () => setWsConnected(true);
    socket.onmessage = (ev) => {
      setWsFrames((prev) => [
        { dir: 'IN', text: String(ev.data), ts: new Date().toLocaleTimeString() },
        ...prev.slice(0, 19),
      ]);
    };
    socket.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
    };
  };

  const sendWsFrame = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(wsInput);
    setWsFrames((prev) => [
      { dir: 'OUT', text: wsInput, ts: new Date().toLocaleTimeString() },
      ...prev.slice(0, 19),
    ]);
  };

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // SQLite state
  const [schemaInfo, setSchemaInfo] = useState<{
    databaseFile: string;
    engine: string;
    tables: { name: string; rowCount: number; columns: { name: string; type: string; pk: number }[] }[];
    migrations: { version: string; name: string; applied_at: string; checksum: string }[];
  } | null>(null);
  const [sqlText, setSqlText] = useState(
    'SELECT id, app_name, version, architecture, package_format, channel FROM desktop_releases ORDER BY id;'
  );
  const [allowSqlWrite, setAllowSqlWrite] = useState(false);
  const [sqlResult, setSqlResult] = useState<{
    elapsedMs: number;
    rowCount: number;
    columns: string[];
    rows: Record<string, unknown>[];
  } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  // Visual Row Inserter & Transactional Migration Runner state
  const [relAppName, setRelAppName] = useState('Aurora Telemetry Studio');
  const [relVersion, setRelVersion] = useState('1.2.0');
  const [relArch, setRelArch] = useState('x64');
  const [relFormat, setRelFormat] = useState('MSIX');
  const [relChannel, setRelChannel] = useState('Stable');
  const [migVersion, setMigVersion] = useState('20261027_04');
  const [migName, setMigName] = useState('create_crash_reports_table');
  const [migSql, setMigSql] = useState(
    'CREATE TABLE IF NOT EXISTS crash_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, app_name TEXT NOT NULL, exception_code TEXT NOT NULL, created_at TEXT NOT NULL);'
  );

  // Network & JWT state
  const [jwtToken, setJwtToken] = useState(SAMPLE_JWT);
  const [portInput, setPortInput] = useState('4780');
  const [portStatus, setPortStatus] = useState<{ port: number; inUse: boolean; latencyMs: number } | null>(null);
  const [dnsHost, setDnsHost] = useState('localhost');
  const [dnsResult, setDnsResult] = useState<string>('');
  const [tlsHost, setTlsHost] = useState('github.com');
  const [tlsResult, setTlsResult] = useState<string>('');

  // Compose helper
  const [composeYaml, setComposeYaml] = useState(
    `services:\n  postgres-dev:\n    image: postgres:16-alpine\n    ports:\n      - "5432:5432"\n    environment:\n      POSTGRES_DB: devbench_local\n  redis-cache:\n    image: redis:7-alpine\n    ports:\n      - "6379:6379"\n`
  );

  const loadSchema = () => {
    fetch('/api/sqlite/schema')
      .then((r) => r.json())
      .then((d) => setSchemaInfo(d))
      .catch(() => {});
  };

  useEffect(() => {
    loadSchema();
  }, []);

  const sendHttp = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch('/api/network/http-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: httpMethod,
        url: httpUrl,
        body: httpBody,
        offlineMode: settings.offlineMode,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setHttpResp({ error: d.error });
    } else {
      setHttpResp(d);
    }
  };

  const executeSql = async () => {
    setSqlError(null);
    const r = await fetch('/api/sqlite/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: sqlText, allowMutation: allowSqlWrite }),
    });
    const d = await r.json();
    if (!r.ok) {
      setSqlError(d.error);
      return;
    }
    setSqlResult(d);
    if (d.mode === 'write') loadSchema();
  };

  const formatSql = () => {
    const keywords = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'LIMIT'];
    let formatted = sqlText;
    for (const kw of keywords) {
      const rx = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(rx, kw);
    }
    setSqlText(formatted);
    notify('Formatted SQL keywords.');
  };

  const exportQueryResults = (format: 'json' | 'csv') => {
    if (!sqlResult) return;
    let content = '';
    if (format === 'json') {
      content = JSON.stringify(sqlResult.rows, null, 2);
    } else {
      const header = sqlResult.columns.join(',');
      const lines = sqlResult.rows.map((r) =>
        sqlResult.columns.map((c) => JSON.stringify(r[c] ?? '')).join(',')
      );
      content = [header, ...lines].join('\n');
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parsedEndpoints = useMemo(() => {
    try {
      const spec = JSON.parse(openApiSpec);
      const list: { method: string; path: string; summary: string }[] = [];
      for (const [p, methods] of Object.entries(spec.paths || {})) {
        for (const [m, info] of Object.entries(methods as Record<string, { summary?: string }>)) {
          list.push({ method: m.toUpperCase(), path: p, summary: info.summary || '' });
        }
      }
      return list;
    } catch {
      return [];
    }
  }, [openApiSpec]);

  const decodedJwt = useMemo(() => {
    try {
      const parts = jwtToken.trim().split('.');
      if (parts.length < 2) return null;
      const decodeB64 = (s: string) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')));
      return {
        header: decodeB64(parts[0]),
        payload: decodeB64(parts[1]),
      };
    } catch {
      return null;
    }
  }, [jwtToken]);

  const checkPort = async () => {
    const r = await fetch('/api/network/port-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: Number(portInput) }),
    });
    setPortStatus(await r.json());
  };

  const runDns = async () => {
    const r = await fetch('/api/network/dns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname: dnsHost }),
    });
    setDnsResult(JSON.stringify(await r.json(), null, 2));
  };

  const runTls = async () => {
    const r = await fetch('/api/network/tls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: tlsHost, port: 443 }),
    });
    setTlsResult(JSON.stringify(await r.json(), null, 2));
  };

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="REST/GraphQL/OpenAPI client, live SQLite database & migrations, JWT/TLS/DNS/ports & Containers" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'http' ? 'active' : ''}`}
          onClick={() => setTab('http')}
        >
          <Globe size={14} /> HTTP / GraphQL & OpenAPI Browser
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'sqlite' ? 'active' : ''}`}
          onClick={() => setTab('sqlite')}
        >
          <Database size={14} /> Live SQLite & SQL Workbench
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'network' ? 'active' : ''}`}
          onClick={() => setTab('network')}
        >
          <Network size={14} /> JWT, TLS Certs, DNS & Port Checks
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'containers' ? 'active' : ''}`}
          onClick={() => setTab('containers')}
        >
          <Cloud size={14} /> Containers, Compose & Cloud CLIs
        </button>
      </div>

      {tab === 'http' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>REST / GraphQL Request Runner</h3>
              <select
                className="select"
                style={{ width: 175 }}
                value={envPreset}
                onChange={(e) => setEnvPreset(e.target.value as typeof envPreset)}
              >
                <option value="dev">Env: Development (Local)</option>
                <option value="test">Env: QA / Testing</option>
                <option value="staging">Env: Staging (Vault Auth)</option>
              </select>
            </div>

            <form onSubmit={sendHttp} className="flex-row">
              <select
                className="select mono"
                style={{ width: 95 }}
                value={httpMethod}
                onChange={(e) => setHttpMethod(e.target.value)}
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>DELETE</option>
              </select>
              <input
                className="input mono"
                value={httpUrl}
                onChange={(e) => setHttpUrl(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                <Play size={13} /> Send
              </button>
            </form>

            {httpMethod !== 'GET' && (
              <textarea
                className="textarea mono"
                rows={3}
                placeholder='{"query": "{ __schema { types { name } } }"}'
                value={httpBody}
                onChange={(e) => setHttpBody(e.target.value)}
              />
            )}

            {httpResp && (
              <div className="card-elevated stack-sm">
                {httpResp.error ? (
                  <div style={{ color: 'var(--danger)' }}>{httpResp.error}</div>
                ) : (
                  <>
                    <div className="flex-row">
                      <span className="badge badge-success">HTTP {httpResp.status}</span>
                      <span className="badge">{httpResp.elapsedMs} ms</span>
                    </div>
                    <pre
                      className="mono"
                      style={{ margin: 0, maxHeight: 200, overflowY: 'auto', fontSize: '0.78rem' }}
                    >
                      {httpResp.body}
                    </pre>
                  </>
                )}
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />

            <div className="flex-between">
              <strong>Live WebSocket Frame Client (`/api/ws`)</strong>
              <button
                type="button"
                className={`btn btn-sm ${wsConnected ? 'btn-danger' : 'btn-primary'}`}
                onClick={toggleWebSocket}
              >
                {wsConnected ? 'Disconnect WS' : 'Connect WebSocket'}
              </button>
            </div>
            <div className="flex-row">
              <input
                className="input mono"
                value={wsInput}
                onChange={(e) => setWsInput(e.target.value)}
                placeholder='{"action":"ping"}'
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!wsConnected}
                onClick={sendWsFrame}
              >
                Send Frame
              </button>
            </div>
            <div style={{ maxHeight: 150, overflowY: 'auto' }} className="stack-sm">
              {wsFrames.map((f, i) => (
                <div key={i} className="card-elevated mono" style={{ fontSize: '0.75rem' }}>
                  <span className={`badge ${f.dir === 'IN' ? 'badge-success' : 'badge-accent'}`}>
                    {f.dir}
                  </span>{' '}
                  <span className="muted">{f.ts}</span> — {f.text}
                </div>
              ))}
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>OpenAPI / Swagger Spec Browser</h3>
            <textarea
              className="textarea mono"
              rows={6}
              value={openApiSpec}
              onChange={(e) => setOpenApiSpec(e.target.value)}
            />
            <div className="stack-sm">
              {parsedEndpoints.map((ep) => (
                <div key={`${ep.method}-${ep.path}`} className="card-elevated flex-between">
                  <div>
                    <span className="badge badge-accent mono">{ep.method}</span>{' '}
                    <strong className="mono">{ep.path}</strong>
                    <div className="muted" style={{ fontSize: '0.78rem' }}>
                      {ep.summary}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setHttpMethod(ep.method);
                      setHttpUrl(`http://127.0.0.1:4780${ep.path}`);
                    }}
                  >
                    Load in Client
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'sqlite' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12 }}>
          <div className="card stack-sm">
            <strong>SQLite Schema Browser</strong>
            <div className="muted mono" style={{ fontSize: '0.76rem' }}>
              {schemaInfo?.databaseFile}
            </div>
            {schemaInfo?.tables.map((t) => (
              <div key={t.name} className="card-elevated stack-sm">
                <div className="flex-between">
                  <strong className="mono">{t.name}</strong>
                  <span className="badge">{t.rowCount} rows</span>
                </div>
                <div className="muted mono" style={{ fontSize: '0.74rem' }}>
                  {t.columns.map((c) => `${c.name}:${c.type}`).join(', ')}
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSqlText(`SELECT * FROM ${t.name} LIMIT 50;`)}
                >
                  Query Table
                </button>
              </div>
            ))}

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />
            <strong>Schema Migrations ({schemaInfo?.migrations.length || 0})</strong>
            {schemaInfo?.migrations.map((m) => (
              <div key={m.version} className="mono" style={{ fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--accent)' }}>{m.version}</span> — {m.name}
              </div>
            ))}
          </div>

          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>SQL Query Editor & Exporter</h3>
              <div className="flex-row">
                <label className="flex-row" style={{ fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allowSqlWrite}
                    onChange={(e) => setAllowSqlWrite(e.target.checked)}
                  />
                  Allow INSERT / UPDATE / DDL
                </label>
                <button type="button" className="btn btn-sm" onClick={formatSql}>
                  Format SQL
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={executeSql}>
                  <Play size={13} /> Execute SQL
                </button>
              </div>
            </div>

            <textarea
              className="textarea mono"
              rows={4}
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
            />

            {sqlError && (
              <div className="card-elevated" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                {sqlError}
              </div>
            )}

            {sqlResult && (
              <div className="stack-sm">
                <div className="flex-between">
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    Returned {sqlResult.rowCount} row(s) in {sqlResult.elapsedMs} ms
                  </span>
                  <div className="flex-row">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => exportQueryResults('csv')}
                    >
                      <Download size={12} /> Export CSV
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => exportQueryResults('json')}
                    >
                      <Download size={12} /> Export JSON
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {sqlResult.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sqlResult.rows.map((row, idx) => (
                        <tr key={idx}>
                          {sqlResult.columns.map((c) => (
                            <td key={c} className="mono">
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />

            <div className="grid-2">
              <div className="card-elevated stack-sm">
                <strong>Visual Row Inserter (`desktop_releases`)</strong>
                <div className="grid-2" style={{ gridTemplateColumns: '1fr 90px' }}>
                  <input
                    className="input"
                    value={relAppName}
                    onChange={(e) => setRelAppName(e.target.value)}
                    placeholder="App Name"
                  />
                  <input
                    className="input mono"
                    value={relVersion}
                    onChange={(e) => setRelVersion(e.target.value)}
                    placeholder="Version"
                  />
                </div>
                <div className="grid-3" style={{ gridTemplateColumns: '85px 1fr 1fr' }}>
                  <select
                    className="select"
                    value={relArch}
                    onChange={(e) => setRelArch(e.target.value)}
                  >
                    <option value="x64">x64</option>
                    <option value="ARM64">ARM64</option>
                  </select>
                  <input
                    className="input"
                    value={relFormat}
                    onChange={(e) => setRelFormat(e.target.value)}
                    placeholder="Format"
                  />
                  <input
                    className="input"
                    value={relChannel}
                    onChange={(e) => setRelChannel(e.target.value)}
                    placeholder="Channel"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    requestConsent(
                      {
                        id: `sql-ins-${Date.now()}`,
                        title: 'Insert Release Row into SQLite (desktop_releases)',
                        actionType: 'file-mutate',
                        description: `Inserts "${relAppName} ${relVersion} (${relArch})" via parameterized prepared statement.`,
                        commandPreview: `INSERT INTO desktop_releases (app_name, version, architecture, package_format, channel) VALUES (...)`,
                        impactScope: 'Local Project',
                        reversibleNote: 'Reversible via DELETE FROM desktop_releases WHERE id = <inserted_id>.',
                      },
                      async () => {
                        const r = await fetch('/api/sqlite/insert-row', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            table: 'desktop_releases',
                            values: {
                              app_name: relAppName,
                              version: relVersion,
                              architecture: relArch,
                              package_format: relFormat,
                              signed: 1,
                              channel: relChannel,
                              published_at: new Date().toISOString(),
                            },
                            consentConfirmed: true,
                          }),
                        });
                        const d = await r.json();
                        if (r.ok) {
                          loadSchema();
                          notify(`Inserted row #${d.lastInsertRowid} into desktop_releases`);
                        } else {
                          notify(`Insert failed: ${d.error}`);
                        }
                      }
                    )
                  }
                >
                  Insert Release Record
                </button>
              </div>

              <div className="card-elevated stack-sm">
                <strong>Transactional Migration Runner (`schema_migrations`)</strong>
                <div className="grid-2" style={{ gridTemplateColumns: '125px 1fr' }}>
                  <input
                    className="input mono"
                    value={migVersion}
                    onChange={(e) => setMigVersion(e.target.value)}
                    placeholder="Version ID"
                  />
                  <input
                    className="input mono"
                    value={migName}
                    onChange={(e) => setMigName(e.target.value)}
                    placeholder="Migration Name"
                  />
                </div>
                <textarea
                  className="textarea mono"
                  rows={2}
                  value={migSql}
                  onChange={(e) => setMigSql(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    requestConsent(
                      {
                        id: `sql-mig-${Date.now()}`,
                        title: `Apply SQLite Migration ${migVersion} (${migName})`,
                        actionType: 'file-mutate',
                        description:
                          'Runs migration SQL inside a BEGIN...COMMIT transaction and records SHA-256 checksum in schema_migrations.',
                        commandPreview: migSql,
                        impactScope: 'Local Project',
                        reversibleNote: 'Automatically rolls back on SQL error.',
                      },
                      async () => {
                        const r = await fetch('/api/sqlite/apply-migration', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            version: migVersion,
                            name: migName,
                            upSql: migSql,
                            consentConfirmed: true,
                          }),
                        });
                        const d = await r.json();
                        if (r.ok) {
                          loadSchema();
                          notify(`Applied migration ${d.version} (${d.checksum})`);
                        } else {
                          notify(`Migration failed: ${d.error}`);
                        }
                      }
                    )
                  }
                >
                  Apply Transactional Migration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'network' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>
              <ShieldCheck size={16} /> JWT Inspector (Offline Client-Side Decode)
            </h3>
            <textarea
              className="textarea mono"
              rows={3}
              value={jwtToken}
              onChange={(e) => setJwtToken(e.target.value)}
            />
            {decodedJwt ? (
              <pre className="card-elevated mono" style={{ margin: 0, fontSize: '0.78rem' }}>
                {JSON.stringify(decodedJwt, null, 2)}
              </pre>
            ) : (
              <div className="muted">Enter a valid 3-segment JWT to inspect claims.</div>
            )}
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Local Port Availability, DNS & TLS Inspector</h3>
            <div className="flex-row">
              <input
                className="input mono"
                style={{ width: 120 }}
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
              />
              <button type="button" className="btn btn-sm btn-primary" onClick={checkPort}>
                Check Local Port
              </button>
              {portStatus && (
                <span className={`badge ${portStatus.inUse ? 'badge-warn' : 'badge-success'}`}>
                  Port {portStatus.port}: {portStatus.inUse ? 'LISTENING / IN USE' : 'AVAILABLE'} ({portStatus.latencyMs}ms)
                </span>
              )}
            </div>

            <div className="flex-row">
              <input
                className="input mono"
                value={dnsHost}
                onChange={(e) => setDnsHost(e.target.value)}
                placeholder="Hostname for DNS lookup..."
              />
              <button type="button" className="btn btn-sm" onClick={runDns}>
                DNS Lookup
              </button>
            </div>
            {dnsResult && (
              <pre className="card-elevated mono" style={{ margin: 0, fontSize: '0.76rem' }}>
                {dnsResult}
              </pre>
            )}

            <div className="flex-row">
              <input
                className="input mono"
                value={tlsHost}
                onChange={(e) => setTlsHost(e.target.value)}
                placeholder="HTTPS host (e.g. github.com)"
              />
              <button type="button" className="btn btn-sm" onClick={runTls}>
                Inspect TLS Cert
              </button>
            </div>
            {tlsResult && (
              <pre
                className="card-elevated mono"
                style={{ margin: 0, fontSize: '0.75rem', maxHeight: 150, overflowY: 'auto' }}
              >
                {tlsResult}
              </pre>
            )}
          </div>
        </div>
      )}

      {tab === 'containers' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Docker, Podman, Kubernetes & Cloud CLI Status</h3>
            <div className="stack-sm">
              {toolchains
                .filter((t) => t.category === 'Container / Cloud')
                .map((c) => (
                  <div key={c.id} className="card-elevated flex-between">
                    <div>
                      <strong>{c.name}</strong>
                      <div className="muted mono" style={{ fontSize: '0.76rem' }}>
                        {c.detectedVersion || 'CLI not installed'}
                      </div>
                    </div>
                    <span className={`badge ${c.installed ? 'badge-success' : 'badge-warn'}`}>
                      {c.installed ? 'Detected' : 'Optional'}
                    </span>
                  </div>
                ))}
            </div>
            <div className="flex-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  runCommandWithConsent({
                    label: 'Docker Compose Status',
                    command: 'docker compose ps',
                  })
                }
              >
                docker compose ps
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  runCommandWithConsent({
                    label: 'GitHub CLI Auth Status',
                    command: 'gh auth status',
                  })
                }
              >
                gh auth status
              </button>
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Compose & Local Dev Service Definition Helper</h3>
            <textarea
              className="textarea mono"
              rows={8}
              value={composeYaml}
              onChange={(e) => setComposeYaml(e.target.value)}
            />
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              Detected local service port bindings: 5432 (PostgreSQL), 6379 (Redis).
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiDataModule;
