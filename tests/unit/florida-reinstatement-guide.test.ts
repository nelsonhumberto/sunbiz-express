import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { buildLlmsTxt } from '@/lib/llms';
import es from '../../messages/es.json';

const PAGE = 'app/(marketing)/guides/how-to-reinstate-a-florida-llc/page.tsx';
const EN_URL = 'https://launchforma.com/guides/how-to-reinstate-a-florida-llc';
const ES_URL = 'https://launchforma.com/es/guides/how-to-reinstate-a-florida-llc';

const TITLE = 'How to Reinstate a Dissolved Florida LLC (2026)';
const DESCRIPTION =
  'Florida LLC administratively dissolved? How to check status on Sunbiz, file reinstatement online, the $100 fee plus $138.75 per missed report year.';
const ES_TITLE = 'Cómo reactivar una LLC disuelta en Florida (2026)';
const ES_DESCRIPTION =
  '¿Tu LLC de Florida fue disuelta? Revisa su estado en Sunbiz y reactívala en línea: $100 de reinstatement más $138.75 por cada año de reporte.';

describe('Florida LLC reinstatement guide', () => {
  const page = readFileSync(PAGE, 'utf8');
  const copy = es.guideFlReinstate;

  it('keeps the spec title, description, H1, and hreflang pair', () => {
    expect(TITLE).toHaveLength(47);
    expect(DESCRIPTION).toHaveLength(147);
    expect(ES_TITLE).toHaveLength(49);
    expect(ES_DESCRIPTION).toHaveLength(141);
    expect(page).toContain(`const TITLE = '${TITLE}'`);
    expect(page).toContain(DESCRIPTION);
    expect(page).toContain("const H1 = 'How to Reinstate a Dissolved Florida LLC'");
    expect(page).toContain("const DATE_MODIFIED = '2026-10-25'");
    expect(page).toContain('withLocaleMeta');
    expect(page).toContain("getTranslations('guideFlReinstate')");
    expect(page).toContain("inLanguage: 'en'");
    expect(page).toContain("inLanguage: 'es'");
    expect(page).toContain('inLanguage="en"');
    expect(page).toContain('inLanguage="es"');
    expect(copy.metaTitle).toBe(ES_TITLE);
    expect(copy.metaDescription).toBe(ES_DESCRIPTION);
    expect(copy.title).toBe('Cómo reactivar (reinstatement) una LLC disuelta en Florida');
    expect(page).toContain('This is general information, not legal or tax advice.');
    expect(copy.body).toContain('Esto es información general, no asesoría legal ni fiscal.');
    expect(copy.closing).toContain('Esto es información general, no asesoría legal ni fiscal.');
  });

  it('does not use em dashes or en dashes, and does not invent a service page', () => {
    expect(page).not.toMatch(/—|–/);
    expect(JSON.stringify(copy)).not.toMatch(/—|–/);
    expect(page).toContain('[Reinstate your Florida LLC](/reinstate-llc)');
    expect(copy.closing).toContain('[Reactiva tu LLC de Florida](/es/reinstate-llc)');
    expect(existsSync('app/(marketing)/reinstate-llc/page.tsx')).toBe(false);
    expect(existsSync('app/(marketing)/reinstate-llc')).toBe(false);
    expect(page).toContain('$149 plus state fees');
    expect(page).toContain(
      'Florida charges $100 plus $138.75 for each annual report year due. There is no $400 late fee on a reinstatement. The $400 late fee applies only to annual reports filed late by an active company. Our service is $149.',
    );
    expect(page).toContain(
      'If Sunbiz requires a different amount when we file, we will contact you before filing. We never charge more without your OK.',
    );
    expect(copy.body).toContain(
      'Florida cobra $100 más $138.75 por cada año de reporte anual pendiente. No hay recargo de $400 en una reactivación (reinstatement). El recargo de $400 aplica solo a los reportes anuales presentados tarde por una empresa activa. Nuestro servicio es $149.',
    );
    expect(copy.closing).toContain('$149 más las tarifas estatales');
    expect(copy.closing).toContain(
      'Si Sunbiz exige un monto diferente al presentar, te contactaremos antes de presentar. Nunca cobramos más sin tu aprobación.',
    );
    expect(page).not.toContain('Florida-only');
    expect(copy.closing).not.toContain('Florida-only');
  });

  it('lists each URL once in the sitemap, with the hreflang pair', () => {
    const entries = sitemap();
    const urls = entries.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((url) => url === EN_URL)).toHaveLength(1);
    expect(urls.filter((url) => url === ES_URL)).toHaveLength(1);
    expect(urls.some((url) => url.includes('/reinstate-llc') && !url.includes('/guides/'))).toBe(false);

    const languages = {
      en: EN_URL,
      es: ES_URL,
      'x-default': EN_URL,
    };
    const english = entries.find((item) => item.url === EN_URL);
    const spanish = entries.find((item) => item.url === ES_URL);
    expect(english?.alternates?.languages).toEqual(languages);
    expect(spanish?.alternates?.languages).toEqual(languages);
  });

  it('adds the llms.txt guide line and a Spanish entry', () => {
    const text = buildLlmsTxt();
    expect(text).toContain(
      '- [How to Reinstate a Dissolved Florida LLC](https://launchforma.com/guides/how-to-reinstate-a-florida-llc): why LLCs are administratively dissolved, checking status on Sunbiz, DIY online reinstatement, $100 fee plus $138.75 per report year due, name availability, timing. ES: https://launchforma.com/es/guides/how-to-reinstate-a-florida-llc',
    );
    expect(text).toContain(
      '- [Cómo reactivar una LLC disuelta en Florida](https://launchforma.com/es/guides/how-to-reinstate-a-florida-llc):',
    );
    const guides = text.split('## Español')[0] ?? '';
    expect(guides.match(/how-to-reinstate-a-florida-llc/g)).toHaveLength(2);
  });

  it('links back from the LLC, DBA, and annual report guides', () => {
    const llc = readFileSync('app/(marketing)/guides/how-to-form-an-llc-in-florida/page.tsx', 'utf8');
    expect(llc).toContain('LLC dissolved for a missed annual report? See');
    expect(llc).toContain('href="/guides/how-to-reinstate-a-florida-llc"');
    expect(llc).toContain('how to reinstate a Florida LLC');

    const form = es.guideFlForm.body;
    expect(form).toContain(
      '¿Tu LLC fue disuelta por no presentar el reporte anual? Mira [cómo reactivarla](/es/guides/how-to-reinstate-a-florida-llc).',
    );

    const dba = readFileSync('app/(marketing)/guides/florida-fictitious-name-dba/page.tsx', 'utf8');
    expect(dba).toContain(
      'If your LLC is not active, see [how to reinstate a Florida LLC](/guides/how-to-reinstate-a-florida-llc).',
    );

    const annual = readFileSync('app/(marketing)/guides/florida-annual-report/page.tsx', 'utf8');
    expect(annual).toContain('LLC dissolved for a missed annual report? See');
    expect(annual).toContain('href="/guides/how-to-reinstate-a-florida-llc"');
    expect(es.guideFlAnnual.body).toContain(
      '¿Tu LLC fue disuelta por no presentar el reporte anual? Mira [cómo reactivarla](/es/guides/how-to-reinstate-a-florida-llc).',
    );

    const index = readFileSync('app/(marketing)/guides/page.tsx', 'utf8');
    expect(index).toContain("slug: 'how-to-reinstate-a-florida-llc'");
    expect(index).toContain("t('reinstateTitle')");
    expect(es.guidesPage.reinstateTitle).toBe(copy.title);
  });
});
