import fs from 'node:fs';
import path from 'node:path';

export const WORKSPACE_ROOT = path.resolve(process.cwd());

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'release',
  'out',
  '.vite',
  '.cache',
]);

export function resolveSafeWorkspacePath(relativePath: string): string {
  const cleaned = relativePath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(WORKSPACE_ROOT, cleaned);
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error('Path escapes workspace root boundary.');
  }
  return resolved;
}

export interface WorkspaceFileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  ext: string;
  modifiedAt: string;
}

export function listWorkspaceFiles(maxFiles = 400): WorkspaceFileEntry[] {
  const entries: WorkspaceFileEntry[] = [];

  function walk(currentDir: string, depth: number) {
    if (depth > 6 || entries.length >= maxFiles) return;
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (entries.length >= maxFiles) break;
      if (item.isDirectory() && IGNORED_DIRS.has(item.name)) continue;

      const full = path.join(currentDir, item.name);
      const rel = path.relative(WORKSPACE_ROOT, full).split(path.sep).join('/');

      try {
        const stat = fs.statSync(full);
        entries.push({
          path: rel,
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          size: item.isDirectory() ? 0 : stat.size,
          ext: item.isDirectory() ? '' : path.extname(item.name).toLowerCase(),
          modifiedAt: stat.mtime.toISOString(),
        });
        if (item.isDirectory()) {
          walk(full, depth + 1);
        }
      } catch {
        // Ignore transient files
      }
    }
  }

  walk(WORKSPACE_ROOT, 0);
  return entries;
}

export interface FileReadPayload {
  path: string;
  size: number;
  isBinary: boolean;
  encoding: 'UTF-8' | 'UTF-8 BOM' | 'UTF-16 LE' | 'Binary';
  lineEndings: 'LF' | 'CRLF' | 'Mixed' | 'N/A';
  content: string;
  hexPreview: string;
  symbols: { name: string; kind: string; line: number }[];
}

function buildHexPreview(buf: Buffer, maxBytes = 512): string {
  const slice = buf.subarray(0, maxBytes);
  const lines: string[] = [];
  for (let offset = 0; offset < slice.length; offset += 16) {
    const chunk = slice.subarray(offset, offset + 16);
    const hexCols: string[] = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      if (i < chunk.length) {
        const byte = chunk[i];
        hexCols.push(byte.toString(16).padStart(2, '0').toUpperCase());
        ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
      } else {
        hexCols.push('  ');
      }
    }
    const leftHex = hexCols.slice(0, 8).join(' ');
    const rightHex = hexCols.slice(8).join(' ');
    lines.push(`${offset.toString(16).padStart(8, '0').toUpperCase()}  ${leftHex}  ${rightHex}  |${ascii}|`);
  }
  return lines.join('\n');
}

function extractSymbols(text: string): { name: string; kind: string; line: number }[] {
  const symbols: { name: string; kind: string; line: number }[] = [];
  const lines = text.split(/\r?\n/);
  const patterns: { kind: string; regex: RegExp }[] = [
    { kind: 'interface', regex: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_]+)/ },
    { kind: 'type', regex: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_]+)/ },
    { kind: 'class', regex: /^\s*(?:export\s+|public\s+|internal\s+)?class\s+([A-Za-z0-9_]+)/ },
    { kind: 'function', regex: /^\s*(?:export\s+)?(?:async\s+)?(?:function|def|fn|func)\s+([A-Za-z0-9_]+)/ },
    { kind: 'const', regex: /^\s*export\s+const\s+([A-Za-z0-9_]+)/ },
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      const m = lines[i].match(p.regex);
      if (m) {
        symbols.push({ name: m[1], kind: p.kind, line: i + 1 });
        break;
      }
    }
    if (symbols.length >= 80) break;
  }
  return symbols;
}

