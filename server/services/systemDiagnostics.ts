import { execFile } from 'node:child_process';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';
import { promisify } from 'node:util';
import { redactSensitiveText } from '../../shared/redaction';

const execFileAsync = promisify(execFile);

export async function getSystemResourceSnapshot() {
  const cpus = os.cpus();
  const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
  const usedMemMb = totalMemMb - freeMemMb;

  let processes: { pid: string; name: string; mem: string; command: string }[] = [];
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 2500 });
      processes = stdout
        .trim()
        .split(/\r?\n/)
        .slice(0, 25)
        .map((row) => {
          const cols = row.split('","').map((c) => c.replace(/^"|"$/g, ''));
          return {
            name: cols[0] || 'proc',
            pid: cols[1] || '0',
            mem: cols[4] || '',
            command: cols[0] || '',
          };
        });
    } else {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid,comm,%mem,args', '--sort=-%mem'], {
        timeout: 2500,
      });
      processes = stdout
        .trim()
        .split(/\r?\n/)
        .slice(1, 25)
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          return {
            pid: parts[0] || '',
            name: parts[1] || '',
            mem: `${parts[2] || '0'}%`,
            command: redactSensitiveText(parts.slice(3).join(' ').slice(0, 90), true),
          };
        });
    }
  } catch {
    processes = [
      {
        pid: String(process.pid),
        name: 'node (devbench-api)',
        mem: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        command: 'server/index.ts',
      },
    ];
  }

  return {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'Processor',
    loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    memory: {
      totalMb: totalMemMb,
      usedMb: usedMemMb,
      freeMb: freeMemMb,
      percentUsed: Math.round((usedMemMb / Math.max(totalMemMb, 1)) * 100),
    },
    processes,
  };
}

export function checkLocalPort(port: number, host = '127.0.0.1'): Promise<{
  port: number;
  inUse: boolean;
  latencyMs: number;
}> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    socket.setTimeout(1200);

    socket.once('connect', () => {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      socket.destroy();
      resolve({ port, inUse: true, latencyMs });
    });

    const onClosedOrError = () => {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      socket.destroy();
      resolve({ port, inUse: false, latencyMs });
    };

    socket.once('timeout', onClosedOrError);
    socket.once('error', onClosedOrError);
    socket.connect(port, host);
  });
}

export async function lookupDnsHost(hostname: string) {
  const clean = hostname.trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const addresses = await dns.lookup(clean, { all: true });
  return { hostname: clean, addresses };
}

export function inspectTlsCertificate(host: string, port = 443): Promise<{
  subject: Record<string, unknown>;
  issuer: Record<string, unknown>;
  validFrom: string;
  validTo: string;
  protocol: string | null;
  fingerprint256: string;
}> {
  const cleanHost = host.trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  return new Promise((resolve, reject) => {
    const sock = tls.connect(
      { host: cleanHost, port, servername: cleanHost, rejectUnauthorized: false, timeout: 4000 },
      () => {
        const cert = sock.getPeerCertificate();
        const protocol = sock.getProtocol();
        sock.end();
        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error('No peer TLS certificate returned.'));
          return;
        }
        resolve({
          subject: (cert.subject as unknown as Record<string, unknown>) || {},
          issuer: (cert.issuer as unknown as Record<string, unknown>) || {},
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          protocol,
          fingerprint256: cert.fingerprint256,
        });
      }
    );
    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error('TLS handshake timed out.'));
    });
    sock.on('error', (err) => reject(err));
  });
}

export interface ManifestCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export function validateWindowsManifestXml(xml: string): ManifestCheckItem[] {
  const checks: ManifestCheckItem[] = [];

  const hasXmlRoot = /<assembly\b[^>]*manifestVersion=/i.test(xml) || /<Package\b/i.test(xml);
  checks.push({
    id: 'xml-root',
    label: 'Valid Win32 <assembly> or MSIX <Package> Root Element',
    status: hasXmlRoot ? 'pass' : 'fail',
    detail: hasXmlRoot
      ? 'Detected standard Windows manifest root structure.'
      : 'Missing <assembly manifestVersion="1.0"> or <Package> root tag.',
  });

