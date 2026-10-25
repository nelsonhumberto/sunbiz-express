import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickLocale } from '@/lib/pick-locale';
import { greetingText } from '@/lib/greeting';
import { formatRelative } from '@/lib/utils';
import { computeNextAnnualReport } from '@/lib/florida';
import { computeNextAnnualCompliance } from '@/lib/formation-validation';
import { nameCheckBlocksContinue } from '@/lib/name-check';
import {
  chunkReloadDecision,
  isChunkLoadError,
  isNextStaticScript,
} from '@/lib/chunk-reload';
import { localeFromPathname } from '@/lib/error-page-copy';
import { isSpanishOnlyGuidePath } from '@/lib/spanish-guide-links';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('locale-aware start and wizard paths', () => {
  it('prefixes wizard and pricing paths for Spanish and keeps a filing locale', () => {
    expect(pickLocale('en', 'es')).toBe('es');
    expect(pickLocale('es', null)).toBe('es');
    expect(pickLocale('en', null)).toBe('en');
  });

  it('sends start, pricing, and wizard navigation through locale-aware helpers', () => {
    const start = source('app/start/page.tsx');
    const guest = source('actions/guest-start.ts');
    const launch = source('app/start/guest-start-launch.tsx');
    const pricing = source('components/marketing/PricingTable.tsx');
    const step = source('components/wizard/steps/Step2Name.tsx');
    expect(start).toContain('redirectLocalized');
    expect(start).toContain("from '@/i18n/navigation'");
    expect(guest).toContain('redirectLocalized');
    expect(guest).not.toContain('redirect(`/wizard/');
    expect(launch).toContain('window.location.assign(href)');
    expect(pricing).toContain("from '@/i18n/navigation'");
    expect(pricing).toContain('`/start?tier=');
    expect(step).toContain('useLocalizedRouter(filing.locale)');
    expect(source('actions/auth.ts')).toContain('redirectAfterAuth');
  });
});

describe('dashboard greeting and relative time', () => {
  it('omits the comma when the name is blank', () => {
    expect(greetingText('Good afternoon', '')).toBe('Good afternoon');
    expect(greetingText('Good afternoon', 'Ada')).toBe('Good afternoon, Ada');
    expect(greetingText(null, 'Ada')).toBe('Ada');
    expect(greetingText(null, '')).toBe('');
  });

  it('formats relative time in Spanish', () => {
    const justNow = new Date(Date.now() - 5_000);
    expect(formatRelative(justNow, 'es')).toBe('ahora mismo');
    expect(formatRelative(justNow, 'en')).toBe('just now');
    expect(es.wizard.guestEmailRequired).toBe('Agrega tu correo para guardar este borrador.');
    expect(es.wizard.filingState).toBe('Estado de presentación');
    expect(es.wizard.couponPrompt).toBe('¿Tienes un código de descuento?');
    expect(es.wizard.couponApply).toBe('Aplicar');
  });
});

describe('Florida annual report due date', () => {
  it('uses the calendar year after formation, including October and year boundaries', () => {
    expect(ymd(computeNextAnnualReport(new Date(2026, 9, 15), new Date(2026, 9, 25)).dueDate)).toBe(
      '2027-05-01',
    );
    expect(ymd(computeNextAnnualReport(new Date(2026, 0, 1), new Date(2026, 0, 1)).dueDate)).toBe(
      '2027-05-01',
    );
    expect(ymd(computeNextAnnualReport(new Date(2026, 11, 31), new Date(2026, 11, 31)).dueDate)).toBe(
      '2027-05-01',
    );
    expect(
      ymd(computeNextAnnualReport(new Date(2026, 0, 1), new Date(2027, 4, 1, 12, 0, 0)).dueDate),
    ).toBe('2027-05-01');
    expect(
      ymd(computeNextAnnualReport(new Date(2026, 0, 1), new Date(2027, 4, 2, 0, 0, 0)).dueDate),
    ).toBe('2028-05-01');
    expect(
      ymd(
        computeNextAnnualReport(new Date(2026, 11, 31), new Date(2027, 4, 1, 23, 59, 1)).dueDate,
      ),
    ).toBe('2028-05-01');
  });

  it('keeps the shared helper on the same Florida rule and leaves Wyoming on its anniversary', () => {
    const formed = new Date(2026, 0, 15);
    const now = new Date(2026, 5, 1);
    expect(ymd(computeNextAnnualCompliance(formed, 'FL', 'LLC', now).dueDate)).toBe('2027-05-01');
    expect(ymd(computeNextAnnualCompliance(formed, 'WY', 'LLC', now).dueDate)).toBe('2027-01-01');
    expect(ymd(computeNextAnnualCompliance(formed, 'DE', 'LLC', now).dueDate)).toBe('2027-06-01');
    expect(
      ymd(computeNextAnnualCompliance(new Date(2026, 9, 15), 'FL', 'LLC', new Date(2026, 9, 25)).dueDate),
    ).toBe('2027-05-01');
  });
});

