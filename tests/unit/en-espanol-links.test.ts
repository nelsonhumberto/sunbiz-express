import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EN_FLORIDA_LICENSE_SPANISH_LINKS,
  EN_FORM_LLC_SPANISH_LINKS,
  EN_GUIDES_INDEX_SPANISH_LINKS,
  SPANISH_GUIDE_BROWARD,
  SPANISH_GUIDE_LLC_APP,
  SPANISH_GUIDE_LLC_SIN_SSN,
  SPANISH_GUIDE_LLC_VS_SOLE,
  SPANISH_GUIDE_MIAMI,
} from '@/lib/spanish-guide-links';
import es from '../../messages/es.json';

describe('En español links', () => {
  it('points only at real Spanish guide titles', () => {
    expect(SPANISH_GUIDE_LLC_SIN_SSN.label).toBe(es.guideLlcSinSsn.title);
    expect(SPANISH_GUIDE_MIAMI.label).toBe(es.guideMiamiBtr.title);
    expect(SPANISH_GUIDE_BROWARD.label).toBe(es.guideBrowardBtr.title);
    expect(SPANISH_GUIDE_LLC_VS_SOLE.label).toBe(es.guideLlcVsSole.title);
    expect(SPANISH_GUIDE_LLC_APP.label).toBe(es.guideLlcApp.title);

    for (const link of EN_GUIDES_INDEX_SPANISH_LINKS) {
      const slug = link.href.replace('/es/guides/', '');
      expect(existsSync(`app/(marketing)/guides/${slug}/page.tsx`), link.href).toBe(true);
      expect(link.href.startsWith('/es/guides/')).toBe(true);
    }
    expect(EN_GUIDES_INDEX_SPANISH_LINKS).toHaveLength(5);
  });

  it('adds blocks only on the English pages that match a Spanish guide', () => {
    const formLlc = readFileSync('app/(marketing)/guides/how-to-form-an-llc-in-florida/page.tsx', 'utf8');
    expect(formLlc).toContain('EN_FORM_LLC_SPANISH_LINKS');
    expect(formLlc).toContain('heading="En español"');
    expect(EN_FORM_LLC_SPANISH_LINKS.map((link) => link.href)).toEqual([
      '/es/guides/llc-florida-sin-seguro-social',
      '/es/guides/llc-o-negocio-individual-florida',
    ]);

    const annual = readFileSync('app/(marketing)/guides/florida-annual-report/page.tsx', 'utf8');
    expect(annual).toContain('EN_FLORIDA_LICENSE_SPANISH_LINKS');
    expect(annual).toContain('heading="En español"');

    const index = readFileSync('app/(marketing)/guides/page.tsx', 'utf8');
    expect(index).toContain('heading="Guías en español"');
    expect(index).toContain("locale === 'en'");
    expect(EN_GUIDES_INDEX_SPANISH_LINKS.map((link) => link.href)).toContain(
      '/es/guides/llc-para-tu-app-florida',
    );

    const florida = readFileSync('app/(marketing)/states/[slug]/page.tsx', 'utf8');
    expect(florida).toContain("state.slug === 'florida'");
    expect(florida).toContain('EN_FLORIDA_LICENSE_SPANISH_LINKS');
    expect(EN_FLORIDA_LICENSE_SPANISH_LINKS.map((link) => link.href)).toEqual([
      '/es/guides/licencia-negocio-miami-dade',
      '/es/guides/licencia-negocio-broward',
    ]);

    const agent = readFileSync('app/(marketing)/guides/florida-registered-agent/page.tsx', 'utf8');
    expect(agent).not.toContain('EnEspanolLinks');
    const agreement = readFileSync(
      'app/(marketing)/guides/florida-llc-operating-agreement/page.tsx',
      'utf8',
    );
    expect(agreement).not.toContain('EnEspanolLinks');
  });
});
