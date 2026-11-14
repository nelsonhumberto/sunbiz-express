import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOCIAL_IMAGE, socialOpenGraph } from '@/lib/locale-seo';

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe('public openGraph images', () => {
  it('always attaches the 1200x630 share image', () => {
    expect(socialOpenGraph({ title: 'Home' }).images).toEqual([SOCIAL_IMAGE]);
    expect(SOCIAL_IMAGE).toMatchObject({
      url: '/opengraph-image',
      width: 1200,
      height: 630,
    });
    const card = readFileSync('app/opengraph-image.tsx', 'utf8');
    expect(card).toContain('width: 1200, height: 630');
  });

  it('fails when a page sets openGraph without the shared helper', () => {
    const roots = ['app', 'components'].map((dir) => path.join(process.cwd(), dir));
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const source = readFileSync(file, 'utf8');
        if (!source.includes('openGraph:')) continue;
        const bare = source.replace(/openGraph:\s*socialOpenGraph\(/g, '');
        if (bare.includes('openGraph:')) offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
