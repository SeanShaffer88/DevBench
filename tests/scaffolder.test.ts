import { describe, expect, it } from 'vitest';
import { STARTER_TEMPLATES } from '../shared/catalog/templates';
import {
  deleteScaffoldedWorkspace,
  deriveProjectNames,
  executeProjectScaffold,
  previewProjectScaffold,
  ScaffoldConsentError,
} from '../server/services/projectScaffolder';

describe('Project Scaffolder Engine (All 15 Starter Templates & Safety Gates)', () => {
  it('blocks Windows reserved device names and path traversal characters', () => {
    expect(() => deriveProjectNames('CON', 'Contoso')).toThrow(/reserved Win32 device name/i);
    expect(() => deriveProjectNames('COM1.app', 'Contoso')).toThrow(/reserved Win32 device name/i);
    expect(() => deriveProjectNames('../escape', 'Contoso')).toThrow(/disallowed/i);
    expect(() => deriveProjectNames('Bad:Name', 'Contoso')).toThrow(/disallowed/i);
  });

  it('generates rich multi-file dry-run previews for all 15 starter templates without touching disk', () => {
    expect(STARTER_TEMPLATES).toHaveLength(15);

    for (const tpl of STARTER_TEMPLATES) {
      const preview = previewProjectScaffold({
        templateId: tpl.id,
        projectName: `Sample-${tpl.language}`,
        companyName: 'Contoso Desktop Labs',
        accentHex: '#0284c7',
        language: tpl.language,
        uiFrameworkId: tpl.uiFrameworkId,
        buildSystemId: tpl.buildSystemId,
        packageManagerId: tpl.packageManagerId,
        targetArchitectures: tpl.recommendedArchitectures,
        windowsSdkTarget: '10.0.22621.0',
        includeWin32Manifest: true,
        includeMsixManifest: true,
        includeBinaryIconAndRc: true,
        includeUnitTests: true,
        includeBuildScripts: true,
        includeGitScaffold: true,
        initGitRepo: false,
      });

      expect(preview.totalFiles).toBeGreaterThanOrEqual(8);
      expect(preview.targetDir).toBe(`workspaces/Sample-${tpl.language}`);

      const relPaths = preview.files.map((f) => f.relativePath);
      expect(relPaths).toContain('app.manifest');
      expect(relPaths).toContain('Package.appxmanifest');
      expect(relPaths).toContain('assets/app.ico');
      expect(relPaths).toContain('assets/app.rc');
      expect(relPaths).toContain('scripts/build-windows.ps1');
      expect(relPaths).toContain('.gitignore');
      expect(relPaths).toContain('.gitattributes');
      expect(relPaths).toContain('README.md');
      expect(relPaths).toContain('.devbench-project.json');

      const icoEntry = preview.files.find((f) => f.relativePath === 'assets/app.ico');
      expect(icoEntry?.isBinary).toBe(true);
      expect(icoEntry?.bytes).toBeGreaterThan(2000);
    }
  });

  it('enforces explicit user consent before writing or deleting scaffolded directories', () => {
    const tpl = STARTER_TEMPLATES[0];
    expect(() =>
      executeProjectScaffold(
        {
          templateId: tpl.id,
          projectName: 'UnapprovedApp',
          companyName: 'Contoso',
          language: tpl.language,
          uiFrameworkId: tpl.uiFrameworkId,
          buildSystemId: tpl.buildSystemId,
          packageManagerId: tpl.packageManagerId,
          targetArchitectures: ['x64'],
          windowsSdkTarget: '10.0.22621.0',
          includeWin32Manifest: true,
          includeMsixManifest: false,
          includeBinaryIconAndRc: false,
          includeUnitTests: false,
          includeBuildScripts: false,
          includeGitScaffold: false,
          initGitRepo: false,
        },
        false
      )
    ).toThrow(ScaffoldConsentError);

    expect(() => deleteScaffoldedWorkspace('UnapprovedApp', false)).toThrow(ScaffoldConsentError);
  });
});