  const hasPerMonitorV2 = /PerMonitorV2/i.test(xml);
  checks.push({
    id: 'dpi-pmv2',
    label: 'PerMonitorV2 High-DPI Awareness',
    status: hasPerMonitorV2 ? 'pass' : 'warn',
    detail: hasPerMonitorV2
      ? 'PerMonitorV2 configured — prevents blurry GDI bitmap scaling across mixed-DPI monitors.'
      : 'Missing <dpiAwareness>PerMonitorV2</dpiAwareness>. Multi-monitor scaling on 4K displays may blur.',
  });

  const execMatch = xml.match(/requestedExecutionLevel\s+level="([^"]+)"/i);
  const execLevel = execMatch?.[1] || 'missing';
  checks.push({
    id: 'uac-level',
    label: 'Least-Privilege UAC Execution Level',
    status: execLevel === 'asInvoker' ? 'pass' : execLevel === 'requireAdministrator' ? 'warn' : 'warn',
    detail:
      execLevel === 'asInvoker'
        ? 'Runs safely as standard user (`asInvoker`).'
        : execLevel === 'requireAdministrator'
          ? 'Requests full elevation (`requireAdministrator`) — confirm admin rights are strictly required.'
          : 'Explicit <requestedExecutionLevel level="asInvoker" /> recommended to disable legacy UAC virtualization.',
  });

  const hasWin1011Guid = /8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a/i.test(xml) || /TargetDeviceFamily/i.test(xml);
  checks.push({
    id: 'win11-compat',
    label: 'Windows 10 / 11 OS Compatibility Declaration',
    status: hasWin1011Guid ? 'pass' : 'warn',
    detail: hasWin1011Guid
      ? 'Windows 10/11 compatibility GUID verified (prevents RtlGetVersion lying as Windows 8).'
      : 'Missing Windows 10/11 compatibility GUID {8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}.',
  });

  const hasLongPath = /<longPathAware\b[^>]*>\s*true\s*<\/longPathAware>/i.test(xml);
  checks.push({
    id: 'long-path',
    label: 'MAX_PATH (>260 chars) Long Path Support',
    status: hasLongPath ? 'pass' : 'warn',
    detail: hasLongPath
      ? 'longPathAware enabled for deep nested repositories (e.g., node_modules / CMake builds).'
      : 'Consider adding <longPathAware>true</longPathAware> for paths exceeding 260 characters.',
  });

  return checks;
}

export function generateWindowsSandboxWsb(opts: {
  hostFolder: string;
  readOnly: boolean;
  networking: boolean;
  vgpu: boolean;
  memoryMb: number;
  startupCommand?: string;
}): string {
  const safeHost = opts.hostFolder.replace(/[<>&]/g, '');
  const cmd =
    opts.startupCommand?.trim() ||
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process explorer.exe C:\\Users\\WDAGUtilityAccount\\Desktop\\Workspace"';

  return [
    '<Configuration>',
    `  <VGpu>${opts.vgpu ? 'Enable' : 'Disable'}</VGpu>`,
    `  <Networking>${opts.networking ? 'Enable' : 'Disable'}</Networking>`,
    `  <MemoryInMB>${Math.max(2048, Math.min(32768, opts.memoryMb || 4096))}</MemoryInMB>`,
    '  <MappedFolders>',
    '    <MappedFolder>',
    `      <HostFolder>${safeHost}</HostFolder>`,
    '      <SandboxFolder>C:\\Users\\WDAGUtilityAccount\\Desktop\\Workspace</SandboxFolder>',
    `      <ReadOnly>${opts.readOnly ? 'true' : 'false'}</ReadOnly>`,
    '    </MappedFolder>',
    '  </MappedFolders>',
    '  <LogonCommand>',
    `    <Command>${cmd.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Command>`,
    '  </LogonCommand>',
    '</Configuration>',
  ].join('\r\n');
}
