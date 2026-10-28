import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const skipDirs = new Set(['node_modules', '.next', 'tests', 'prisma', 'scripts', 'public', 'coverage']);

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name) || name.startsWith('.')) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) listFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

function resolveImport(fromFile: string, spec: string): string | null {
  let base = spec;
  if (spec.startsWith('@/')) base = join(root, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* missing candidate */
    }
  }
  return null;
}

function importSpecs(source: string): string[] {
  const specs: string[] = [];
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) specs.push(match[1] ?? '');
  return specs;
}

/**
 * Next inlines only a literal `process.env.NEXT_PUBLIC_*` read. A computed
 * `process.env[KEY]` stays undefined in the browser even when the env var is set.
 */
describe('client NEXT_PUBLIC env reads', () => {
  it('does not read NEXT_PUBLIC values through process.env[...]', () => {
    const files = listFiles(root);
    const source = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));
    const constants = new Map<string, string>();
    for (const text of source.values()) {
      const pattern = /(?:export )?const (\w+)\s*=\s*['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) constants.set(match[1] ?? '', match[2] ?? '');
    }

    const client = new Set<string>();
    const queue = [...source.entries()]
      .filter(([, text]) => /^\s*['"]use client['"]/.test(text))
      .map(([file]) => file);
    while (queue.length > 0) {
      const file = queue.pop();
      if (!file || client.has(file)) continue;
      const text = source.get(file);
      if (!text) continue;
      if (text.includes("from 'server-only'") || text.includes('from "server-only"')) continue;
      client.add(file);
      for (const spec of importSpecs(text)) {
        const next = resolveImport(file, spec);
        if (next && source.has(next)) queue.push(next);
      }
    }

    const offenders: string[] = [];
    for (const file of client) {
      const text = source.get(file) ?? '';
      const pattern = /process\.env\s*\[\s*([^\]]+?)\s*\]/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        const expr = (match[1] ?? '').trim();
        const literal = expr.match(/^['"]([^'"]+)['"]$/);
        const value = literal ? literal[1] : constants.get(expr);
        if (expr.includes('NEXT_PUBLIC_') || value?.startsWith('NEXT_PUBLIC_')) {
          offenders.push(`${file.replace(`${root}/`, '')}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
