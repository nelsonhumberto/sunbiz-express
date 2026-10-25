import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';

const ENGLISH_TITLES = [
  'How to Form an LLC in Florida (2026 Guide)',
  'How to Form an LLC in Florida',
  'Florida Annual Report: Deadline, Fees, and How to File',
  'What Is a Registered Agent in Florida?',
  'Florida LLC Operating Agreement: What It Is & Why You Need One',
  'Guides - LLC, Corporation & Compliance Resources',
];

const ENGLISH_HEADING =
  /^#{1,3}\s+(Step \d|What |When |How |TL;DR|So which|Is one required|Privacy$|Taxes$|Questions$|Sources$|Do it yourself|Cost \()/;

type GuideCopy = {
  metaTitle: string;
  metaDescription: string;
  title?: string;
  description?: string;
  body?: string;
  intro?: string;
  businessServicesLink?: string;
  formTitle?: string;
  arTitle?: string;
  raTitle?: string;
  oaTitle?: string;
};

const messages = es as unknown as Record<string, GuideCopy>;

function headings(markdown: string): string[] {
  return markdown.split('\n').filter((line) => /^#{1,6}\s/.test(line));
}

describe('Spanish guide pages', () => {
  it('uses Spanish title, meta, headings, and body on every live /es/guides page', () => {
    const namespaces = ['guidesPage', 'guideFlForm', 'guideFlAnnual', 'guideFlRa', 'guideOa', 'guideFlReinstate'] as const;
    for (const name of namespaces) {
      const guide = messages[name];
      expect(guide, name).toBeTruthy();
      expect(ENGLISH_TITLES, name).not.toContain(guide.metaTitle);
      if (name === 'guideOa') {
        expect(guide.metaTitle).toBe('Florida LLC Operating Agreement: acuerdo operativo');
      } else {
        expect(guide.metaTitle, name).toMatch(/[áéíóúñ¿¡]/);
      }
      expect(guide.metaDescription, name).toMatch(/[áéíóúñ¿¡]/);
      expect(guide.metaDescription, name).not.toMatch(/\b(the|and|with|your|what|when|how)\b/i);
      expect(`${guide.metaTitle} ${guide.metaDescription}`, name).not.toMatch(/—|–/);
      if (guide.title) {
        expect(ENGLISH_TITLES, `${name}.title`).not.toContain(guide.title);
        expect(guide.title, name).toMatch(/[áéíóúñ¿¡]/);
      }
      if (guide.body) {
        expect(guide.body, name).toMatch(/[áéíóúñ¿¡]/);
        for (const heading of headings(guide.body)) {
          expect(heading, `${name} ${heading}`).not.toMatch(ENGLISH_HEADING);
          expect(heading, heading).toMatch(/[áéíóúñ¿¡a-záéíóú]/i);
        }
      }
    }

    const index = messages.guidesPage;
    expect(index.intro).toMatch(/fundadores/);
    expect(index.intro).not.toMatch(/\b(the|and|with|your|founders)\b/i);
    expect(index.formTitle).toMatch(/Cómo formar una LLC en Florida/);
    expect(index.arTitle).toMatch(/Reporte anual de Florida/);
    expect(index.raTitle).toMatch(/agente registrado en Florida/i);
    expect(index.oaTitle).toMatch(/Acuerdo operativo/);
    expect(JSON.stringify(index)).not.toMatch(/wyoming-llc-vs-delaware-corp/);
    expect(index.businessServicesLink).toBe('Servicios para empresas ya formadas');
    expect(index.businessServicesLink).not.toMatch(/—|–/);
  });

  it('renders those namespaces instead of the English page body', () => {
    const pages: Array<[string, string]> = [
      ['app/(marketing)/guides/page.tsx', 'guidesPage'],
      ['app/(marketing)/guides/how-to-form-an-llc-in-florida/page.tsx', 'guideFlForm'],
      ['app/(marketing)/guides/florida-annual-report/page.tsx', 'guideFlAnnual'],
      ['app/(marketing)/guides/how-to-reinstate-a-florida-llc/page.tsx', 'guideFlReinstate'],
      ['app/(marketing)/guides/florida-registered-agent/page.tsx', 'guideFlRa'],
      ['app/(marketing)/guides/florida-llc-operating-agreement/page.tsx', 'guideOa'],
    ];
    for (const [file, namespace] of pages) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain("locale === 'es'");
      expect(source, file).toContain(`getTranslations('${namespace}')`);
    }
    const guidesIndex = readFileSync('app/(marketing)/guides/page.tsx', 'utf8');
    expect(guidesIndex).toContain('href="/es/business-services"');
    expect(guidesIndex).toContain("t('businessServicesLink')");
    const boi = readFileSync('app/(marketing)/guides/boi-filing-2026/page.tsx', 'utf8');
    expect(boi).toContain('permanentRedirect');
    expect(boi).toContain("'/es/boi-reporting'");
  });
});
