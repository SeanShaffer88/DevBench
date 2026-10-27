import React, { useMemo, useState } from 'react';
import { Eye, Layers, Sparkles } from 'lucide-react';

interface XamlNodePreview {
  tag: string;
  text?: string;
  placeholder?: string;
  header?: string;
  isChecked?: boolean;
  value?: number;
  styleKind?: string;
}

const DEFAULT_XAML = `<Window
    x:Class="AuroraWinClient.MainWindow"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Aurora Telemetry Studio — WinUI 3">
    <Window.SystemBackdrop>
        <MicaBackdrop Kind="BaseAlt" />
    </Window.SystemBackdrop>
    <StackPanel Padding="24" Spacing="12">
        <TextBlock Text="Windows 11 Hardware Telemetry" Style="{StaticResource TitleTextBlockStyle}" />
        <TextBlock Text="PerMonitorV2 High-DPI • Mica Backdrop • UI Automation Ready" />
        <TextBox Header="Device Endpoint" PlaceholderText="\\\\.\\pipe\\contoso-sensor-bus" />
        <ToggleSwitch Header="Real-Time ETW Kernel Trace" IsOn="True" />
        <ProgressBar Value="68" />
        <Button Content="Start Diagnostic Capture" />
    </StackPanel>
</Window>`;

function attrValue(attrs: string, name: string): string | undefined {
  const rx = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = attrs.match(rx);
  return m ? m[1] : undefined;
}

export function parseXamlPreviewModel(xaml: string): {
  windowTitle: string;
  backdrop: 'Mica' | 'Acrylic' | 'Standard';
  controls: XamlNodePreview[];
  xmlValid: boolean;
} {
  const titleMatch = xaml.match(/<(?:Window|Page)\b[^>]*\bTitle\s*=\s*"([^"]*)"/i);
  const windowTitle = titleMatch ? titleMatch[1] : 'WinUI 3 / WPF Desktop Window';
  const backdrop: 'Mica' | 'Acrylic' | 'Standard' = /<MicaBackdrop\b/i.test(xaml)
    ? 'Mica'
    : /<DesktopAcrylicBackdrop\b/i.test(xaml)
      ? 'Acrylic'
      : 'Standard';

  const controls: XamlNodePreview[] = [];
  const tagRegex =
    /<(TextBlock|Button|TextBox|CheckBox|ToggleSwitch|ProgressBar|InfoBar)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xaml)) !== null) {
    const [, rawTag, attrs, innerText] = match;
    const tag = rawTag;
    const text =
      attrValue(attrs, 'Text') ||
      attrValue(attrs, 'Content') ||
      attrValue(attrs, 'Message') ||
      (innerText ? innerText.trim() : undefined);

    controls.push({
      tag,
      text,
      header: attrValue(attrs, 'Header') || attrValue(attrs, 'Title'),
      placeholder: attrValue(attrs, 'PlaceholderText'),
      styleKind: attrValue(attrs, 'Style') || attrValue(attrs, 'FontSize'),
      isChecked: /^(true|1)$/i.test(
        attrValue(attrs, 'IsOn') || attrValue(attrs, 'IsChecked') || ''
      ),
      value: attrValue(attrs, 'Value') ? Number(attrValue(attrs, 'Value')) : undefined,
    });
  }

  const openWindows = (xaml.match(/<(?:Window|Page)\b/g) || []).length;
  const closeWindows = (xaml.match(/<\/(?:Window|Page)>/g) || []).length;

  return {
    windowTitle,
    backdrop,
    controls,
    xmlValid: openWindows === closeWindows && controls.length >= 0,
  };
}

