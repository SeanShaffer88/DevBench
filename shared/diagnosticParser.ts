export interface ParsedCompilerDiagnostic {
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  code?: string;
  message: string;
  rawLine: string;
}

function normalizePath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

/**
 * Parses compiler, linter, and runtime diagnostic lines from MSBuild/C#/VB/F#,
 * MSVC cl.exe, TypeScript tsc, Rust cargo/rustc, Python tracebacks, Go, Clang/GCC, and Swift.
 */
export function parseDiagnosticLine(rawLine: string): ParsedCompilerDiagnostic | null {
  const line = rawLine.trim();
  if (!line) return null;

  // Strip optional "[Job Name] " prefix added by unified output dock
  const cleaned = line.replace(/^\[[^\]]+\]\s*/, '');

  // 1. MSBuild / C# / VB / F# / MSVC / tsc-parenthesized:
  //    MainWindow.xaml.cs(42,15): error CS1002: ; expected
  //    src\main.cpp(18): warning C4100: unreferenced formal parameter
  const msbuildMatch = cleaned.match(
    /^([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)\((\d+)(?:,(\d+))?\)\s*:\s*(?:(fatal error|error|warning|info)\s*([A-Za-z0-9-]+)?\s*:\s*)?(.*)$/i
  );
  if (msbuildMatch) {
    const [, rawFile, ln, col, sevRaw, code, msg] = msbuildMatch;
    const sevLower = (sevRaw || 'error').toLowerCase();
    return {
      file: normalizePath(rawFile),
      line: Number(ln),
      column: col ? Number(col) : undefined,
      severity: sevLower.includes('warn') ? 'warning' : sevLower === 'info' ? 'info' : 'error',
      code: code || undefined,
      message: (msg || cleaned).trim(),
      rawLine,
    };
  }

  // 2. TypeScript / ESLint / Clang / GCC / Go / Swift colon format:
  //    src/App.tsx:28:9 - error TS2322: Type 'number' is not assignable...
  //    main.go:19:2: undefined: foo
  const colonDiagMatch = cleaned.match(
    /^([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+):(\d+)(?::(\d+))?\s*(?:-\s*|:)\s*(?:(error|warning|note|info)\s*([A-Za-z0-9-]+)?\s*:?\s*)?(.*)$/i
  );
  if (colonDiagMatch) {
    const [, rawFile, ln, col, sevRaw, code, msg] = colonDiagMatch;
    const sevLower = (sevRaw || 'error').toLowerCase();
    return {
      file: normalizePath(rawFile),
      line: Number(ln),
      column: col ? Number(col) : undefined,
      severity: sevLower.includes('warn')
        ? 'warning'
        : sevLower === 'note' || sevLower === 'info'
          ? 'info'
          : 'error',
      code: code || undefined,
      message: (msg || cleaned).trim(),
      rawLine,
    };
  }

  // 3. Rust cargo / rustc arrow pointer:
  //    --> src/main.rs:14:5
  const rustMatch = cleaned.match(/^-->\s+([A-Za-z0-9_./\\-]+\.rs):(\d+)(?::(\d+))?/);
  if (rustMatch) {
    const [, rawFile, ln, col] = rustMatch;
    return {
      file: normalizePath(rawFile),
      line: Number(ln),
      column: col ? Number(col) : undefined,
      severity: 'error',
      code: 'rustc',
      message: 'Rust compiler diagnostic location',
      rawLine,
    };
  }

  // 4. Python traceback frame:
  //    File "src/app/main.py", line 27, in main
  const pyMatch = cleaned.match(/^File\s+"([^"]+\.py)",\s+line\s+(\d+)(?:,\s+in\s+(.*))?$/);
  if (pyMatch) {
    const [, rawFile, ln, fnName] = pyMatch;
    return {
      file: normalizePath(rawFile),
      line: Number(ln),
      severity: 'error',
      code: 'Python',
      message: fnName ? `Traceback in ${fnName}` : 'Python traceback frame',
      rawLine,
    };
  }

  return null;
}

export function extractDiagnosticsFromLines(lines: string[]): ParsedCompilerDiagnostic[] {
  const out: ParsedCompilerDiagnostic[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const parsed = parseDiagnosticLine(line);
    if (!parsed) continue;
    const key = `${parsed.file}:${parsed.line}:${parsed.column || 0}:${parsed.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}