describe('name check continue gate', () => {
  it('blocks only an exact conflict', () => {
    expect(nameCheckBlocksContinue({ status: 'exact_conflict' })).toBe(true);
    expect(nameCheckBlocksContinue({ status: 'similar_conflict' })).toBe(false);
    expect(nameCheckBlocksContinue({ status: 'restricted' })).toBe(false);
    expect(nameCheckBlocksContinue({ status: 'available' })).toBe(false);
    expect(nameCheckBlocksContinue(null)).toBe(false);
    const step = source('components/wizard/steps/Step2Name.tsx');
    expect(step).toContain('nameCheckBlocksContinue');
    expect(step).toContain('nameStatus: result?.status');
    expect(source('actions/wizard.ts')).toContain("data.nameStatus === 'exact_conflict'");
    expect(en.wizard.nameTakenBlock).not.toMatch(/\u2014/);
    expect(es.wizard.nameTakenBlock).toMatch(/ya está tomado/);
  });
});

describe('chunk reload and error locale', () => {
  it('recognizes chunk failures and reloads once', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: 'x' })).toBe(true);
    expect(isChunkLoadError('Loading chunk 12 failed')).toBe(true);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
    expect(isChunkLoadError('Importing a module script failed')).toBe(true);
    expect(isNextStaticScript('https://launchforma.com/_next/static/chunks/7770-abc.js')).toBe(true);
    expect(isNextStaticScript('https://launchforma.com/_next/static/chunks/app.css')).toBe(false);
    const bag = new Map<string, string>();
    const storage = {
      getItem: (key: string) => bag.get(key) ?? null,
      setItem: (key: string, value: string) => bag.set(key, value),
    };
    expect(chunkReloadDecision(storage)).toBe('reload');
    expect(chunkReloadDecision(storage)).toBe('skip');
    expect(
      chunkReloadDecision({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('skip');
    expect(localeFromPathname('/es/wizard/abc/2')).toBe('es');
    expect(localeFromPathname('/wizard/abc/2')).toBe('en');
    expect(source('app/global-error.tsx')).toContain('useErrorLocale');
    expect(source('app/layout.tsx')).toContain('ChunkReload');
    const scriptSrc = source('next.config.js')
      .split('\n')
      .find((line) => line.includes('script-src'));
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc).not.toContain('unsafe-eval');
  });
});

describe('Spanish-only guides and statute labels', () => {
  it('disables English on Spanish-only guides and labels statute quotes', () => {
    expect(isSpanishOnlyGuidePath('/es/guides/llc-florida-sin-seguro-social')).toBe(true);
    expect(isSpanishOnlyGuidePath('/guides/llc-para-tu-app-florida')).toBe(true);
    expect(isSpanishOnlyGuidePath('/es/guides/how-to-form-an-llc-in-florida')).toBe(false);
    const switcher = source('components/marketing/LanguageSwitcher.tsx');
    expect(switcher).toContain('Solo en español');
    expect(switcher).toContain('isSpanishOnlyGuidePath');
    expect(switcher.indexOf('await setLocaleAction(locale)')).toBeLessThan(
      switcher.indexOf('window.location.assign(href)'),
    );
    expect(switcher).not.toContain('router.push');
    expect(source('components/marketing/MarkdownBody.tsx')).toContain('Texto oficial en inglés');
    expect(es.guideLlcVsSole.body).toContain('[cuándo obtener un EIN nuevo](');
    expect(es.guideLlcVsSole.body).not.toContain('[when to get a new EIN](');
  });
});