export const XamlLayoutPreviewer: React.FC = () => {
  const [xamlSource, setXamlSource] = useState(DEFAULT_XAML);
  const [previewTheme, setPreviewTheme] = useState<'dark-mica' | 'light-mica' | 'high-contrast'>(
    'dark-mica'
  );
  const [dpiPct, setDpiPct] = useState<number>(100);
  const [loadPath, setLoadPath] = useState('workspaces/AuroraWinClient/MainWindow.xaml');

  const model = useMemo(() => parseXamlPreviewModel(xamlSource), [xamlSource]);

  const palette =
    previewTheme === 'light-mica'
      ? {
          chromeBg: '#eef2f6',
          bodyBg: '#f8fafc',
          fg: '#0f172a',
          muted: '#475569',
          accent: '#0284c7',
          accentFg: '#ffffff',
          border: '#cbd5e1',
          inputBg: '#ffffff',
        }
      : previewTheme === 'high-contrast'
        ? {
            chromeBg: '#000000',
            bodyBg: '#000000',
            fg: '#ffffff',
            muted: '#ffff00',
            accent: '#1aebff',
            accentFg: '#000000',
            border: '#ffffff',
            inputBg: '#000000',
          }
        : {
            chromeBg: '#161d2a',
            bodyBg: 'linear-gradient(145deg, #1b2436 0%, #121824 100%)',
            fg: '#f1f5f9',
            muted: '#94a3b8',
            accent: '#38bdf8',
            accentFg: '#082f49',
            border: '#334155',
            inputBg: '#0f172a',
          };

  const loadWorkspaceXaml = async () => {
    try {
      const r = await fetch(`/api/files/read?path=${encodeURIComponent(loadPath)}`);
      const d = await r.json();
      if (r.ok && d.content) {
        setXamlSource(d.content);
      }
    } catch {
      // ignore if file doesn't exist yet
    }
  };

  return (
    <div className="grid-2">
      <div className="card stack-sm">
        <div className="flex-between">
          <h3 style={{ margin: 0 }}>
            <Layers size={15} /> Live WinUI 3 / WPF `.xaml` Markup Editor
          </h3>
          <span className={`badge ${model.xmlValid ? 'badge-success' : 'badge-warn'}`}>
            {model.backdrop} Backdrop · {model.controls.length} UIA Controls
          </span>
        </div>

        <div className="flex-row">
          <input
            className="input mono"
            style={{ fontSize: '0.78rem' }}
            value={loadPath}
            onChange={(e) => setLoadPath(e.target.value)}
            placeholder="workspaces/<Project>/MainWindow.xaml"
          />
          <button type="button" className="btn btn-sm" onClick={loadWorkspaceXaml}>
            Load `.xaml`
          </button>
        </div>

        <textarea
          className="textarea mono"
          rows={15}
          value={xamlSource}
          onChange={(e) => setXamlSource(e.target.value)}
          spellCheck={false}
          aria-label="XAML Layout Source"
        />
      </div>

      <div className="card stack-sm">
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h3 style={{ margin: 0 }}>
            <Eye size={15} /> Visual Window Chrome, Theme & DPI Preview
          </h3>
          <div className="flex-row">
            <button
              type="button"
              className={`btn btn-sm ${previewTheme === 'dark-mica' ? 'btn-primary' : ''}`}
              onClick={() => setPreviewTheme('dark-mica')}
            >
              Dark Mica
            </button>
            <button
              type="button"
              className={`btn btn-sm ${previewTheme === 'light-mica' ? 'btn-primary' : ''}`}
              onClick={() => setPreviewTheme('light-mica')}
            >
              Light Mica
            </button>
            <button
              type="button"
              className={`btn btn-sm ${previewTheme === 'high-contrast' ? 'btn-primary' : ''}`}
              onClick={() => setPreviewTheme('high-contrast')}
            >
              High-Contrast
            </button>
          </div>
        </div>

        <div className="flex-row">
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            Simulated Monitor Scale:
          </span>
          {[100, 125, 150, 175].map((pct) => (
            <button
              key={pct}
              type="button"
              className={`btn btn-sm ${dpiPct === pct ? 'btn-primary' : ''}`}
              onClick={() => setDpiPct(pct)}
            >
              {pct}%
            </button>
          ))}
        </div>

        <div
          className="card-elevated"
          style={{
            minHeight: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 430,
              transform: `scale(${Math.min(dpiPct / 115, 1.22)})`,
              transformOrigin: 'center',
              borderRadius: 10,
              overflow: 'hidden',
              border: `1.5px solid ${palette.border}`,
              background: palette.bodyBg,
              color: palette.fg,
              boxShadow: '0 14px 32px rgba(0,0,0,0.35)',
            }}
          >
            {/* Windows 11 Title Bar Chrome */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '7px 12px',
                background: palette.chromeBg,
                borderBottom: `1px solid ${palette.border}`,
                fontSize: '0.78rem',
              }}
            >
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={12} style={{ color: palette.accent }} />
                {model.windowTitle}
              </span>
              <span className="mono" style={{ letterSpacing: 6, opacity: 0.75 }}>
                — □ ×
              </span>
            </div>

            {/* Rendered XAML Controls */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {model.controls.map((ctrl, idx) => {
                if (ctrl.tag === 'TextBlock') {
                  const isTitle =
                    ctrl.styleKind?.includes('Title') || Number(ctrl.styleKind) >= 20 || idx === 0;
                  return (
                    <div
                      key={idx}
                      style={{
                        fontSize: isTitle ? '1.12rem' : '0.83rem',
                        fontWeight: isTitle ? 700 : 400,
                        color: isTitle ? palette.fg : palette.muted,
                      }}
                    >
                      {ctrl.text || 'TextBlock'}
                    </div>
                  );
                }

                if (ctrl.tag === 'TextBox') {
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {ctrl.header && (
                        <span style={{ fontSize: '0.76rem', color: palette.muted }}>{ctrl.header}</span>
                      )}
                      <div
                        className="mono"
                        style={{
                          padding: '5px 9px',
                          borderRadius: 5,
                          border: `1px solid ${palette.border}`,
                          background: palette.inputBg,
                          color: palette.muted,
                          fontSize: '0.78rem',
                        }}
                      >
                        {ctrl.text || ctrl.placeholder || ''}
                      </div>
                    </div>
                  );
                }

                if (ctrl.tag === 'ToggleSwitch' || ctrl.tag === 'CheckBox') {
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                      }}
                    >
                      <span>{ctrl.header || ctrl.text || ctrl.tag}</span>
                      <span
                        style={{
                          padding: '2px 9px',
                          borderRadius: 999,
                          background: ctrl.isChecked ? palette.accent : 'transparent',
                          color: ctrl.isChecked ? palette.accentFg : palette.fg,
                          border: `1px solid ${palette.border}`,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {ctrl.isChecked ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  );
                }

                if (ctrl.tag === 'ProgressBar') {
                  const pct = Math.max(5, Math.min(100, ctrl.value ?? 50));
                  return (
                    <div
                      key={idx}
                      style={{
                        height: 6,
                        borderRadius: 4,
                        background: palette.inputBg,
                        border: `1px solid ${palette.border}`,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ width: `${pct}%`, height: '100%', background: palette.accent }} />
                    </div>
                  );
                }

                if (ctrl.tag === 'Button') {
                  return (
                    <div key={idx} style={{ paddingTop: 2 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '6px 14px',
                          borderRadius: 6,
                          background: palette.accent,
                          color: palette.accentFg,
                          fontWeight: 600,
                          fontSize: '0.82rem',
                        }}
                      >
                        {ctrl.text || 'Button'}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={idx} style={{ fontSize: '0.8rem' }}>
                    [{ctrl.tag}] {ctrl.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
