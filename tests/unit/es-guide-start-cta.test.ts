import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localizedHref } from '@/lib/locale-paths';
import es from '../../messages/es.json';

const GUIDES = [
  'guideLlcSinSsn',
  'guideMiamiBtr',
  'guideBrowardBtr',
  'guideLlcVsSole',
  'guideLlcApp',
] as const;

describe('Spanish guide start CTAs', () => {
  it('labels both the top and end buttons Empieza tu LLC and points them at /es/start', () => {
    for (const name of GUIDES) {
      expect(es[name].ctaLabel, name).toBe('Empieza tu LLC');
      expect(es[name].ctaLabel, name).not.toMatch(/—|–/);
    }

    expect(localizedHref('/start', 'es')).toBe('/es/start');

    const guide = readFileSync('components/marketing/SpanishGuide.tsx', 'utf8');
    expect(guide).toContain('topCta={{');
    expect(guide).toContain("href: '/start'");
    expect(guide.match(/href: '\/start'/g)?.length).toBe(2);

    const layout = readFileSync('components/marketing/GuideLayout.tsx', 'utf8');
    expect(layout).toContain('localizedHref(topCta.href, locale)');
    expect(layout).toContain('localizedHref(cta.href, locale)');
  });
});