export function readWorkspaceFile(relativePath: string): FileReadPayload {
  const full = resolveSafeWorkspacePath(relativePath);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    throw new Error('Cannot read directory as file.');
  }

  const maxRead = Math.min(stat.size, 512 * 1024);
  const fd = fs.openSync(full, 'r');
  const buf = Buffer.alloc(maxRead);
  fs.readSync(fd, buf, 0, maxRead, 0);
  fs.closeSync(fd);

  const hexPreview = buildHexPreview(buf, 512);

  // Detect BOM / Binary
  let encoding: FileReadPayload['encoding'] = 'UTF-8';
  let textStart = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    encoding = 'UTF-8 BOM';
    textStart = 3;
  } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    encoding = 'UTF-16 LE';
    textStart = 2;
  } else {
    // Check null bytes in first 2KB
    const sample = buf.subarray(0, Math.min(buf.length, 2048));
    let nullCount = 0;
    for (const b of sample) {
      if (b === 0) nullCount++;
    }
    if (nullCount > 0) {
      return {
        path: relativePath,
        size: stat.size,
        isBinary: true,
        encoding: 'Binary',
        lineEndings: 'N/A',
        content: '',
        hexPreview,
        symbols: [],
      };
    }
  }

  const content =
    encoding === 'UTF-16 LE'
      ? buf.subarray(textStart).toString('utf16le')
      : buf.subarray(textStart).toString('utf8');

  const crlfMatches = (content.match(/\r\n/g) || []).length;
  const lfTotal = (content.match(/\n/g) || []).length;
  const bareLf = lfTotal - crlfMatches;

  let lineEndings: FileReadPayload['lineEndings'] = 'LF';
  if (crlfMatches > 0 && bareLf === 0) lineEndings = 'CRLF';
  else if (crlfMatches > 0 && bareLf > 0) lineEndings = 'Mixed';

  return {
    path: relativePath,
    size: stat.size,
    isBinary: false,
    encoding,
    lineEndings,
    content,
    hexPreview,
    symbols: extractSymbols(content),
  };
}

export function writeWorkspaceFile(
  relativePath: string,
  content: string,
  options?: { lineEndings?: 'LF' | 'CRLF'; withBom?: boolean }
): { savedPath: string; bytesWritten: number } {
  const full = resolveSafeWorkspacePath(relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });

  const normalizedLf = content.replace(/\r\n/g, '\n');
  const finalText = options?.lineEndings === 'CRLF' ? normalizedLf.replace(/\n/g, '\r\n') : normalizedLf;
  const bodyBuf = Buffer.from(finalText, 'utf8');
  const finalBuf = options?.withBom
    ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bodyBuf])
    : bodyBuf;

  fs.writeFileSync(full, finalBuf);
  return { savedPath: relativePath, bytesWritten: finalBuf.length };
}

export interface SearchHit {
  file: string;
  line: number;
  preview: string;
}

export function searchInWorkspace(query: string, isRegex = false, maxResults = 100): SearchHit[] {
  if (!query.trim()) return [];
  const files = listWorkspaceFiles(350).filter((f) => f.type === 'file' && f.size < 256 * 1024);
  const hits: SearchHit[] = [];
  const matcher = isRegex ? new RegExp(query, 'i') : null;
  const lowerQuery = query.toLowerCase();

  for (const file of files) {
    if (hits.length >= maxResults) break;
    try {
      const read = readWorkspaceFile(file.path);
      if (read.isBinary) continue;
      const lines = read.content.split(/\r?\n/);
      for (let idx = 0; idx < lines.length; idx++) {
        const lineText = lines[idx];
        const matched = matcher ? matcher.test(lineText) : lineText.toLowerCase().includes(lowerQuery);
        if (matched) {
          hits.push({
            file: file.path,
            line: idx + 1,
            preview: lineText.trim().slice(0, 180),
          });
          if (hits.length >= maxResults) break;
        }
      }
    } catch {
      // skip unreadable
    }
  }
  return hits;
}

