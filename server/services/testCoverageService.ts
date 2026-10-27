import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { redactSensitiveText } from '../../shared/redaction';
import { resolveSafeWorkspacePath, WORKSPACE_ROOT } from './workspaceFs';

const execFileAsync = promisify(execFile);

export interface LiveTestAssertionResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  failureMessage?: string;
}

export interface LiveTestSuiteResult {
  file: string;
  status: 'passed' | 'failed';
  durationMs: number;
  passedCount: number;
  failedCount: number;
  assertions: LiveTestAssertionResult[];
}

export interface LiveVitestRunSummary {
  ok: boolean;
  totalSuites: number;
  passedSuites: number;
  failedSuites: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  suites: LiveTestSuiteResult[];
}

export async function runLiveVitestJson(opts: {
  filter?: string;
  consentConfirmed: boolean;
}): Promise<LiveVitestRunSummary> {
  if (!opts.consentConfirmed) {
    throw new Error('Explicit user consent is required before executing live test suites.');
  }

  const started = Date.now();
  const vitestPkg = path.join(WORKSPACE_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  if (!fs.existsSync(vitestPkg)) {
    throw new Error('Vitest runner binary not found in node_modules.');
  }

  const args = [vitestPkg, 'run', '--reporter=json'];
  const cleanFilter = (opts.filter || '').trim();
  if (cleanFilter) {
    if (!/^[A-Za-z0-9_./-]+$/.test(cleanFilter)) {
      throw new Error('Test filter may only contain alphanumeric, dot, slash, dash, or underscore characters.');
    }
    args.push(cleanFilter);
  }

  let rawStdout = '';
  try {
    const { stdout } = await execFileAsync(process.execPath, args, {
      cwd: WORKSPACE_ROOT,
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
    });
    rawStdout = stdout;
  } catch (err) {
    const anyErr = err as { stdout?: string; message?: string };
    if (anyErr.stdout) {
      rawStdout = anyErr.stdout;
    } else {
      throw new Error(`Test execution failed: ${redactSensitiveText(anyErr.message || String(err))}`);
    }
  }

  const jsonStart = rawStdout.indexOf('{');
  const jsonEnd = rawStdout.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Vitest did not emit parseable JSON test results.');
  }

  const parsed = JSON.parse(rawStdout.slice(jsonStart, jsonEnd + 1)) as {
    success?: boolean;
    numTotalTestSuites?: number;
    numPassedTestSuites?: number;
    numFailedTestSuites?: number;
    numTotalTests?: number;
    numPassedTests?: number;
    numFailedTests?: number;
    testResults?: {
      name?: string;
      status?: string;
      startTime?: number;
      endTime?: number;
      assertionResults?: {
        fullName?: string;
        title?: string;
        status?: string;
        duration?: number;
        failureMessages?: string[];
      }[];
    }[];
  };

  const suites: LiveTestSuiteResult[] = (parsed.testResults || []).map((tr) => {
    const relFile = tr.name
      ? path.relative(WORKSPACE_ROOT, tr.name).split(path.sep).join('/')
      : 'unknown.test.ts';
    const assertions: LiveTestAssertionResult[] = (tr.assertionResults || []).map((ar) => ({
      title: ar.fullName || ar.title || 'test',
      status:
        ar.status === 'passed' ? 'passed' : ar.status === 'failed' ? 'failed' : 'skipped',
      durationMs: Math.round(ar.duration || 0),
      failureMessage:
        ar.failureMessages && ar.failureMessages.length > 0
          ? redactSensitiveText(ar.failureMessages.join('\n').slice(0, 400))
          : undefined,
    }));
    const passedCount = assertions.filter((a) => a.status === 'passed').length;
    const failedCount = assertions.filter((a) => a.status === 'failed').length;
    return {
      file: relFile,
      status: failedCount > 0 || tr.status === 'failed' ? 'failed' : 'passed',
      durationMs: Math.max(1, Math.round((tr.endTime || 0) - (tr.startTime || 0))),
      passedCount,
      failedCount,
      assertions,
    };
  });

  const totalTests = suites.reduce((acc, s) => acc + s.assertions.length, 0);
  const passedTests = suites.reduce((acc, s) => acc + s.passedCount, 0);
  const failedTests = suites.reduce((acc, s) => acc + s.failedCount, 0);

  return {
    ok: failedTests === 0 && Boolean(parsed.success ?? true),
    totalSuites: suites.length,
    passedSuites: suites.filter((s) => s.status === 'passed').length,
    failedSuites: suites.filter((s) => s.status === 'failed').length,
    totalTests,
    passedTests,
    failedTests,
    durationMs: Date.now() - started,
    suites,
  };
}

export interface FileCoverageEntry {
  file: string;
  linesFound: number;
  linesHit: number;
  linePct: number;
  branchesFound: number;
  branchesHit: number;
  branchPct: number;
}

export interface CoverageReportSummary {
  format: 'lcov' | 'cobertura-xml';
  totalFiles: number;
  linesFound: number;
  linesHit: number;
  overallLinePct: number;
  branchesFound: number;
  branchesHit: number;
  overallBranchPct: number;
  files: FileCoverageEntry[];
}

