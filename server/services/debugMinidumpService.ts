import fs from 'node:fs';
import inspector from 'node:inspector';
import os from 'node:os';
import v8 from 'node:v8';
import vm from 'node:vm';
import { redactSensitiveText } from '../../shared/redaction';
import { resolveSafeWorkspacePath } from './workspaceFs';

// Microsoft MINIDUMP_STREAM_TYPE constants
const STREAM_MODULE_LIST = 4;
const STREAM_EXCEPTION = 6;
const STREAM_SYSTEM_INFO = 7;

const STREAM_TYPE_NAMES: Record<number, string> = {
  0: 'UnusedStream',
  3: 'ThreadListStream',
  4: 'ModuleListStream',
  5: 'MemoryListStream',
  6: 'ExceptionStream',
  7: 'SystemInfoStream',
  8: 'ThreadExListStream',
  9: 'Memory64ListStream',
  15: 'MiscInfoStream',
  16: 'MemoryInfoListStream',
  21: 'SystemMemoryInfoStream',
};

const ARCH_NAMES: Record<number, string> = {
  0: 'x86',
  5: 'ARM',
  9: 'x64',
  12: 'ARM64',
};

const EXCEPTION_CODE_NAMES: Record<number, string> = {
  0xc0000005: 'STATUS_ACCESS_VIOLATION',
  0xc00000fd: 'STATUS_STACK_OVERFLOW',
  0xc0000409: 'STATUS_STACK_BUFFER_OVERRUN',
  0xc0000374: 'STATUS_HEAP_CORRUPTION',
  0x80000003: 'STATUS_BREAKPOINT',
  0xe0434352: 'CLR_MANAGED_EXCEPTION',
  0xe06d7363: 'CPP_EH_EXCEPTION',
};

export interface ParsedMinidumpReport {
  sourceName: string;
  valid: boolean;
  signature: string;
  versionHex: string;
  streamCount: number;
  timestampIso: string;
  fileSizeBytes: number;
  streams: { streamType: number; streamName: string; dataSize: number; rva: number }[];
  systemInfo?: {
    architecture: string;
    osBuild: string;
    numberOfProcessors: number;
  };
  exception?: {
    threadId: number;
    exceptionCodeHex: string;
    exceptionName: string;
    exceptionAddressHex: string;
  };
  modules: { name: string; baseAddressHex: string; sizeBytes: number }[];
  triageAdvice: string[];
  error?: string;
}

/**
 * Synthesizes a spec-compliant binary Windows Minidump (MDMP) buffer
 * containing MINIDUMP_HEADER + SystemInfoStream + ExceptionStream + ModuleListStream.
 */
