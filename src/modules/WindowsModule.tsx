import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  Box,
  CheckCircle2,
  Download,
  FileCheck2,
  Monitor,
  RefreshCw,
  Shield,
  Terminal,
} from 'lucide-react';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { XamlLayoutPreviewer } from '../components/XamlLayoutPreviewer';
import { useWorkbench } from '../context/WorkbenchContext';

const DPI_CHECKLIST_ITEMS = [
  'Window handles WM_DPICHANGED when dragged from 100% 1080p monitor to 175% 4K monitor',
  'Icons & vector glyphs render sharp at 125%, 150%, 175%, and 200% scaling without GDI stretch',
  'All interactive controls expose UI Automation (UIA) Name & Role for Windows Narrator',
  'Keyboard Tab order & visible focus rings verified in Windows High-Contrast Aquatic/Night themes',
  'Child modal dialogs open centered on the same monitor as parent window',
  'Paths > 260 characters tested with longPathAware=true',
];

interface HostDiagnosticsPayload {
  hostMode: 'live-win32' | 'preview-simulation';
  registry: {
    name: string;
    keyPath: string;
    valueName: string;
    currentValue: string;
    recommended: string;
    healthy: boolean;
  }[];
  services: { name: string; displayName: string; status: string; startType: string }[];
  events: { timeCreated: string; level: string; provider: string; id: number; message: string }[];
  namedPipes: string[];
  wslDistros: string[];
}