export function analyzeDirectorySizes(): {
  name: string;
  category: 'Build / Dependency Cache' | 'Source Code' | 'Git Metadata' | 'Local Config';
  bytes: number;
  fileCount: number;
  reclaimable: boolean;
}[] {
  let topEntries: fs.Dirent[] = [];
  try {
    topEntries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  function sumDir(dirPath: string, budget = { count: 0 }): number {
    if (budget.count > 8000) return 0;
    let total = 0;
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const it of items) {
      budget.count++;
      if (budget.count > 8000) break;
      const fp = path.join(dirPath, it.name);
      try {
        if (it.isDirectory()) {
          total += sumDir(fp, budget);
        } else {
          total += fs.statSync(fp).size;
        }
      } catch {
        // ignore
      }
    }
    return total;
  }

  const results: ReturnType<typeof analyzeDirectorySizes> = [];
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const budget = { count: 0 };
    const bytes = sumDir(path.join(WORKSPACE_ROOT, entry.name), budget);
    const cacheNames = new Set(['node_modules', 'dist', 'build', 'release', 'out', 'target', 'bin', 'obj']);
    const isCache = cacheNames.has(entry.name);
    results.push({
      name: entry.name,
      category:
        entry.name === '.git'
          ? 'Git Metadata'
          : isCache
            ? 'Build / Dependency Cache'
            : entry.name.startsWith('.')
              ? 'Local Config'
              : 'Source Code',
      bytes,
      fileCount: budget.count,
      reclaimable: isCache,
    });
  }

  return results.sort((a, b) => b.bytes - a.bytes);
}

export function compareWorkspaceDirectories(leftRel: string, rightRel: string) {
  const leftRoot = resolveSafeWorkspacePath(leftRel);
  const rightRoot = resolveSafeWorkspacePath(rightRel);

  function mapFiles(root: string): Map<string, Buffer> {
    const map = new Map<string, Buffer>();
    function walk(curr: string, depth: number) {
      if (depth > 4 || map.size >= 150) return;
      let items: fs.Dirent[] = [];
      try {
        items = fs.readdirSync(curr, { withFileTypes: true });
      } catch {
        return;
      }
      for (const it of items) {
        if (IGNORED_DIRS.has(it.name)) continue;
        const full = path.join(curr, it.name);
        if (it.isDirectory()) {
          walk(full, depth + 1);
        } else {
          try {
            const stat = fs.statSync(full);
            if (stat.size <= 256 * 1024) {
              const rel = path.relative(root, full).split(path.sep).join('/');
              map.set(rel, fs.readFileSync(full));
            }
          } catch {
            // ignore
          }
        }
      }
    }
    walk(root, 0);
    return map;
  }

  const leftMap = mapFiles(leftRoot);
  const rightMap = mapFiles(rightRoot);
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);

  const entries: {
    relativePath: string;
    status: 'only-left' | 'only-right' | 'identical' | 'different';
    leftBytes: number;
    rightBytes: number;
  }[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    if (l && !r) {
      entries.push({ relativePath: key, status: 'only-left', leftBytes: l.length, rightBytes: 0 });
    } else if (!l && r) {
      entries.push({ relativePath: key, status: 'only-right', leftBytes: 0, rightBytes: r.length });
    } else if (l && r) {
      entries.push({
        relativePath: key,
        status: l.equals(r) ? 'identical' : 'different',
        leftBytes: l.length,
        rightBytes: r.length,
      });
    }
  }

  return { leftDir: leftRel, rightDir: rightRel, entries };
}

export interface FileReplaceDiffHunk {
  line: number;
  before: string;
  after: string;
}

export interface FileReplacePreviewEntry {
  file: string;
  replacements: number;
  hunks: FileReplaceDiffHunk[];
}

export interface WorkspaceReplacePreview {
  search: string;
  replace: string;
  includePrefix: string;
  totalFilesMatched: number;
  totalReplacements: number;
  files: FileReplacePreviewEntry[];
}

function buildReplaceRegExp(search: string, isRegex: boolean, caseSensitive: boolean): RegExp {
  const escaped = isRegex ? search : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, caseSensitive ? 'g' : 'gi');
}

