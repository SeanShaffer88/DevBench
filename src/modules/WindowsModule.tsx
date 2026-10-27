import React, { useEffect, useState } from 'react';
import {
  AppWindow,
  Box,
  CheckCircle2,
  FileCheck2,
  Monitor,
  Shield,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

const DPI_CHECKLIST_ITEMS = [
  'Window handles WM_DPICHANGED when dragged from 100% 1080p monitor to 175% 4K monitor',
  'Icons & vector glyphs render sharp at 125%, 150%, 175%, and 200% scaling without GDI stretch',
  'All interactive controls expose UI Automation (UIA) Name & Role for Windows Narrator',
  'Keyboard Tab order & visible focus rings verified in Windows High-Contrast Aquatic/Night themes',
  'Child modal dialogs open centered on the same monitor as parent window',
  'Paths > 260 characters tested with longPathAware=true',
];

const DEV_REGISTRY_KEYS = [
  {
    name: 'Win32 Long Paths (>260 chars)',
    key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    value: 'LongPathsEnabled (DWORD = 1)',
    purpose: 'Prevents MAX_PATH build failures in CMake, Node, and deep NuGet caches',
  },
  {
    name: 'Windows Developer Mode / Sideloading',
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock',
    value: 'AllowDevelopmentWithoutDevLicense (DWORD = 1)',
    purpose: 'Required for local MSIX sideloading and WinUI 3 unpackaged debugging',
  },
  {
    name: 'Edge WebView2 Evergreen Runtime',
    key: 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    value: 'pv (REG_SZ version)',
    purpose: 'Verifies WebView2 runtime availability for Tauri, WinUI, WPF, and Wails apps',
  },
  {
    name: 'Local Crash Minidump Collection (WER)',
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting\\LocalDumps',
    value: 'DumpType (DWORD = 2 Full / 1 Mini)',
    purpose: 'Automatically writes .dmp crash files on unhandled native exceptions',
  },
];

export const WindowsModule: React.FC = () => {
  const { activeProject, copySafeText, openFileInEditor, notify } = useWorkbench();

  const [tab, setTab] = useState<'manifest' | 'packaging' | 'dpi' | 'sandbox'>('manifest');
  const [manifestXml, setManifestXml] = useState('');
  const [manifestChecks, setManifestChecks] = useState<
    { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[]
  >([]);

  // Signing command state (zero private key handling!)
  const [certSubject, setCertSubject] = useState('Contoso Desktop Engineering');
  const [timestampUrl, setTimestampUrl] = useState('http://timestamp.digicert.com');
  const [artifactPath, setArtifactPath] = useState('.\\release\\DevBenchSetup-x64.exe');

  // DPI simulator state
  const [simScale, setSimScale] = useState<number>(150);
  const [checkedDpi, setCheckedDpi] = useState<Record<number, boolean>>({ 0: true, 2: true });

  // Sandbox .wsb state
  const [wsbHostFolder, setWsbHostFolder] = useState('C:\\Projects\\DevBench\\release');
  const [wsbReadOnly, setWsbReadOnly] = useState(true);
  const [wsbNetwork, setWsbNetwork] = useState(true);
  const [wsbVgpu, setWsbVgpu] = useState(true);
  const [wsbMem, setWsbMem] = useState(8192);
  const [wsbXml, setWsbXml] = useState('');

  useEffect(() => {
    fetch('/api/files/read?path=windows/DevBench.app.manifest')
      .then((r) => r.json())
      .then((d) => {
        if (d.content) {
          setManifestXml(d.content);
          validateManifest(d.content);
        }
      })
      .catch(() => {});
  }, []);

  const validateManifest = async (xml: string) => {
    const r = await fetch('/api/windows/validate-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    const d = await r.json();
    setManifestChecks(d.checks || []);
  };

  const generateWsb = async () => {
    const r = await fetch('/api/windows/generate-wsb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostFolder: wsbHostFolder,
        readOnly: wsbReadOnly,
        networking: wsbNetwork,
        vgpu: wsbVgpu,
        memoryMb: wsbMem,
      }),
    });
    const d = await r.json();
    setWsbXml(d.wsb || '');
  };

  useEffect(() => {
    generateWsb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsbHostFolder, wsbReadOnly, wsbNetwork, wsbVgpu, wsbMem]);

  const signCommand = `signtool.exe sign /fd SHA256 /td SHA256 /tr "${timestampUrl}" /n "${certSubject}" "${artifactPath}"`;

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Windows SDK & x64/ARM64 readiness, app.manifest validator, MSIX/signing, DPI simulator & Sandbox" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'manifest' ? 'active' : ''}`}
          onClick={() => setTab('manifest')}
        >
          <FileCheck2 size={14} /> SDK, Arch (`x64`/`ARM64`) & Manifest Validator
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'packaging' ? 'active' : ''}`}
          onClick={() => setTab('packaging')}
        >
          <Box size={14} /> MSIX / MSI Packaging, Signing & Icons
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'dpi' ? 'active' : ''}`}
          onClick={() => setTab('dpi')}
        >
          <Monitor size={14} /> DPI, Multi-Monitor & Accessibility Checklist
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'sandbox' ? 'active' : ''}`}
          onClick={() => setTab('sandbox')}
        >
          <AppWindow size={14} /> Windows Sandbox (`.wsb`), Registry, Events & WSL
        </button>
      </div>

      {tab === 'manifest' && (
        <div className="stack-md">
          {/* Architecture & Windows SDK Target Cards */}
          <div className="grid-3">
            <div className="card stack-sm">
              <strong>Configured Target Architectures</strong>
              <div className="flex-row">
                {(['x64', 'ARM64', 'x86'] as const).map((arch) => {
                  const enabled = activeProject.targetArchitectures.includes(arch);
                  return (
                    <span
                      key={arch}
                      className={`badge ${enabled ? 'badge-success' : ''}`}
                    >
                      {arch}: {enabled ? 'Configured' : 'Not Targeted'}
                    </span>
                  );
                })}
              </div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Verify native `.dll` / Node addon / P/Invoke binaries exist for both x64 and ARM64 before publishing MSIX bundles.
              </div>
            </div>

            <div className="card stack-sm">
              <strong>Windows SDK Target</strong>
              <span className="badge badge-accent mono">
                {activeProject.windowsSdkTarget || '10.0.22621.0'} (Windows 11 22H2+)
              </span>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Supports Mica/Acrylic backdrop materials, rounded corners, and Snap Layouts.
              </div>
            </div>

            <div className="card stack-sm">
              <strong>Workspace Manifest File</strong>
              <span className="mono" style={{ fontSize: '0.82rem' }}>
                windows/DevBench.app.manifest
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openFileInEditor('windows/DevBench.app.manifest', 1)}
              >
                Edit in Code Workbench
              </button>
            </div>
          </div>

          <div className="grid-2">
            <div className="card stack-sm">
              <div className="flex-between">
                <h3 style={{ margin: 0 }}>Application Manifest (`app.manifest`) XML</h3>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => validateManifest(manifestXml)}
                >
                  Run Manifest Validator
                </button>
              </div>
              <textarea
                className="textarea mono"
                rows={14}
                value={manifestXml}
                onChange={(e) => setManifestXml(e.target.value)}
              />
            </div>

            <div className="card stack-sm">
              <h3 style={{ margin: 0 }}>Manifest Compatibility & Safety Audit</h3>
              {manifestChecks.map((chk) => (
                <div key={chk.id} className="card-elevated stack-sm">
                  <div className="flex-between">
                    <span className="flex-row">
                      {chk.status === 'pass' ? (
                        <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />
                      ) : (
                        <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />
                      )}
                      <strong>{chk.label}</strong>
                    </span>
                    <span
                      className={`badge ${
                        chk.status === 'pass' ? 'badge-success' : 'badge-warn'
                      }`}
                    >
                      {chk.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: '0.81rem' }}>
                    {chk.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'packaging' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>
              <Shield size={16} /> Authenticode Signing Guidance (Zero Private-Key Handling)
            </h3>
            <div
              className="card-elevated"
              style={{ borderColor: 'var(--accent)', fontSize: '0.82rem' }}
            >
              <strong>Security Guarantee:</strong> DevBench never reads, imports, or caches `.pfx` private keys or passwords. Signing commands reference Windows Certificate Store subjects, hardware USB tokens, or Azure Trusted Signing.
            </div>

            <label>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Certificate Subject Name (Windows Cert Store `Cert:\CurrentUser\My`)
              </div>
              <input
                className="input"
                value={certSubject}
                onChange={(e) => setCertSubject(e.target.value)}
              />
            </label>

            <label>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                RFC 3161 Timestamp Server URL
              </div>
              <input
                className="input mono"
                value={timestampUrl}
                onChange={(e) => setTimestampUrl(e.target.value)}
              />
            </label>

            <label>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Target EXE / MSI / MSIX Artifact
              </div>
              <input
                className="input mono"
                value={artifactPath}
                onChange={(e) => setArtifactPath(e.target.value)}
              />
            </label>

            <div className="card-elevated mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
              {signCommand}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => copySafeText('SignTool Command', signCommand)}
            >
              Copy SignTool Command
            </button>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Windows Installer Formats & `.ico` Resource Preview</h3>
            <div className="stack-sm">
              <div className="card-elevated">
                <strong>MSIX / AppInstaller</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Clean container uninstall, differential block-map updates, enterprise Intune & Microsoft Store ready.
                </div>
              </div>
              <div className="card-elevated">
                <strong>WiX v5 MSI / Inno Setup / NSIS / Velopack</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Unpackaged Win32 installers supporting per-user (`%LOCALAPPDATA%`) or machine-wide installation.
                </div>
              </div>
            </div>

            <strong>Multi-Resolution `.ico` Frame Readiness Preview</strong>
            <div className="flex-row" style={{ gap: 14, alignItems: 'flex-end', paddingTop: 6 }}>
              {[16, 24, 32, 48, 64].map((px) => (
                <div key={px} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: px,
                      height: px,
                      borderRadius: Math.max(4, Math.round(px * 0.2)),
                      background: 'var(--accent-strong)',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: Math.max(8, Math.round(px * 0.36)),
                    }}
                  >
                    DB
                  </div>
                  <div className="muted mono" style={{ fontSize: '0.72rem', marginTop: 4 }}>
                    {px}px
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'dpi' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Interactive Windows DPI & Scaling Simulator</h3>
            <div className="flex-row">
              {[100, 125, 150, 175, 200].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`btn btn-sm ${simScale === pct ? 'btn-primary' : ''}`}
                  onClick={() => setSimScale(pct)}
                >
                  {pct}% ({Math.round((96 * pct) / 100)} DPI)
                </button>
              ))}
            </div>

            <div
              className="card-elevated"
              style={{
                minHeight: 190,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  transform: `scale(${Math.min(simScale / 125, 1.35)})`,
                  transformOrigin: 'center',
                  border: '1px solid var(--accent)',
                  borderRadius: 8,
                  padding: '10px 16px',
                  background: 'var(--bg-surface)',
                }}
              >
                <div style={{ fontWeight: 700 }}>Sample Win32 / XAML Dialog @ {simScale}%</div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  Effective DPI: {Math.round((96 * simScale) / 100)} · Vector layout crisp
                </div>
                <div className="flex-row" style={{ marginTop: 8 }}>
                  <span className="badge badge-success">OK</span>
                  <span className="badge">Cancel</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>High-DPI, Accessibility & Multi-Monitor QA Checklist</h3>
            {DPI_CHECKLIST_ITEMS.map((item, idx) => (
              <label
                key={idx}
                className="card-elevated flex-row"
                style={{ cursor: 'pointer', fontSize: '0.84rem' }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(checkedDpi[idx])}
                  onChange={() => setCheckedDpi((p) => ({ ...p, [idx]: !p[idx] }))}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === 'sandbox' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Windows Sandbox (`.wsb`) Clean-Room Generator</h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Test installers in an isolated disposable Windows 11 VM with read-only host folder mapping.
            </div>
            <input
              className="input mono"
              value={wsbHostFolder}
              onChange={(e) => setWsbHostFolder(e.target.value)}
            />
            <div className="flex-row" style={{ flexWrap: 'wrap', gap: 14 }}>
              <label className="flex-row">
                <input
                  type="checkbox"
                  checked={wsbReadOnly}
                  onChange={(e) => setWsbReadOnly(e.target.checked)}
                />
                Read-Only Host Mount
              </label>
              <label className="flex-row">
                <input
                  type="checkbox"
                  checked={wsbNetwork}
                  onChange={(e) => setWsbNetwork(e.target.checked)}
                />
                Networking
              </label>
              <label className="flex-row">
                <input
                  type="checkbox"
                  checked={wsbVgpu}
                  onChange={(e) => setWsbVgpu(e.target.checked)}
                />
                vGPU Acceleration
              </label>
              <input
                className="input mono"
                type="number"
                style={{ width: 110 }}
                value={wsbMem}
                onChange={(e) => setWsbMem(Number(e.target.value))}
              />
            </div>

            <pre className="card-elevated mono" style={{ margin: 0, fontSize: '0.77rem', overflowX: 'auto' }}>
              {wsbXml}
            </pre>

            <div className="flex-row">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  await fetch('/api/files/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      path: 'windows/DevBenchSandbox.wsb',
                      content: wsbXml,
                      lineEndings: 'CRLF',
                    }),
                  });
                  notify('Saved windows/DevBenchSandbox.wsb');
                }}
              >
                Save to `windows/DevBenchSandbox.wsb`
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => copySafeText('DevBenchSandbox.wsb', wsbXml)}
              >
                Copy `.wsb`
              </button>
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>
              <Terminal size={16} /> Registry Dev Keys, Event Viewer, Services & WSL Shortcuts
            </h3>
            <div className="stack-sm">
              {DEV_REGISTRY_KEYS.map((rk) => (
                <div key={rk.key} className="card-elevated">
                  <div className="flex-between">
                    <strong>{rk.name}</strong>
                    <span className="badge mono">{rk.value}</span>
                  </div>
                  <div className="mono muted" style={{ fontSize: '0.73rem', marginTop: 2 }}>
                    {rk.key}
                  </div>
                  <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                    {rk.purpose}
                  </div>
                </div>
              ))}
            </div>

            <div className="card-elevated mono" style={{ fontSize: '0.77rem' }}>
              <div>Event Viewer (.NET / App Crash): Get-WinEvent -LogName Application -MaxEvents 25</div>
              <div>Named Pipes List: [System.IO.Directory]::GetFiles(&apos;\\.\pipe\&apos;)</div>
              <div>WSL Distros Check: wsl.exe --list --verbose</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WindowsModule;
