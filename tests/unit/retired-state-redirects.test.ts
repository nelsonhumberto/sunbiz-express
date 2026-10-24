import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RETIRED_STATE_REDIRECTS,
  retiredStateDestination,
} from '@/lib/retired-state-redirects';

const FLORIDA_STATE = '/states/florida';
const FLORIDA_GUIDE = '/guides/how-to-form-an-llc-in-florida';

function ruleMatches(pathname: string, source: string): boolean {
  if (source.includes(':path*')) {
    const base = source.replace('/:path*', '');
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  const slug = source.match(/^(.*)\/:slug\(\[\^\/\]\*(delaware|wyoming)\[\^\/\]\*\)$/);
  if (slug) {
    const prefix = slug[1] ?? '';
    const word = slug[2] ?? '';
    if (!pathname.startsWith(`${prefix}/`)) return false;
    const rest = pathname.slice(prefix.length + 1);
    return rest.length > 0 && !rest.includes('/') && rest.includes(word);
  }
  return pathname === source;
}

function destinationFromRules(pathname: string): string | null {
  const rule = RETIRED_STATE_REDIRECTS.find((entry) => ruleMatches(pathname, entry.source));
  return rule?.destination ?? null;
}

describe('retired Delaware and Wyoming redirects', () => {
  it('sends state pages and short URLs to the Florida state page', () => {
    const cases: Array<[string, string]> = [
      ['/delaware', FLORIDA_STATE],
      ['/delaware/llc', FLORIDA_STATE],
      ['/wyoming', FLORIDA_STATE],
      ['/wyoming/annual-report', FLORIDA_STATE],
      ['/states/delaware', FLORIDA_STATE],
      ['/states/wyoming', FLORIDA_STATE],
      ['/states/delaware/extra', FLORIDA_STATE],
      ['/Delaware', FLORIDA_STATE],
      ['/es/delaware', `/es${FLORIDA_STATE}`],
      ['/es/wyoming/guide', `/es${FLORIDA_STATE}`],
      ['/es/states/delaware', `/es${FLORIDA_STATE}`],
      ['/es/states/wyoming', `/es${FLORIDA_STATE}`],
      ['/es/states/Wyoming/', `/es${FLORIDA_STATE}`],
    ];
    for (const [path, destination] of cases) {
      expect(retiredStateDestination(path), path).toBe(destination);
    }
  });

  it('sends Delaware and Wyoming guides to the Florida LLC guide', () => {
    expect(retiredStateDestination('/guides/wyoming-llc-vs-delaware-corp')).toBe(FLORIDA_GUIDE);
    expect(retiredStateDestination('/guides/delaware-llc')).toBe(FLORIDA_GUIDE);
    expect(retiredStateDestination('/guides/how-to-form-a-wyoming-llc')).toBe(FLORIDA_GUIDE);
    expect(retiredStateDestination('/es/guides/wyoming-llc-vs-delaware-corp')).toBe(
      `/es${FLORIDA_GUIDE}`,
    );
    expect(retiredStateDestination('/es/guides/foo-delaware-bar')).toBe(`/es${FLORIDA_GUIDE}`);
  });

  it('leaves Florida pages and order-flow paths alone', () => {
    for (const path of [
      '/',
      '/es',
      '/start',
      '/pricing',
      '/states/florida',
      '/es/states/florida',
      '/guides/how-to-form-an-llc-in-florida',
      '/es/guides/florida-llc-operating-agreement',
      '/es/guides/florida-annual-report',
      '/guides',
    ]) {
      expect(retiredStateDestination(path), path).toBeNull();
    }
  });

  it('uses 308 and matches the next.config redirect table', () => {
    const config = readFileSync('next.config.js', 'utf8');
    expect(config).toContain('RETIRED_STATE_REDIRECTS');
    for (const rule of RETIRED_STATE_REDIRECTS) {
      expect(rule.statusCode).toBe(308);
      expect(config).toContain('retired-state-redirects.cjs');
    }
    const samples = [
      '/delaware',
      '/delaware/llc',
      '/wyoming',
      '/states/delaware',
      '/states/wyoming/extra',
      '/es/states/delaware',
      '/es/wyoming/foo',
      '/guides/wyoming-llc-vs-delaware-corp',
      '/es/guides/foo-wyoming-bar',
      '/guides/delaware-llc',
    ];
    for (const path of samples) {
      expect(destinationFromRules(path), path).toBe(retiredStateDestination(path));
    }
  });
});
