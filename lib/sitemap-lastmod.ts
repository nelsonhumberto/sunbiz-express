import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import snapshot from '@/data/sitemap-lastmod.json';

/**
 * Per-page sitemap `lastModified` dates.
 *
 * Prefer the last git commit that touched the page file (not `new Date()`
 * at build time). A shallow clone only has HEAD, so files changed in that
 * commit use the HEAD commit date and everything else uses the committed
 * snapshot in `data/sitemap-lastmod.json`. If git is missing entirely, the
 * snapshot (then filesystem mtime) is the fallback.
 */

const ROOT = process.cwd();
const SNAPSHOT = snapshot as Record<string, string>;

let headDate: Date | null | undefined;
let headFiles: Set<string> | undefined;
let historyComplete: boolean | undefined;

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function repoHasFullHistory(): boolean {
  if (historyComplete !== undefined) return historyComplete;
  const shallow = git(['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') {
    historyComplete = false;
    return false;
  }
  if (shallow === 'false') {
    historyComplete = true;
    return true;
  }
  const count = Number(git(['rev-list', '--count', 'HEAD']));
  historyComplete = Number.isFinite(count) && count > 1;
  return historyComplete;
}

function headCommit(): { date: Date | null; files: Set<string> } {
  if (headDate !== undefined && headFiles) {
    return { date: headDate, files: headFiles };
  }
  const iso = git(['log', '-1', '--format=%cI']);
  const parsed = iso ? new Date(iso) : null;
  headDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const names = git(['show', '--name-only', '--pretty=format:', 'HEAD']) ?? '';
  headFiles = new Set(
    names
      .split('\n')
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter(Boolean),
  );
  return { date: headDate, files: headFiles };
}

function gitFileDate(relativePath: string): Date | null {
  const iso = git(['log', '-1', '--format=%cI', '--', relativePath]);
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function snapshotDate(relativePath: string): Date | null {
  const iso = SNAPSHOT[relativePath];
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Last content change for a repo-relative source file. */
export function contentLastModified(relativePath: string): Date {
  const rel = relativePath.replace(/\\/g, '/');

  if (repoHasFullHistory()) {
    const fromGit = gitFileDate(rel);
    if (fromGit) return fromGit;
  }

  const head = headCommit();
  if (head.date && head.files.has(rel)) return head.date;

  const snapped = snapshotDate(rel);
  if (snapped) return snapped;

  const abs = path.join(ROOT, rel);
  if (existsSync(abs)) return statSync(abs).mtime;

  return head.date ?? new Date('2026-05-27T00:00:00.000Z');
}
