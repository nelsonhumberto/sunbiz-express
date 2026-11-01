import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/email';
import {
  isFloridaLlcLandingPath,
  optionalDetailsWithPreselect,
  readFloridaLlcPreselected,
  shouldPreselectFloridaLlc,
} from '@/lib/florida-llc-preselect';
import { canonicalFiledName } from '@/lib/name-check';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Florida LLC preselect', () => {
  it('matches the landing paths and Google, and leaves other traffic alone', () => {
    expect(isFloridaLlcLandingPath('/lp/florida-llc')).toBe(true);
    expect(isFloridaLlcLandingPath('/es/lp/llc-florida?utm_source=google')).toBe(true);
    expect(isFloridaLlcLandingPath('https://launchforma.com/es/lp/llc-florida')).toBe(true);
    expect(isFloridaLlcLandingPath('/start')).toBe(false);
    expect(
      shouldPreselectFloridaLlc({ path: '/lp/florida-llc', utmSource: null }),
    ).toBe(true);
    expect(
      shouldPreselectFloridaLlc({
        referer: 'https://launchforma.com/es/lp/llc-florida',
      }),
    ).toBe(true);
    expect(shouldPreselectFloridaLlc({ utmSource: 'Google' })).toBe(true);
    expect(
      shouldPreselectFloridaLlc({ referer: 'https://launchforma.com/pricing' }),
    ).toBe(true);
    expect(
      shouldPreselectFloridaLlc({ referer: 'https://launchforma.com/es/pricing?tier=STANDARD' }),
    ).toBe(true);
    expect(shouldPreselectFloridaLlc({ path: '/pricing' })).toBe(true);
    expect(shouldPreselectFloridaLlc({ utmSource: 'facebook', path: '/start' })).toBe(false);
    expect(shouldPreselectFloridaLlc({ utmSource: 'email' })).toBe(false);
  });

  it('stores the flag in optionalDetails without dropping other keys', () => {
    const raw = optionalDetailsWithPreselect('{"managementType":"member-managed"}');
    expect(JSON.parse(raw)).toEqual({
      managementType: 'member-managed',
      floridaLlcPreselected: true,
    });
    expect(readFloridaLlcPreselected(raw)).toBe(true);
    expect(readFloridaLlcPreselected(null)).toBe(false);
    expect(readFloridaLlcPreselected('not-json')).toBe(false);
  });
});

describe('name later and a null company name', () => {
  it('uses the requested copy and keeps Spanish in the informal, ungendered form', () => {
    expect(en.start.nameLater).toBe("I'll name it later");
    expect(es.start.nameLater).toBe('Lo nombro después');
    expect(en.wizard.changeEntity).toBe('Change');
    expect(es.wizard.changeEntity).toBe('Cambiar');
    expect(en.lpFlorida.startButton).toBe('Start');
    expect(es.lpFlorida.startButton).toBe('Empezar');
    for (const copy of [en.start.nameLater, es.start.nameLater, en.wizard.changeEntity, es.wizard.changeEntity]) {
      expect(copy).not.toMatch(/\u2014|\u2013/);
    }
    expect(es.start.nameLater).not.toMatch(/\b(listo|lista|bienvenido|bienvenida)\b/i);
    const launch = source('app/start/guest-start-launch.tsx');
    expect(launch).toContain("t('nameLater')");
    expect(launch).toContain('nameLater: deferName');
    expect(launch).toContain('void run({ businessName: trimmed })');
    const page = source('app/wizard/[filingId]/[step]/page.tsx');
    expect(page).toContain('startNameIsAcceptable(filing.businessName)');
    expect(page).toContain("searchParams?.change === '1'");
    expect(page).toContain('readFloridaLlcPreselected');
    expect(source('components/wizard/steps/Step2Name.tsx')).toContain('?change=1');
    expect(source('components/wizard/steps/Step2Name.tsx')).toContain("t('changeEntity')");
  });

  it('does not throw in emails, the name check, or the readiness gate when the name is null', () => {
    expect(canonicalFiledName('', 'LLC')).toBe('');
    const started = renderTemplate('FILING_STARTED', {
      firstName: 'Ada',
      businessName: undefined,
      resumeUrl: 'https://launchforma.com/wizard/filing_1/2',
      locale: 'es',
    });
    expect(started.subject).toContain('tu empresa');
    expect(started.subject.toLowerCase()).not.toContain('null');
    expect(started.html.toLowerCase()).not.toContain('null');
    const english = renderTemplate('FILING_STARTED', { businessName: undefined, locale: 'en' });
    expect(english.subject).toContain('your business');
    expect(english.subject.toLowerCase()).not.toContain('null');
    const readiness = source('lib/filing-readiness.ts');
    expect(readiness).toContain('filing.businessName?.trim()');
    expect(source('app/(app)/dashboard/page.tsx')).toContain('businessName ??');
    expect(source('app/(admin)/admin/filings/page.tsx')).toContain('businessName ??');
  });
});

describe('Florida LLC landing fold', () => {
  it('puts the price, name, and start control above the fee breakdown', () => {
    const landing = source('components/marketing/FloridaLlcLanding.tsx');
    const heroStart = landing.indexOf('data-testid="lp-hero"');
    const hero = landing.slice(heroStart, landing.indexOf('data-testid="lp-plans"'));
    expect(hero.indexOf('tierPackagePriceCents')).toBeGreaterThan(-1);
    expect(hero.indexOf('data-testid="lp-value"')).toBeLessThan(hero.indexOf('id="lp-business-name"'));
    expect(hero.indexOf('id="lp-business-name"')).toBeLessThan(hero.indexOf('data-testid="lp-cta"'));
    expect(hero.indexOf('data-testid="lp-cta"')).toBeLessThan(hero.indexOf('data-testid="lp-breakdown"'));
    expect(landing).not.toMatch(/\$199/);
    expect(landing).toContain('preselected: true');
    expect(landing).toContain("tLp('startButton')");
    expect(landing).toContain("t('nameLater')");
    expect(landing).toContain('nameLater: skipName');
    expect(landing).toContain("source: 'lp-florida-llc'");
    expect(landing.indexOf('data-testid="lp-cta"')).toBeLessThan(
      landing.indexOf("aria-label={tLp('emailTitle')}"),
    );
    expect(landing.indexOf('data-testid="lp-breakdown"')).toBeLessThan(
      landing.indexOf("aria-label={tLp('emailTitle')}"),
    );
    const bar = source('components/analytics/CookieConsentBar.tsx');
    expect(bar).toContain('min-h-11');
    expect(bar).not.toContain('basis-full');
    expect(bar).toContain('items-center gap-2');
  });
});