export function synthesizeSampleWindowsMinidump(opts?: {
  arch?: 'x64' | 'ARM64' | 'x86';
  exceptionCode?: number;
  moduleNames?: string[];
}): Buffer {
  const archCode = opts?.arch === 'ARM64' ? 12 : opts?.arch === 'x86' ? 0 : 9;
  const excCode = (opts?.exceptionCode ?? 0xc0000005) >>> 0;
  const modules = opts?.moduleNames ?? [
    'C:\\Program Files\\ContosoTelemetryStudio\\ContosoTelemetryStudio.exe',
    'C:\\Windows\\System32\\ntdll.dll',
    'C:\\Windows\\System32\\kernel32.dll',
    'C:\\Program Files\\WindowsApps\\Microsoft.WindowsAppRuntime.1.6\\Microsoft.ui.xaml.dll',
  ];

  const streamCount = 3;
  const headerSize = 32;
  const dirOffset = headerSize;
  const dirSize = streamCount * 12;

  // 1. SystemInfoStream (56 bytes)
  const sysInfoOffset = dirOffset + dirSize;
  const sysInfoBuf = Buffer.alloc(56);
  sysInfoBuf.writeUInt16LE(archCode, 0);
  sysInfoBuf.writeUInt16LE(25, 2);
  sysInfoBuf.writeUInt8(Math.min(255, os.cpus().length || 8), 6);
  sysInfoBuf.writeUInt8(1, 7);
  sysInfoBuf.writeUInt32LE(10, 8);
  sysInfoBuf.writeUInt32LE(0, 12);
  sysInfoBuf.writeUInt32LE(26100, 16); // Windows 11 24H2

  // 2. ExceptionStream (168 bytes)
  const excOffset = sysInfoOffset + sysInfoBuf.length;
  const excBuf = Buffer.alloc(168);
  excBuf.writeUInt32LE(7428, 0);
  excBuf.writeUInt32LE(0, 4);
  excBuf.writeUInt32LE(excCode, 8);
  excBuf.writeUInt32LE(0, 12);
  excBuf.writeBigUInt64LE(0n, 16);
  excBuf.writeBigUInt64LE(0x00007ff6a142108cn, 24);

  // 3. ModuleListStream + UTF-16LE MINIDUMP_STRING names
  const modOffset = excOffset + excBuf.length;
  const modListSize = 4 + modules.length * 108;
  const modListBuf = Buffer.alloc(modListSize);
  modListBuf.writeUInt32LE(modules.length, 0);

  let stringCursor = modOffset + modListSize;
  const stringBuffers: Buffer[] = [];

  modules.forEach((modName, idx) => {
    const entryPos = 4 + idx * 108;
    modListBuf.writeBigUInt64LE(0x00007ff600000000n + BigInt(idx) * 0x100000n, entryPos);
    modListBuf.writeUInt32LE(0x00084000 + idx * 0x10000, entryPos + 8);
    modListBuf.writeUInt32LE(stringCursor, entryPos + 20);

    const utf16 = Buffer.from(modName, 'utf16le');
    const strBuf = Buffer.alloc(4 + utf16.length + 2);
    strBuf.writeUInt32LE(utf16.length, 0);
    utf16.copy(strBuf, 4);
    stringBuffers.push(strBuf);
    stringCursor += strBuf.length;
  });

  // Header (32 bytes)
  const header = Buffer.alloc(headerSize);
  header.write('MDMP', 0, 'ascii');
  header.writeUInt16LE(0xa793, 4);
  header.writeUInt16LE(0x0001, 6);
  header.writeUInt32LE(streamCount, 8);
  header.writeUInt32LE(dirOffset, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(Math.floor(Date.now() / 1000), 20);
  header.writeBigUInt64LE(0x00000002n, 24);

  const dir = Buffer.alloc(dirSize);
  dir.writeUInt32LE(STREAM_SYSTEM_INFO, 0);
  dir.writeUInt32LE(sysInfoBuf.length, 4);
  dir.writeUInt32LE(sysInfoOffset, 8);

  dir.writeUInt32LE(STREAM_EXCEPTION, 12);
  dir.writeUInt32LE(excBuf.length, 16);
  dir.writeUInt32LE(excOffset, 20);

  dir.writeUInt32LE(STREAM_MODULE_LIST, 24);
  dir.writeUInt32LE(modListBuf.length, 28);
  dir.writeUInt32LE(modOffset, 32);

  return Buffer.concat([header, dir, sysInfoBuf, excBuf, modListBuf, ...stringBuffers]);
}

export function parseWindowsMinidumpBuffer(
  buf: Buffer,
  sourceName = 'memory.dmp'
): ParsedMinidumpReport {
  if (buf.length < 32) {
    return {
      sourceName,
      valid: false,
      signature: buf.toString('ascii', 0, Math.min(4, buf.length)),
      versionHex: '0x0',
      streamCount: 0,
      timestampIso: new Date(0).toISOString(),
      fileSizeBytes: buf.length,
      streams: [],
      modules: [],
      triageAdvice: [],
      error: 'Invalid signature: file is smaller than 32-byte MINIDUMP_HEADER.',
    };
  }

  const sigAscii = buf.subarray(0, 4).toString('ascii');
  if (sigAscii !== 'MDMP') {
    return {
      sourceName,
      valid: false,
      signature: sigAscii,
      versionHex: '0x0',
      streamCount: 0,
      timestampIso: new Date(0).toISOString(),
      fileSizeBytes: buf.length,
      streams: [],
      modules: [],
      triageAdvice: [],
      error: `Invalid signature "${sigAscii}" (expected Windows Minidump magic "MDMP" / 0x504D444D).`,
    };
  }

  const version = buf.readUInt16LE(4);
  const streamCount = buf.readUInt32LE(8);
  const dirRva = buf.readUInt32LE(12);
  const timeStampSec = buf.readUInt32LE(20);

  const streams: ParsedMinidumpReport['streams'] = [];
  let systemInfo: ParsedMinidumpReport['systemInfo'] | undefined;
  let exception: ParsedMinidumpReport['exception'] | undefined;
  const modules: ParsedMinidumpReport['modules'] = [];

  const maxStreams = Math.min(streamCount, 64);
  for (let i = 0; i < maxStreams; i++) {
    const pos = dirRva + i * 12;
    if (pos + 12 > buf.length) break;
    const sType = buf.readUInt32LE(pos);
    const sSize = buf.readUInt32LE(pos + 4);
    const sRva = buf.readUInt32LE(pos + 8);
    if (sType === 0) continue;

    streams.push({
      streamType: sType,
      streamName: STREAM_TYPE_NAMES[sType] || `StreamType(${sType})`,
      dataSize: sSize,
      rva: sRva,
    });

    if (sType === STREAM_SYSTEM_INFO && sRva + 20 <= buf.length) {
      const archCode = buf.readUInt16LE(sRva);
      const numCpus = buf.readUInt8(sRva + 6) || 1;
      const major = buf.readUInt32LE(sRva + 8);
      const minor = buf.readUInt32LE(sRva + 12);
      const build = buf.readUInt32LE(sRva + 16);
      systemInfo = {
        architecture: ARCH_NAMES[archCode] || `Arch(${archCode})`,
        osBuild: `Windows ${major}.${minor} Build ${build}`,
        numberOfProcessors: numCpus,
      };
    } else if (sType === STREAM_EXCEPTION && sRva + 32 <= buf.length) {
      const threadId = buf.readUInt32LE(sRva);
      const excCode = buf.readUInt32LE(sRva + 8) >>> 0;
      const excAddr = buf.readBigUInt64LE(sRva + 24);
      const codeHex = `0x${excCode.toString(16).toUpperCase().padStart(8, '0')}`;
      exception = {
        threadId,
        exceptionCodeHex: codeHex,
        exceptionName: EXCEPTION_CODE_NAMES[excCode] || 'WIN32_SEH_EXCEPTION',
        exceptionAddressHex: `0x${excAddr.toString(16).toUpperCase().padStart(16, '0')}`,
      };
    } else if (sType === STREAM_MODULE_LIST && sRva + 4 <= buf.length) {
      const modCount = Math.min(buf.readUInt32LE(sRva), 64);
      for (let m = 0; m < modCount; m++) {
        const entryPos = sRva + 4 + m * 108;
        if (entryPos + 24 > buf.length) break;
        const baseAddr = buf.readBigUInt64LE(entryPos);
        const sizeBytes = buf.readUInt32LE(entryPos + 8);
        const nameRva = buf.readUInt32LE(entryPos + 20);
        if (nameRva + 4 <= buf.length) {
          const byteLen = Math.min(buf.readUInt32LE(nameRva), 512);
          if (nameRva + 4 + byteLen <= buf.length) {
            const modStr = buf.subarray(nameRva + 4, nameRva + 4 + byteLen).toString('utf16le');
            if (modStr) {
              modules.push({
                name: modStr,
                baseAddressHex: `0x${baseAddr.toString(16).toUpperCase().padStart(16, '0')}`,
                sizeBytes,
              });
            }
          }
        }
      }
    }
  }

  const triageAdvice: string[] = [];
  if (exception?.exceptionCodeHex === '0xC0000005') {
    triageAdvice.push(
      'Access Violation (0xC0000005): Check null pointer dereferences or P/Invoke / WinRT buffer lifetimes.'
    );
  } else if (exception?.exceptionCodeHex === '0xC0000409') {
    triageAdvice.push(
      'Stack Buffer Overrun / FastFail (0xC0000409): Inspect /GS stack cookies or unhandled WinUI FailureExceptions.'
    );
  } else if (exception?.exceptionCodeHex === '0xE0434352') {
    triageAdvice.push(
      '.NET Managed Exception (0xE0434352): Load SOS in WinDbg (`!pe` / `!clrstack`).'
    );
  }

  return {
    sourceName,
    valid: true,
    signature: sigAscii,
    versionHex: `0x${version.toString(16).toUpperCase()}`,
    streamCount: streams.length,
    timestampIso: new Date(timeStampSec * 1000).toISOString(),
    fileSizeBytes: buf.length,
    streams,
    systemInfo,
    exception,
    modules,
    triageAdvice,
  };
}

export function parseWorkspaceMinidump(workspacePath: string): ParsedMinidumpReport {
  const safePath = resolveSafeWorkspacePath(workspacePath);
  if (!fs.existsSync(safePath)) {
    throw new Error(`Minidump file "${workspacePath}" not found.`);
  }
  const buf = fs.readFileSync(safePath);
  return parseWindowsMinidumpBuffer(buf, workspacePath);
}

export async function captureLiveInspectorSnapshot(
  expressions: string[] = ['process.version', 'process.platform', 'process.arch']
) {
  const session = new inspector.Session();
  session.connect();

  const postAsync = <T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {}
  ) =>
    new Promise<T>((resolve, reject) => {
      session.post(method, params, (err, result) => {
        if (err) reject(err);
        else resolve((result || {}) as T);
      });
    });

  try {
    await postAsync('Runtime.enable');
    // Verify V8 Runtime.evaluate protocol connectivity on live isolate
    await postAsync('Runtime.evaluate', {
      expression: 'process.pid',
      returnByValue: true,
    });

    // Evaluate user watch expressions inside a read-only VM context with safe process telemetry
    const safeProcess = Object.freeze({
      pid: process.pid,
      version: process.version,
      versions: Object.freeze({ ...process.versions }),
      platform: process.platform,
      arch: process.arch,
      uptime: () => Math.round(process.uptime()),
      memoryUsage: () => process.memoryUsage(),
    });
    const evalContext = vm.createContext(
      Object.freeze({
        process: safeProcess,
        Math,
        Number,
        String,
        Boolean,
        JSON,
        Date,
      }),
      { codeGeneration: { strings: false, wasm: false } }
    );

    const watches: { expression: string; value: string; type: string; error?: string }[] = [];
    for (const rawExpr of expressions.slice(0, 12)) {
      const trimmed = rawExpr.trim();
      if (!trimmed) continue;
      try {
        const val = vm.runInContext(trimmed, evalContext, { timeout: 100 });
        watches.push({
          expression: redactSensitiveText(trimmed),
          value: redactSensitiveText(
            typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)
          ),
          type: typeof val,
        });
      } catch (err) {
        watches.push({
          expression: redactSensitiveText(trimmed),
          value: '',
          type: 'error',
          error: redactSensitiveText(err instanceof Error ? err.message : String(err)),
        });
      }
    }

    const heapStats = v8.getHeapStatistics();
    const heapSpaces = v8.getHeapSpaceStatistics().map((sp) => ({
      spaceName: sp.space_name,
      usedKB: Math.round(sp.space_used_size / 1024),
      availableKB: Math.round(sp.space_available_size / 1024),
    }));

    const stackLines = (new Error('DAPStackSnapshot').stack || '').split('\n').slice(1, 7);
    const callStack = stackLines.map((line) => {
      const cleaned = line.trim().replace(/^at\s+/, '');
      const m = cleaned.match(/^(.+?)\s+\((.+):(\d+):(\d+)\)$/) || cleaned.match(/^()(.+):(\d+):(\d+)$/);
      if (m) {
        return {
          functionName: m[1] || '<anonymous>',
          file: redactSensitiveText(m[2]),
          line: Number(m[3]) || 1,
          column: Number(m[4]) || 1,
        };
      }
      return { functionName: cleaned, file: 'node:internal', line: 1, column: 1 };
    });

    return {
      protocol: 'V8 Inspector Protocol (node:inspector) / DAP Bridge',
      nodePid: process.pid,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.round(process.uptime()),
      heapUsedMB: Math.round((heapStats.used_heap_size / 1048576) * 100) / 100,
      heapTotalMB: Math.round((heapStats.total_heap_size / 1048576) * 100) / 100,
      heapLimitMB: Math.round((heapStats.heap_size_limit / 1048576) * 100) / 100,
      watches,
      callStack,
      heapSpaces,
    };
  } finally {
    session.disconnect();
  }
}