export const WindowsModule: React.FC = () => {
  const { activeProject, copySafeText, openFileInEditor, requestConsent, notify } = useWorkbench();

  const [tab, setTab] = useState<'manifest' | 'packaging' | 'xaml' | 'dpi' | 'sandbox'>('manifest');
  const [manifestKind, setManifestKind] = useState<'win32' | 'appx'>('win32');
  const [manifestXml, setManifestXml] = useState('');
  const [appxXml, setAppxXml] = useState('');
  const [manifestChecks, setManifestChecks] = useState<
    { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[]
  >([]);

  // Signing command state (zero private key handling!)
  const [certSubject, setCertSubject] = useState('Contoso Desktop Engineering');
  const [timestampUrl, setTimestampUrl] = useState('http://timestamp.digicert.com');
  const [artifactPath, setArtifactPath] = useState('.\\release\\DevBenchSetup-x64.exe');

  // Binary .ico, .rc & MSIX Assets suite generator state
  const [icoColor, setIcoColor] = useState('#0284c7');
  const [rcProduct, setRcProduct] = useState('DevBench');
  const [rcCompany, setRcCompany] = useState('DevBench Contributors');
  const [rcVersion, setRcVersion] = useState('1.2.0.0');
  const [generatedRc, setGeneratedRc] = useState('');
  const [msixAssetsTargetDir, setMsixAssetsTargetDir] = useState('workspaces/AuroraWinClient/assets');
  const [msixTiles, setMsixTiles] = useState<
    { filename: string; label: string; width: number; height: number; bytes: number; dataUrl: string }[]
  >([]);

  // DPI simulator state
  const [simScale, setSimScale] = useState<number>(150);
  const [checkedDpi, setCheckedDpi] = useState<Record<number, boolean>>({ 0: true, 2: true });

  // Sandbox .wsb & Host Diagnostics state
  const [wsbHostFolder, setWsbHostFolder] = useState('C:\\Projects\\DevBench\\release');
  const [wsbReadOnly, setWsbReadOnly] = useState(true);
  const [wsbNetwork, setWsbNetwork] = useState(true);
  const [wsbVgpu, setWsbVgpu] = useState(true);
  const [wsbMem, setWsbMem] = useState(8192);
  const [wsbXml, setWsbXml] = useState('');
  const [hostDiag, setHostDiag] = useState<HostDiagnosticsPayload | null>(null);

  const validateManifest = async (xml: string, kind: 'win32' | 'appx') => {
    const endpoint =
      kind === 'win32' ? '/api/windows/validate-manifest' : '/api/windows/validate-appx';
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    const d = await r.json();
    setManifestChecks(d.checks || []);
  };

  const loadHostDiagnostics = () => {
    fetch('/api/windows/host-diagnostics')
      .then((r) => r.json())
      .then((d) => setHostDiag(d))
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/files/read?path=windows/DevBench.app.manifest')
      .then((r) => r.json())
      .then((d) => {
        if (d.content) {
          setManifestXml(d.content);
          validateManifest(d.content, 'win32');
        }
      })
      .catch(() => {});

    fetch('/api/files/read?path=windows/Package.appxmanifest')
      .then((r) => r.json())
      .then((d) => {
        if (d.content) setAppxXml(d.content);
      })
      .catch(() => {});

    loadHostDiagnostics();
  }, []);

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

  const buildAndDownloadIco = async () => {
    const r = await fetch('/api/windows/generate-ico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accentHex: icoColor,
        productName: rcProduct,
        companyName: rcCompany,
        fileDescription: `${rcProduct} Windows Desktop Application`,
        version: rcVersion,
      }),
    });
    const d = await r.json();
    setGeneratedRc(d.rcText || '');
    if (d.icoBase64) {
      const bin = Uint8Array.from(atob(d.icoBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: 'image/x-icon' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rcProduct.toLowerCase().replace(/\s+/g, '-')}.ico`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Generated & downloaded multi-frame .ico (${d.bytes} bytes) + .rc VERSIONINFO`);
    }
  };

  const previewMsixTiles = async (color = icoColor) => {
    const r = await fetch('/api/windows/msix-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accentHex: color }),
    });
    const d = await r.json();
    if (r.ok) setMsixTiles(d.assets || []);
  };

  const writeMsixTilesToDisk = () => {
    requestConsent(
      {
        id: `msix-tiles-${Date.now()}`,
        title: `Write 6 MSIX Visual Tile PNGs to ${msixAssetsTargetDir}`,
        actionType: 'file-mutate',
        description: `Writes Square44x44Logo.png, StoreLogo.png, Square150x150Logo.png, Wide310x150Logo.png, LargeTile310x310Logo.png, and SplashScreen.png into ${msixAssetsTargetDir}.`,
        commandPreview: `mkdir -p ${msixAssetsTargetDir} && write 6 RGBA PNG MSIX tiles`,
        impactScope: 'Local Project',
        reversibleNote: `Delete ${msixAssetsTargetDir}/*.png to remove generated MSIX assets.`,
      },
      async () => {
        const r = await fetch('/api/windows/msix-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accentHex: icoColor,
            writeToDir: msixAssetsTargetDir,
            consentConfirmed: true,
          }),
        });
        const d = await r.json();
        if (r.ok) {
          setMsixTiles(d.assets || []);
          notify(`Wrote 6 MSIX tile PNGs into ${msixAssetsTargetDir}`);
        } else {
          notify(`Failed: ${d.error}`);
        }
      }
    );
  };

  const signCommand = `signtool.exe sign /fd SHA256 /td SHA256 /tr "${timestampUrl}" /n "${certSubject}" "${artifactPath}"`;
  const activeXml = manifestKind === 'win32' ? manifestXml : appxXml;

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Win32 & MSIX manifests, XAML previewer, MSIX tile suite, WiX/Inno installers, .ico/.rc & live host diagnostics" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'manifest' ? 'active' : ''}`}
          onClick={() => setTab('manifest')}
        >
          <FileCheck2 size={14} /> Win32 & MSIX Manifest Validators
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'packaging' ? 'active' : ''}`}
          onClick={() => {
            setTab('packaging');
            if (msixTiles.length === 0) previewMsixTiles();
          }}
        >
          <Box size={14} /> MSIX Tile Suite, Signing & `.ico`/`.rc` Generator
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'xaml' ? 'active' : ''}`}
          onClick={() => setTab('xaml')}
        >
          <AppWindow size={14} /> Live WinUI 3 / WPF `.xaml` Previewer
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'dpi' ? 'active' : ''}`}
          onClick={() => setTab('dpi')}
        >
          <Monitor size={14} /> DPI, Multi-Monitor & Accessibility Simulator
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'sandbox' ? 'active' : ''}`}
          onClick={() => setTab('sandbox')}
        >
          <AppWindow size={14} /> Sandbox (`.wsb`), Live Registry, Services, Events & WSL
        </button>
      </div>

      {tab === 'manifest' && (
        <div className="stack-md">
          <div className="grid-3">
            <div className="card stack-sm">
              <strong>Configured Target Architectures</strong>
              <div className="flex-row">
                {(['x64', 'ARM64', 'x86'] as const).map((arch) => {
                  const enabled = activeProject.targetArchitectures.includes(arch);
                  return (
                    <span key={arch} className={`badge ${enabled ? 'badge-success' : ''}`}>
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
              <strong>Installer & Manifest Files in Repo</strong>
              <div className="flex-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => openFileInEditor('windows/DevBench.app.manifest', 1)}
                >
                  app.manifest
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => openFileInEditor('windows/Package.appxmanifest', 1)}
                >
                  Package.appxmanifest
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => openFileInEditor('.github/workflows/ci-and-windows-release.yml', 1)}
                >
                  Windows CI Workflow
                </button>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card stack-sm">
              <div className="flex-between">
                <div className="flex-row">
                  <button
                    type="button"
                    className={`btn btn-sm ${manifestKind === 'win32' ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setManifestKind('win32');
                      validateManifest(manifestXml, 'win32');
                    }}
                  >
                    Win32 `app.manifest`
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${manifestKind === 'appx' ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setManifestKind('appx');
                      validateManifest(appxXml, 'appx');
                    }}
                  >
                    MSIX `Package.appxmanifest`
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => validateManifest(activeXml, manifestKind)}
                >
                  Validate XML
                </button>
              </div>
              <textarea
                className="textarea mono"
                rows={15}
                value={activeXml}
                onChange={(e) => {
                  if (manifestKind === 'win32') setManifestXml(e.target.value);
                  else setAppxXml(e.target.value);
                }}
              />
            </div>

            <div className="card stack-sm">
              <h3 style={{ margin: 0 }}>
                {manifestKind === 'win32' ? 'Win32 Manifest' : 'MSIX AppxManifest'} Compatibility Audit
              </h3>
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
                    <span className={`badge ${chk.status === 'pass' ? 'badge-success' : 'badge-warn'}`}>
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
              <Shield size={16} /> Authenticode Signing & Installer Templates
            </h3>
            <div className="card-elevated" style={{ borderColor: 'var(--accent)', fontSize: '0.82rem' }}>
              <strong>Security Guarantee:</strong> DevBench never reads, imports, or caches `.pfx` private keys or passwords. Signing commands reference Windows Certificate Store subjects, USB HSM tokens, or Azure Trusted Signing.
            </div>

            <label>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Certificate Subject Name (`Cert:\CurrentUser\My`)
              </div>
              <input className="input" value={certSubject} onChange={(e) => setCertSubject(e.target.value)} />
            </label>

            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  RFC 3161 Timestamp Server
                </div>
                <input
                  className="input mono"
                  value={timestampUrl}
                  onChange={(e) => setTimestampUrl(e.target.value)}
                />
              </label>
              <label>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Target Artifact
                </div>
                <input
                  className="input mono"
                  value={artifactPath}
                  onChange={(e) => setArtifactPath(e.target.value)}
                />
              </label>
            </div>

            <div className="card-elevated mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
              {signCommand}
            </div>
            <div className="flex-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => copySafeText('SignTool Command', signCommand)}
              >
                Copy SignTool Command
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openFileInEditor('windows/installers/DevBench.wxs', 1)}
              >
                Open WiX v5 `.wxs`
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openFileInEditor('windows/installers/DevBench.iss', 1)}
              >
                Open Inno Setup `.iss`
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openFileInEditor('electron-builder.yml', 1)}
              >
                Open Electron-Builder YAML
              </button>
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Binary Multi-Resolution `.ico` & Win32 `.rc` Generator</h3>
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              Synthesizes a spec-compliant binary `.ico` containing `16×16`, `32×32`, `48×48`, and `256×256` RGBA frames plus a `VS_VERSION_INFO` `.rc` script.
            </div>

            <div className="grid-3" style={{ gridTemplateColumns: '80px 1fr 1fr' }}>
              <label>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  Accent
                </div>
                <input
                  type="color"
                  value={icoColor}
                  onChange={(e) => setIcoColor(e.target.value)}
                  style={{ width: '100%', height: 34, border: 'none', background: 'none' }}
                />
              </label>
              <label>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  Product Name
                </div>
                <input className="input" value={rcProduct} onChange={(e) => setRcProduct(e.target.value)} />
              </label>
              <label>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  4-Part Version
                </div>
                <input className="input mono" value={rcVersion} onChange={(e) => setRcVersion(e.target.value)} />
              </label>
            </div>

            <label>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Company / Publisher Name
              </div>
              <input className="input" value={rcCompany} onChange={(e) => setRcCompany(e.target.value)} />
            </label>

            <div className="flex-row" style={{ gap: 14, alignItems: 'flex-end' }}>
              {[16, 24, 32, 48, 64].map((px) => (
                <div key={px} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: px,
                      height: px,
                      borderRadius: Math.max(4, Math.round(px * 0.22)),
                      background: icoColor,
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: Math.max(8, Math.round(px * 0.35)),
                    }}
                  >
                    {rcProduct.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="muted mono" style={{ fontSize: '0.7rem', marginTop: 3 }}>
                    {px}px
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-row">
              <button type="button" className="btn btn-sm btn-primary" onClick={buildAndDownloadIco}>
                <Download size={13} /> Generate & Download `.ico` + `.rc`
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openFileInEditor('windows/DevBench.rc', 1)}
              >
                Inspect `windows/DevBench.rc`
              </button>
            </div>

            {generatedRc && (
              <pre
                className="card-elevated mono"
                style={{ margin: 0, maxHeight: 140, overflowY: 'auto', fontSize: '0.74rem' }}
              >
                {generatedRc}
              </pre>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />

            <div className="flex-between">
              <strong>MSIX `Assets/` Visual Tile Suite (6 RGBA PNGs)</strong>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => previewMsixTiles(icoColor)}
              >
                <RefreshCw size={12} /> Render Tiles
              </button>
            </div>
            <div className="flex-row">
              <input
                className="input mono"
                style={{ fontSize: '0.78rem' }}
                value={msixAssetsTargetDir}
                onChange={(e) => setMsixAssetsTargetDir(e.target.value)}
                placeholder="workspaces/<Project>/assets"
              />
              <button type="button" className="btn btn-sm btn-primary" onClick={writeMsixTilesToDisk}>
                Write Suite to Disk
              </button>
            </div>

            {msixTiles.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                }}
              >
                {msixTiles.map((tile) => (
                  <div
                    key={tile.filename}
                    className="card-elevated"
                    style={{ textAlign: 'center', padding: 8 }}
                  >
                    <img
                      src={tile.dataUrl}
                      alt={tile.filename}
                      style={{ maxWidth: '100%', maxHeight: 48, objectFit: 'contain' }}
                    />
                    <div className="mono" style={{ fontSize: '0.7rem', marginTop: 4 }}>
                      {tile.filename}
                    </div>
                    <div className="muted" style={{ fontSize: '0.68rem' }}>
                      {tile.width}×{tile.height} · {tile.bytes} B
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'xaml' && <XamlLayoutPreviewer />}

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
                onClick={() => openFileInEditor('scripts/bootstrap-windows.ps1', 1)}
              >
                Open `bootstrap-windows.ps1`
              </button>
            </div>
          </div>

          <div className="card stack-sm">
            <div className="flex-between">
              <h3 style={{ margin: 0 }}>
                <Terminal size={16} /> Registry, Services, Event Logs, Named Pipes & WSL
              </h3>
              <div className="flex-row">
                {hostDiag && (
                  <span className="badge badge-accent">{hostDiag.hostMode}</span>
                )}
                <button type="button" className="btn btn-sm" onClick={loadHostDiagnostics}>
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
            </div>

            <div className="stack-sm">
              {hostDiag?.registry.map((rk) => (
                <div key={rk.keyPath} className="card-elevated">
                  <div className="flex-between">
                    <strong>{rk.name}</strong>
                    <span className={`badge ${rk.healthy ? 'badge-success' : 'badge-warn'}`}>
                      {rk.currentValue}
                    </span>
                  </div>
                  <div className="mono muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                    {rk.keyPath} ({rk.valueName})
                  </div>
                </div>
              ))}
            </div>

            <div>
              <strong style={{ fontSize: '0.84rem' }}>Windows Developer Services</strong>
              <div className="flex-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                {hostDiag?.services.map((s) => (
                  <span key={s.name} className="badge">
                    {s.name}: {s.status}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <strong style={{ fontSize: '0.84rem' }}>Recent Application Event Log Entries</strong>
              {hostDiag?.events.map((ev, idx) => (
                <div key={idx} className="card-elevated" style={{ fontSize: '0.77rem', marginTop: 4 }}>
                  <span className={`badge ${ev.level === 'Warning' ? 'badge-warn' : 'badge-success'}`}>
                    {ev.level} #{ev.id}
                  </span>{' '}
                  <strong>{ev.provider}</strong>: {ev.message}
                </div>
              ))}
            </div>

            <div className="card-elevated mono" style={{ fontSize: '0.75rem' }}>
              <div>
                <strong>Named Pipes:</strong> {hostDiag?.namedPipes.join(', ')}
              </div>
              <div style={{ marginTop: 3 }}>
                <strong>WSL Distros:</strong> {hostDiag?.wslDistros.join(' · ')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WindowsModule;
