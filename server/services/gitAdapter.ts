import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveSafeWorkspacePath, WORKSPACE_ROOT } from './workspaceFs';

const execFileAsync = promisify(execFile);

async function runGit(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: WORKSPACE_ROOT,
    timeout: 5000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

export interface GitFileStatus {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  summary: 'Modified' | 'Added' | 'Deleted' | 'Untracked' | 'Renamed' | 'Conflicted';
}

export async function getGitOverview() {
  try {
    const [statusRaw, branchRaw, logRaw, remoteRaw, worktreeRaw, stashRaw] = await Promise.all([
      runGit(['status', '--porcelain=v1', '-b']),
      runGit(['branch', '-a', '--no-color']),
      runGit(['log', '-n', '25', '--pretty=format:%h|%an|%ar|%s']),
      runGit(['remote', '-v']).catch(() => ''),
      runGit(['worktree', 'list']).catch(() => ''),
      runGit(['stash', 'list']).catch(() => ''),
    ]);

    const lines = statusRaw.trim().split(/\r?\n/).filter(Boolean);
    const branchHeader = lines[0]?.startsWith('## ') ? lines[0].slice(3) : 'HEAD';
    const currentBranch = branchHeader.split('...')[0].trim();

    const files: GitFileStatus[] = lines.slice(1).map((line) => {
      const idx = line[0] || ' ';
      const wt = line[1] || ' ';
      const filePath = line.slice(3).trim();
      let summary: GitFileStatus['summary'] = 'Modified';
      if (idx === '?' || wt === '?') summary = 'Untracked';
      else if (idx === 'U' || wt === 'U') summary = 'Conflicted';
      else if (idx === 'A') summary = 'Added';
      else if (idx === 'D' || wt === 'D') summary = 'Deleted';
      else if (idx === 'R') summary = 'Renamed';
      return { path: filePath, indexStatus: idx, workTreeStatus: wt, summary };
    });

    const branches = branchRaw
      .split(/\r?\n/)
      .map((b) => b.replace(/^\*?\s+/, '').trim())
      .filter(Boolean);

    const commits = logRaw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((row) => {
        const [hash, author, relativeTime, ...msgParts] = row.split('|');
        return {
          hash,
          author,
          relativeTime,
          subject: msgParts.join('|'),
        };
      });

    const remotes = remoteRaw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((r) => {
        const [name, urlAndKind] = r.split(/\t/);
        return { name, detail: (urlAndKind || '').replace(/https:\/\/[^@]+@/, 'https://***@') };
      });

    const worktrees = worktreeRaw.split(/\r?\n/).filter(Boolean);
    const stashes = stashRaw.split(/\r?\n/).filter(Boolean);

    // Check hooks directory
    const hooksDir = path.join(WORKSPACE_ROOT, '.git', 'hooks');
    let hooks: { name: string; active: boolean }[] = [];
    if (fs.existsSync(hooksDir)) {
      hooks = fs
        .readdirSync(hooksDir)
        .map((h) => ({
          name: h,
          active: !h.endsWith('.sample'),
        }))
        .sort((a, b) => Number(b.active) - Number(a.active));
    }

    return {
      isRepo: true,
      currentBranch,
      branchHeader,
      files,
      branches,
      commits,
      remotes,
      worktrees,
      stashes,
      hooks,
    };
  } catch (err) {
    return {
      isRepo: false,
      error: (err as Error).message,
      currentBranch: 'none',
      branchHeader: '',
      files: [],
      branches: [],
      commits: [],
      remotes: [],
      worktrees: [],
      stashes: [],
      hooks: [],
    };
  }
}

export async function getGitFileDiff(filePath?: string): Promise<string> {
  try {
    if (!filePath) {
      const unstaged = await runGit(['diff', '--no-color']);
      const staged = await runGit(['diff', '--cached', '--no-color']);
      return [staged && `# Staged Changes\n${staged}`, unstaged && `# Working Tree Changes\n${unstaged}`]
        .filter(Boolean)
        .join('\n\n') || 'Working tree clean (or only untracked files present).';
    }
    const safeFull = resolveSafeWorkspacePath(filePath);
    const rel = path.relative(WORKSPACE_ROOT, safeFull);
    const diffOut = await runGit(['diff', 'HEAD', '--no-color', '--', rel]).catch(() => '');
    if (diffOut.trim()) return diffOut;

    // If untracked file, return pseudo-diff preview
    if (fs.existsSync(safeFull) && fs.statSync(safeFull).isFile()) {
      const content = fs.readFileSync(safeFull, 'utf8').slice(0, 16000);
      const plusLines = content
        .split(/\r?\n/)
        .map((l) => `+${l}`)
        .join('\n');
      return `diff --git a/${rel} b/${rel}\nnew untracked file\n--- /dev/null\n+++ b/${rel}\n${plusLines}`;
    }
    return 'No diff changes for selected path.';
  } catch (err) {
    return `Unable to read diff: ${(err as Error).message}`;
  }
}

export async function getGitBlame(filePath: string): Promise<{ line: number; commit: string; author: string; code: string }[]> {
  const safeFull = resolveSafeWorkspacePath(filePath);
  const rel = path.relative(WORKSPACE_ROOT, safeFull);
  try {
    const out = await runGit(['blame', '--line-porcelain', '--', rel]);
    const chunks = out.split(/\n(?=[0-9a-f]{40} )/);
    const rows: { line: number; commit: string; author: string; code: string }[] = [];
    let lineNo = 1;
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const lines = chunk.split('\n');
      const commit = lines[0]?.slice(0, 7) || '0000000';
      const authorLine = lines.find((l) => l.startsWith('author '));
      const codeLine = lines.find((l) => l.startsWith('\t'));
      rows.push({
        line: lineNo++,
        commit,
        author: authorLine ? authorLine.slice(7) : 'Working Tree',
        code: codeLine ? codeLine.slice(1) : '',
      });
      if (rows.length >= 250) break;
    }
    return rows;
  } catch {
    // Untracked file fallback
    if (fs.existsSync(safeFull)) {
      const lines = fs.readFileSync(safeFull, 'utf8').split(/\r?\n/).slice(0, 200);
      return lines.map((code, idx) => ({
        line: idx + 1,
        commit: 'uncommitted',
        author: 'Working Tree',
        code,
      }));
    }
    return [];
  }
}
