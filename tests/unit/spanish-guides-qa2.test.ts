import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';

const NEW_GUIDES = [
  'guideLlcSinSsn',
  'guideMiamiBtr',
  'guideBrowardBtr',
  'guideLlcVsSole',
  'guideLlcApp',
] as const;

const LONG_FORM = 'Articles of Organization (acta de constitución de la LLC)';
const SHORT_FORM = 'Articles of Organization';

type GuideCopy = {
  body?: string;
  ctaHeadline?: string;
  faq1q?: string;
};

const messages = es as unknown as Record<string, GuideCopy>;

function visible(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

describe('Spanish guides QA round 2', () => {
  it('wraps guide body links so a long URL cannot widen a phone layout', () => {
    const markdown = readFileSync('components/marketing/MarkdownBody.tsx', 'utf8');
    const layout = readFileSync('components/marketing/GuideLayout.tsx', 'utf8');
    expect(markdown).toContain('break-words');
    expect(markdown).toContain('[overflow-wrap:anywhere]');
    expect(layout).toContain('prose-a:break-words');
    expect(layout).toContain('prose-a:[overflow-wrap:anywhere]');
    expect(layout).toContain('[&_a]:[overflow-wrap:anywhere]');
  });

  it('uses Articles of Organization, with the Spanish gloss only on first use', () => {
    for (const name of NEW_GUIDES) {
      expect(JSON.stringify(messages[name]), name).not.toContain('Artículos de Organización');
    }

    const ssn = `${messages.guideLlcSinSsn.body} ${messages.guideLlcSinSsn.faq1q}`;
    expect(ssn.indexOf(LONG_FORM)).toBeGreaterThanOrEqual(0);
    expect(ssn.indexOf(LONG_FORM)).toBe(ssn.lastIndexOf(LONG_FORM));
    expect(ssn.split(SHORT_FORM).length - 1).toBeGreaterThan(1);

    const sole = messages.guideLlcVsSole.body ?? '';
    expect(sole).toContain(`${LONG_FORM}, $125`);
    expect(sole.split(LONG_FORM).length - 1).toBe(1);
  });

  it('labels Broward source links in Spanish and renames the closing headings', () => {
    const broward = messages.guideBrowardBtr.body ?? '';
    expect(broward).toContain(
      '[Recibo de impuesto de negocio del condado de Broward](https://browardtax.org/business-tax-receipt/)',
    );
    expect(broward).toContain(
      '[Recibo de impuesto de negocio de Fort Lauderdale](https://www.fortlauderdale.gov/Government/Departments/Community-Services/Business-Tax)',
    );
    expect(broward).toContain(
      '[Certificado de uso (Certificate of Use) de Fort Lauderdale](https://www.fortlauderdale.gov/Government/Departments/Development-Services/Urban-Design-and-Planning/Certificate-of-Use)',
    );
    expect(broward).not.toContain('[Business Tax]');
    expect(broward).not.toContain('[Certificate of Use]');
    expect(broward).toContain('## Primero, forma la LLC');
    expect(messages.guideBrowardBtr.ctaHeadline).toBe('Forma tu LLC con LaunchForma');

    expect(messages.guideMiamiBtr.body).toContain('## Primero, forma la LLC');
    expect(messages.guideMiamiBtr.body).not.toContain('## Primero, la LLC\n');
    expect(messages.guideMiamiBtr.ctaHeadline).toBe('Forma tu LLC con LaunchForma');

    expect(messages.guideLlcApp.body).toContain('## Antes de publicar');
    expect(messages.guideLlcApp.ctaHeadline).toBe('Forma tu LLC con LaunchForma');
    expect(messages.guideLlcApp.body).not.toContain('Ponle nombre de empresa a la app');
    expect(messages.guideLlcApp.body).toContain(
      '[IRS, cómo obtener un EIN](https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number)',
    );
    expect(messages.guideLlcApp.body).not.toContain('get an employer identification number');
  });

  it('relabels the D-U-N-S link and does not end a sentence with EE. UU..', () => {
    const app = messages.guideLlcApp.body ?? '';
    expect(app).toContain(
      '[Apple, número D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S)',
    );
    expect(app).not.toContain('[developer.apple.com/help/account/membership/D-U-N-S]');

    for (const name of NEW_GUIDES) {
      const body = messages[name].body ?? '';
      expect(body, name).not.toContain('EE. UU..');
      expect(visible(body), name).not.toContain('EE. UU..');
      expect(JSON.stringify(messages[name]), name).not.toMatch(/—|–/);
    }
  });

  it('keeps claims that match the linked official page, and does not touch prices', () => {
    const broward = messages.guideBrowardBtr.body ?? '';
    expect(visible(broward)).toContain('suele ser rápido; confirma el plazo con el condado');
    expect(broward).not.toContain('24 a 48 horas');
    expect(broward).toContain(
      'https://www.broward.org/recordstaxestreasury/taxesfees/lists/localbusiness/allitems.aspx',
    );
    expect(broward).toContain('1 de octubre de 2026');
    expect(broward).toContain('$238.50');
    expect(broward).toContain('$27 a $150');

    const miami = messages.guideMiamiBtr.body ?? '';
    expect(miami).toContain('a más tardar el 30 de septiembre');
    expect(miami).toContain('https://mdctaxcollector.gov/services/local-business-tax-receipt');
    expect(miami).toContain('$250');

    const ssn = messages.guideLlcSinSsn.body ?? '';
    expect(ssn).toContain('línea 7b');
    expect(ssn).toContain('"foreign" o "N/A"');
    expect(ssn).toContain('https://www.irs.gov/instructions/iss4');

    const app = messages.guideLlcApp.body ?? '';
    expect(app).toContain('hasta 5 días hábiles');
    expect(app).toContain('hasta 2 días hábiles');
    expect(app).toContain('hasta 30 días');
    expect(app).toContain('https://developer.apple.com/help/account/membership/D-U-N-S');
    expect(app).toContain('https://support.google.com/googleplay/android-developer/answer/13628312');
    expect(app).toContain('99 USD');
    expect(messages.guideLlcVsSole.body).toContain('$138.75');
    expect(messages.guideLlcVsSole.body).toContain('$400');
  });
});
