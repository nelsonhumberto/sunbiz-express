import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { hrefForLocale } from '@/lib/app-href';
import { PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import { localeFromPathOrFiling, resolveRequestLocale } from '@/lib/request-locale';
import { middleware } from '../../middleware';

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

function invoke(
  urlPath: string,
  init?: { referer?: string; cookie?: string; acceptLanguage?: string; action?: boolean },
) {
  const headers = new Headers({ host: 'launchforma.com' });
  if (init?.action) headers.set('next-action', 'openGuestDraft');
  if (init?.referer) headers.set('referer', init.referer);
  if (init?.cookie) headers.set('cookie', init.cookie);
  if (init?.acceptLanguage) headers.set('accept-language', init.acceptLanguage);
  const request = new NextRequest(new URL(urlPath, 'https://launchforma.com'), {
    method: init?.action ? 'POST' : 'GET',
    headers,
  });
  return middleware(request);
}

describe('locale-preserving URLs', () => {
  it('builds wizard, checkout, and start paths from the locale', () => {
    expect(hrefForLocale('/wizard/filing_1/1', 'es')).toBe('/es/wizard/filing_1/1');
    expect(hrefForLocale('/start', 'es')).toBe('/es/start');
    expect(hrefForLocale('/checkout/success?filing=abc', 'es')).toBe(
      '/es/checkout/success?filing=abc',
    );
    expect(hrefForLocale('/sign-in?next=%2Fes%2Fwizard%2Ffiling_1%2F2', 'es')).toBe(
      '/es/sign-in?next=%2Fes%2Fwizard%2Ffiling_1%2F2',
    );
    expect(hrefForLocale('/wizard/filing_1/1', 'en')).toBe('/wizard/filing_1/1');
    expect(hrefForLocale('/start', 'en')).toBe('/start');
    expect(hrefForLocale('/checkout/success?filing=abc', 'en')).toBe(
      '/checkout/success?filing=abc',
    );
    expect(hrefForLocale('/es/wizard/filing_1/1', 'es')).toBe('/es/wizard/filing_1/1');
  });

  it('lets the address bar beat the rewrite, the cookie, and Accept-Language', () => {
    expect(
      resolveRequestLocale({
        browserPath: '/es/start',
        publicPath: '/start',
        localeHeader: 'en',
        referer: 'https://launchforma.com/start',
        serverAction: true,
      }),
    ).toBe('es');
    expect(
      resolveRequestLocale({
        browserPath: '/start',
        publicPath: '/es/start',
        localeHeader: 'es',
        referer: 'https://launchforma.com/es/wizard/filing_1/1',
        serverAction: true,
      }),
    ).toBe('en');
    expect(
      resolveRequestLocale({
        publicPath: '/start',
        localeHeader: 'en',
        referer: 'https://launchforma.com/es/start',
        serverAction: true,
      }),
    ).toBe('es');
    expect(
      resolveRequestLocale({
        publicPath: '/start',
        localeHeader: 'es',
        referer: 'https://launchforma.com/',
        serverAction: true,
      }),
    ).toBe('en');
    expect(
      resolveRequestLocale({
        referer: 'https://evil.example/es/start',
        publicPath: '/start',
        serverAction: true,
      }),
    ).toBe('en');
    expect(localeFromPathOrFiling('es', 'en')).toBe('es');
    expect(localeFromPathOrFiling('en', 'es')).toBe('en');
    expect(localeFromPathOrFiling(null, 'es')).toBe('es');
    expect(localeFromPathOrFiling(null, 'en')).toBe('en');
  });

  it('keeps a server action posted to /start on the Spanish page that submitted it', () => {
    const spanish = invoke('/start', {
      action: true,
      referer: 'https://launchforma.com/es/start',
      cookie: 'NEXT_LOCALE=en',
      acceptLanguage: 'en-US,en;q=0.9',
    });
    expect(spanish.headers.get('x-middleware-request-x-lf-locale')).toBe('es');
    expect(spanish.headers.get(`x-middleware-request-${PUBLIC_PATH_HEADER}`)).toBe('/es/start');

    const english = invoke('/start', {
      action: true,
      referer: 'https://launchforma.com/start',
      cookie: 'NEXT_LOCALE=es',
      acceptLanguage: 'es-MX,es;q=0.9',
    });
    expect(english.headers.get('x-middleware-request-x-lf-locale')).toBe('en');
    expect(english.headers.get(`x-middleware-request-${PUBLIC_PATH_HEADER}`)).toBe('/start');

    const document = invoke('/es/start', {
      cookie: 'NEXT_LOCALE=en',
      acceptLanguage: 'en-US',
      referer: 'https://launchforma.com/pricing',
    });
    expect(document.headers.get('x-middleware-request-x-lf-locale')).toBe('es');
    expect(document.headers.get(`x-middleware-request-${PUBLIC_PATH_HEADER}`)).toBe('/es/start');
  });

  it('submits /start with the browser path and a real submit button', () => {
    const launch = source('app/start/guest-start-launch.tsx');
    expect(launch).toContain('<form');
    expect(launch).toContain('noValidate');
    expect(launch).toContain('type="submit"');
    expect(launch).toContain('browserPath: window.location.pathname');
    expect(launch).toContain('text-base');
    expect(launch).toContain("t('continue')");
    expect(launch).not.toContain('required');
    expect(launch).not.toContain('pattern=');
    expect(launch).not.toContain('autoFocus');
    expect(source('actions/guest-start.ts')).toContain('storedLocale(input.browserPath)');
    const step1 = source('components/wizard/steps/Step1Entity.tsx');
    expect(step1).toContain('<form');
    expect(step1).toContain('noValidate');
    expect(step1).toContain('fullWidth');
    expect(step1).toContain('isSubmit');
  });
});
