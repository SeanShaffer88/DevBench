import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { WORKSPACE_ROOT } from './workspaceFs';

const require = createRequire(import.meta.url);

interface SqliteStatement {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => { changes?: number | bigint; lastInsertRowid?: number | bigint };
}

interface SqliteDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
}

const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (filename: string) => SqliteDatabase;
};

let dbInstance: SqliteDatabase | null = null;

function getDb(): SqliteDatabase {
  if (dbInstance) return dbInstance;
  const dbDir = path.join(WORKSPACE_ROOT, '.devbench', 'sqlite');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'workbench.db');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS desktop_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      version TEXT NOT NULL,
      architecture TEXT NOT NULL,
      package_format TEXT NOT NULL,
      signed INTEGER NOT NULL DEFAULT 1,
      channel TEXT NOT NULL,
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      target_ring TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM desktop_releases').get() as { cnt: number };
  if (countRow.cnt === 0) {
    db.exec(`
      INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES
        ('20261001_01', 'init_release_registry', '2026-10-01T09:00:00Z', 'sha256:8f41c2a9'),
        ('20261015_02', 'add_arm64_and_signing_columns', '2026-10-15T14:20:00Z', 'sha256:3b92e110'),
        ('20261027_03', 'create_feature_flags_table', '2026-10-27T08:00:00Z', 'sha256:9d04f77b');

      INSERT INTO desktop_releases (app_name, version, architecture, package_format, signed, channel, published_at) VALUES
        ('DevBench Workbench', '1.0.0', 'x64', 'NSIS + MSIX', 1, 'Stable', '2026-10-27T08:30:00Z'),
        ('DevBench Workbench', '1.0.0', 'ARM64', 'MSIX', 1, 'Stable', '2026-10-27T08:30:00Z'),
        ('Contoso Telemetry Studio', '4.2.1', 'x64', 'MSIX', 1, 'Enterprise', '2026-10-20T17:15:00Z'),
        ('VoxelForge CAD', '2.8.0-rc2', 'x64', 'Inno Setup', 1, 'Preview', '2026-10-24T12:00:00Z'),
        ('IronNote Vault', '0.9.4', 'ARM64', 'WiX MSI', 0, 'Canary', '2026-10-26T21:40:00Z');

      INSERT INTO feature_flags (key, enabled, target_ring, description) VALUES
        ('windows.perMonitorDpiV2', 1, 'All', 'Enforce PerMonitorV2 DPI scaling across child dialogs'),
        ('security.autoRedactClipboard', 1, 'All', 'Mask API keys and tokens when copying diagnostic bundles'),
        ('swift.remoteMacBuildBridge', 0, 'Preview', 'Enable SSH remote macOS build target for cross-platform Swift apps');
    `);
  }

  dbInstance = db;
  return db;
}

export function getSqliteSchema() {
  const db = getDb();
  const tables = db
    .prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all() as { name: string; sql: string }[];

  const detailed = tables.map((t) => {
    const safeName = t.name.replace(/[^A-Za-z0-9_]/g, '');
    const columns = db.prepare(`PRAGMA table_info(${safeName})`).all() as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    const rowCount = (db.prepare(`SELECT COUNT(*) as cnt FROM ${safeName}`).get() as { cnt: number }).cnt;
    return {
      name: t.name,
      sql: t.sql,
      rowCount,
      columns,
    };
  });

  const migrations = db.prepare('SELECT * FROM schema_migrations ORDER BY version DESC').all();
  return {
    databaseFile: '.devbench/sqlite/workbench.db',
    engine: 'Node.js Built-in SQLite (SQLite 3)',
    tables: detailed,
    migrations,
  };
}

export function runSqliteQuery(sql: string, allowMutation = false) {
  const db = getDb();
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error('SQL query cannot be empty.');
  }

  const isReadQuery = /^(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(trimmed);
  if (!isReadQuery && !allowMutation) {
    throw new Error(
      'Write query detected (INSERT / UPDATE / DELETE / DDL). Enable write consent before mutating database tables.'
    );
  }

  const start = performance.now();
  if (isReadQuery) {
    const stmt = db.prepare(trimmed);
    const rows = stmt.all() as Record<string, unknown>[];
    const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      mode: 'read',
      elapsedMs,
      rowCount: rows.length,
      columns,
      rows: rows.slice(0, 500),
    };
  } else {
    const res = db.prepare(trimmed).run();
    const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      mode: 'write',
      elapsedMs,
      rowCount: Number(res.changes ?? 0),
      lastInsertRowid: Number(res.lastInsertRowid ?? 0),
      columns: ['changes', 'lastInsertRowid'],
      rows: [{ changes: Number(res.changes ?? 0), lastInsertRowid: Number(res.lastInsertRowid ?? 0) }],
    };
  }
}
