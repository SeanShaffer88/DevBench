import { describe, expect, it } from 'vitest';
import {
  BUILD_SYSTEMS,
  DEBUGGER_ADAPTERS,
  LANGUAGE_ADAPTERS,
  PACKAGE_MANAGERS,
  UI_FRAMEWORKS,
} from '../shared/catalog/ecosystems';
import { CORE_MODULES } from '../shared/catalog/modules';
import { BUILTIN_PLUGINS } from '../shared/catalog/plugins';

describe('Modular Workbench Registry & Ecosystem Coverage', () => {
  it('registers all 13 top-level modules with graceful missing-tool fallback declarations', () => {
    expect(CORE_MODULES).toHaveLength(13);
    const ids = CORE_MODULES.map((m) => m.id);
    expect(ids).toEqual([
      'home',
      'projects',
      'code',
      'build-run',
      'test',
      'debug',
      'git',
      'packages',
      'apis-data',
      'windows',
      'security',
      'team',
      'settings',
    ]);
    for (const mod of CORE_MODULES) {
      expect(mod.gracefulFallbackNote.length).toBeGreaterThan(15);
    }
  });

  it('covers all primary and plugin-defined languages decoupled from UI, Build, and Package layers', () => {
    const langIds = LANGUAGE_ADAPTERS.map((l) => l.id);
    for (const expected of [
      'csharp',
      'cpp',
      'vbnet',
      'fsharp',
      'rust',
      'python',
      'java',
      'kotlin',
      'ts-js',
      'dart',
      'go',
      'swift',
      'delphi',
      'powershell',
      'custom-legacy',
    ]) {
      expect(langIds).toContain(expected);
    }
    expect(UI_FRAMEWORKS.length).toBeGreaterThanOrEqual(15);
    expect(BUILD_SYSTEMS.length).toBeGreaterThanOrEqual(10);
    expect(PACKAGE_MANAGERS.length).toBeGreaterThanOrEqual(8);
    expect(DEBUGGER_ADAPTERS.length).toBeGreaterThanOrEqual(5);
  });

  it('enforces versioned, isolated, permission-declared plugin manifests', () => {
    for (const plugin of BUILTIN_PLUGINS) {
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(plugin.isolatedWorker).toBe(true);
      expect(plugin.permissions.length).toBeGreaterThan(0);
    }
  });
});