export function previewWorkspaceReplace(opts: {
  search: string;
  replace: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  includePrefix?: string;
  maxFiles?: number;
}): WorkspaceReplacePreview {
  const search = opts.search || '';
  const replace = opts.replace ?? '';
  const includePrefix = (opts.includePrefix || '').trim().replace(/^[/\\]+/, '');
  if (!search) {
    return {
      search,
      replace,
      includePrefix,
      totalFilesMatched: 0,
      totalReplacements: 0,
      files: [],
    };
  }

  const regex = buildReplaceRegExp(search, Boolean(opts.isRegex), Boolean(opts.caseSensitive));
  const candidates = listWorkspaceFiles(500).filter(
    (f) =>
      f.type === 'file' &&
      f.size < 256 * 1024 &&
      !f.path.startsWith('.devbench/') &&
      (!includePrefix || f.path.startsWith(includePrefix))
  );

  const files: FileReplacePreviewEntry[] = [];
  let totalReplacements = 0;

  for (const cand of candidates) {
    if (files.length >= (opts.maxFiles ?? 40)) break;
    try {
      const read = readWorkspaceFile(cand.path);
      if (read.isBinary) continue;
      const lines = read.content.split(/\r?\n/);
      const hunks: FileReplaceDiffHunk[] = [];
      let fileCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const before = lines[i];
        regex.lastIndex = 0;
        const matches = before.match(regex);
        if (!matches || matches.length === 0) continue;
        fileCount += matches.length;
        regex.lastIndex = 0;
        const after = before.replace(regex, replace);
        if (hunks.length < 12) {
          hunks.push({
            line: i + 1,
            before: before.slice(0, 200),
            after: after.slice(0, 200),
          });
        }
      }

      if (fileCount > 0) {
        totalReplacements += fileCount;
        files.push({
          file: cand.path,
          replacements: fileCount,
          hunks,
        });
      }
    } catch {
      // ignore unreadable
    }
  }

  return {
    search,
    replace,
    includePrefix,
    totalFilesMatched: files.length,
    totalReplacements,
    files,
  };
}

export function executeWorkspaceReplace(opts: {
  search: string;
  replace: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  includePrefix?: string;
}): {
  undoId: string;
  backupPath: string;
  filesModified: string[];
  totalReplacements: number;
} {
  const preview = previewWorkspaceReplace(opts);
  if (preview.totalFilesMatched === 0) {
    throw new Error('No matching text found in target files.');
  }

  const regex = buildReplaceRegExp(
    opts.search,
    Boolean(opts.isRegex),
    Boolean(opts.caseSensitive)
  );
  const undoId = `replace-undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const backupRel = `.devbench/backups/${undoId}.json`;
  const backupAbs = resolveSafeWorkspacePath(backupRel);
  fs.mkdirSync(path.dirname(backupAbs), { recursive: true });

  const originals: { file: string; base64: string }[] = [];
  const filesModified: string[] = [];

  for (const entry of preview.files) {
    const abs = resolveSafeWorkspacePath(entry.file);
    const rawBuf = fs.readFileSync(abs);
    originals.push({ file: entry.file, base64: rawBuf.toString('base64') });

    const read = readWorkspaceFile(entry.file);
    regex.lastIndex = 0;
    const updatedContent = read.content.replace(regex, opts.replace);
    writeWorkspaceFile(entry.file, updatedContent, {
      lineEndings: read.lineEndings === 'CRLF' ? 'CRLF' : 'LF',
      withBom: read.encoding === 'UTF-8 BOM',
    });
    filesModified.push(entry.file);
  }

  fs.writeFileSync(
    backupAbs,
    JSON.stringify(
      {
        undoId,
        createdAt: new Date().toISOString(),
        search: opts.search,
        replace: opts.replace,
        restored: false,
        originals,
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    undoId,
    backupPath: backupRel,
    filesModified,
    totalReplacements: preview.totalReplacements,
  };
}

export function undoWorkspaceReplace(undoId: string): {
  undoId: string;
  restoredFiles: string[];
} {
  if (!/^replace-undo-[0-9a-z-]+$/i.test(undoId)) {
    throw new Error('Invalid undo snapshot identifier.');
  }
  const backupRel = `.devbench/backups/${undoId}.json`;
  const backupAbs = resolveSafeWorkspacePath(backupRel);
  if (!fs.existsSync(backupAbs)) {
    throw new Error(`Undo snapshot "${undoId}" not found.`);
  }
  const snapshot = JSON.parse(fs.readFileSync(backupAbs, 'utf8')) as {
    undoId: string;
    restored?: boolean;
    originals: { file: string; base64: string }[];
  };
  const restoredFiles: string[] = [];
  for (const item of snapshot.originals) {
    const abs = resolveSafeWorkspacePath(item.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(item.base64, 'base64'));
    restoredFiles.push(item.file);
  }
  snapshot.restored = true;
  fs.writeFileSync(backupAbs, JSON.stringify(snapshot, null, 2), 'utf8');
  return { undoId, restoredFiles };
}

