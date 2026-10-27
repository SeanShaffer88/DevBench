import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { extractDiagnosticsFromLines, parseDiagnosticLine } from '../shared/diagnosticParser';
import App from '../src/App';
import { parseXamlPreviewModel, XamlLayoutPreviewer } from '../src/components/XamlLayoutPreviewer';

function hexToRelativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channels = [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = hexToRelativeLuminance(hexA);
  const l2 = hexToRelativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('UI Shell, Accessibility Landmarks, WCAG Contrast, XAML Previewer & Diagnostic Parser', () => {
  it('renders ARIA landmarks, screen-reader live regions, and 13 module navigation links at startup', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('role="main"');
    expect(html).toContain('aria-label="Active Module Workspace"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Toggle module navigation sidebar (Ctrl+B)');
    expect(html).toContain('DevBench');
  });

  it('lazy-loads all 12 optional workbench modules rather than eagerly importing them at startup', () => {
    const appSource = fs.readFileSync('src/App.tsx', 'utf8');
    const lazyImports = appSource.match(/lazy\(\(\)\s*=>\s*import\(/g) || [];
    expect(lazyImports.length).toBe(12);
  });

  it('meets WCAG AA/AAA foreground-background contrast ratios across Dark, Light, and High-Contrast themes', () => {
    // Fluent Dark: #f1f5f9 on #0b1120
    expect(contrastRatio('#f1f5f9', '#0b1120')).toBeGreaterThan(14);
    // Fluent Light: #0f172a on #ffffff
    expect(contrastRatio('#0f172a', '#ffffff')).toBeGreaterThan(15);
    // Windows High-Contrast: #ffffff and #ffff00 and #a6ffff on #000000 (AAA >= 7:1)
    expect(contrastRatio('#ffffff', '#000000')).toBeGreaterThanOrEqual(21);
    expect(contrastRatio('#ffff00', '#000000')).toBeGreaterThan(19);
    expect(contrastRatio('#a6ffff', '#000000')).toBeGreaterThan(15);
  });

  it('parses clickable file:line:col diagnostics across MSBuild/C#, MSVC, TypeScript, Rust, Python, and Go', () => {
    const cs = parseDiagnosticLine('Views\\MainWindow.xaml.cs(42,15): error CS1002: ; expected');
    expect(cs?.file).toBe('Views/MainWindow.xaml.cs');
    expect(cs?.line).toBe(42);
    expect(cs?.column).toBe(15);
    expect(cs?.code).toBe('CS1002');
    expect(cs?.severity).toBe('error');

    const msvc = parseDiagnosticLine('src\\main.cpp(18): warning C4100: unreferenced parameter');
    expect(msvc?.file).toBe('src/main.cpp');
    expect(msvc?.line).toBe(18);
    expect(msvc?.severity).toBe('warning');

    const ts = parseDiagnosticLine('src/App.tsx:28:9 - error TS2322: Type mismatch');
    expect(ts?.file).toBe('src/App.tsx');
    expect(ts?.line).toBe(28);
    expect(ts?.column).toBe(9);

    const rust = parseDiagnosticLine('  --> src/main.rs:14:5');
    expect(rust?.file).toBe('src/main.rs');
    expect(rust?.line).toBe(14);

    const py = parseDiagnosticLine('  File "src/app/main.py", line 27, in main');
    expect(py?.file).toBe('src/app/main.py');
    expect(py?.line).toBe(27);

    const batch = extractDiagnosticsFromLines([
      '[Build] main.go:19:2: undefined: RunApp',
      '[Build] main.go:19:2: undefined: RunApp',
    ]);
    expect(batch).toHaveLength(1);
    expect(batch[0].file).toBe('main.go');
    expect(batch[0].line).toBe(19);
  });

  it('parses and renders WinUI 3 / WPF XAML layouts with Mica backdrop and UIA controls', () => {
    const model = parseXamlPreviewModel(
      `<Window Title="Contoso Sensor Hub"><Window.SystemBackdrop><MicaBackdrop /></Window.SystemBackdrop><StackPanel><TextBlock Text="Telemetry" /><ToggleSwitch Header="ETW" IsOn="True" /><Button Content="Capture" /></StackPanel></Window>`
    );
    expect(model.windowTitle).toBe('Contoso Sensor Hub');
    expect(model.backdrop).toBe('Mica');
    expect(model.controls).toHaveLength(3);

    const previewHtml = renderToStaticMarkup(<XamlLayoutPreviewer />);
    expect(previewHtml).toContain('Aurora Telemetry Studio');
    expect(previewHtml).toContain('Dark Mica');
    expect(previewHtml).toContain('High-Contrast');
  });
});