export function parseCoverageReport(opts: {
  content?: string;
  path?: string;
}): CoverageReportSummary {
  let raw = opts.content || '';
  if (!raw && opts.path) {
    const abs = resolveSafeWorkspacePath(opts.path);
    if (!fs.existsSync(abs)) {
      throw new Error(`Coverage file "${opts.path}" not found.`);
    }
    raw = fs.readFileSync(abs, 'utf8');
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Coverage report content is empty.');
  }

  // Cobertura XML detection
  if (trimmed.startsWith('<?xml') || /<coverage\b/i.test(trimmed)) {
    const filesMap = new Map<string, FileCoverageEntry>();
    for (const clsMatch of trimmed.matchAll(
      /<class\b([^>]*)>([\s\S]*?)<\/class>/gi
    )) {
      const attrs = clsMatch[1];
      const body = clsMatch[2];
      const filename = attrs.match(/filename="([^"]+)"/i)?.[1] || 'unknown';
      const lineTags = Array.from(body.matchAll(/<line\b([^>]*)\/?>/gi));
      let lf = lineTags.length;
      let lh = 0;
      let bf = 0;
      let bh = 0;
      for (const lt of lineTags) {
        const hits = Number(lt[1].match(/hits="(\d+)"/i)?.[1] || 0);
        if (hits > 0) lh++;
        const condCov = lt[1].match(/condition-coverage="\d+%\s*\((\d+)\/(\d+)\)"/i);
        if (condCov) {
          bh += Number(condCov[1]);
          bf += Number(condCov[2]);
        }
      }
      if (lf === 0) {
        const lineRate = Number(attrs.match(/line-rate="([0-9.]+)"/i)?.[1] ?? 0);
        lf = 100;
        lh = Math.round(lineRate * 100);
      }
      const existing = filesMap.get(filename);
      const mergedLf = (existing?.linesFound || 0) + lf;
      const mergedLh = (existing?.linesHit || 0) + lh;
      const mergedBf = (existing?.branchesFound || 0) + bf;
      const mergedBh = (existing?.branchesHit || 0) + bh;
      filesMap.set(filename, {
        file: filename,
        linesFound: mergedLf,
        linesHit: mergedLh,
        linePct: mergedLf > 0 ? Math.round((mergedLh / mergedLf) * 1000) / 10 : 100,
        branchesFound: mergedBf,
        branchesHit: mergedBh,
        branchPct: mergedBf > 0 ? Math.round((mergedBh / mergedBf) * 1000) / 10 : 100,
      });
    }
    return summarizeCoverageEntries('cobertura-xml', Array.from(filesMap.values()));
  }

  // LCOV format (TN:, SF:, LF:, LH:, BRF:, BRH:, end_of_record)
  const files: FileCoverageEntry[] = [];
  for (const record of trimmed.split(/end_of_record/i)) {
    const sf = record.match(/^SF:(.+)$/m)?.[1]?.trim();
    if (!sf) continue;
    let lf = Number(record.match(/^LF:(\d+)$/m)?.[1] ?? 0);
    let lh = Number(record.match(/^LH:(\d+)$/m)?.[1] ?? 0);
    if (lf === 0) {
      const daLines = Array.from(record.matchAll(/^DA:(\d+),(\d+)/gm));
      lf = daLines.length;
      lh = daLines.filter((m) => Number(m[2]) > 0).length;
    }
    const bf = Number(record.match(/^BRF:(\d+)$/m)?.[1] ?? 0);
    const bh = Number(record.match(/^BRH:(\d+)$/m)?.[1] ?? 0);
    files.push({
      file: sf.replace(/\\/g, '/'),
      linesFound: lf,
      linesHit: lh,
      linePct: lf > 0 ? Math.round((lh / lf) * 1000) / 10 : 100,
      branchesFound: bf,
      branchesHit: bh,
      branchPct: bf > 0 ? Math.round((bh / bf) * 1000) / 10 : 100,
    });
  }

  if (files.length === 0) {
    throw new Error('Unrecognized coverage format (expected LCOV SF:/end_of_record or Cobertura <coverage> XML).');
  }

  return summarizeCoverageEntries('lcov', files);
}

function summarizeCoverageEntries(
  format: 'lcov' | 'cobertura-xml',
  files: FileCoverageEntry[]
): CoverageReportSummary {
  const linesFound = files.reduce((a, f) => a + f.linesFound, 0);
  const linesHit = files.reduce((a, f) => a + f.linesHit, 0);
  const branchesFound = files.reduce((a, f) => a + f.branchesFound, 0);
  const branchesHit = files.reduce((a, f) => a + f.branchesHit, 0);

  return {
    format,
    totalFiles: files.length,
    linesFound,
    linesHit,
    overallLinePct: linesFound > 0 ? Math.round((linesHit / linesFound) * 1000) / 10 : 100,
    branchesFound,
    branchesHit,
    overallBranchPct:
      branchesFound > 0 ? Math.round((branchesHit / branchesFound) * 1000) / 10 : 100,
    files: files.sort((a, b) => a.linePct - b.linePct),
  };
}
