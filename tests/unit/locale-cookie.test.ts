import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { middleware } from '../../middleware';
import { localeFromPublicPath, localeQueryRedirect } from '@/lib/locale-paths';

function invoke(urlPath: string, init?: { cookie?: string; prefetch?: boolean }) {
  const headers = new Headers({ host: 'launchforma.com' });
  if (init?.cookie) headers.set('cookie', init.cookie);
  if (init?.prefetch) {
    headers.set('purpose', 'prefetch');
    headers.set('next-router-prefetch', '1');
  }
  const request = new NextRequest(new URL(urlPath, 'https://launchforma.com'), { headers });
  return middleware(request);
}

function setCookieHeader(response: Response): string {
  return response.headers.get('set-cookie') ?? '';
}

function forwardedLocale(response: Response): string | null {
  return response.headers.get('x-middleware-request-x-lf-locale');
}

describe('path locale, not the NEXT_LOCALE cookie', () => {
  it('turns off next-intl cookie and Accept-Language detection', () => {
    expect(routing.localeDetection).toBe(false);
    expect(routing.defaultLocale).toBe('en');
  });

  it('treats /es as Spanish and every other path as English', () => {
    expect(localeFromPublicPath('/es')).toBe('es');
    expect(localeFromPublicPath('/es/business-services')).toBe('es');
    expect(localeFromPublicPath('/es/business-services/thank-you')).toBe('es');
    expect(localeFromPublicPath('/')).toBe('en');
    expect(localeFromPublicPath('/business-services')).toBe('en');
    expect(localeFromPublicPath('/business-services/thank-you')).toBe('en');
    expect(localeFromPublicPath('/es/guides/florida-llc-operating-agreement')).toBe('es');
    expect(localeFromPublicPath('/es/guides/florida-llc-operating-agreement/download')).toBe('es');
    expect(localeFromPublicPath('/guides/florida-llc-operating-agreement')).toBe('en');
    expect(localeFromPublicPath('/guides/florida-llc-operating-agreement/download')).toBe('en');
  });

  it('does not set NEXT_LOCALE when an /es URL is prefetched', () => {
    const response = invoke('/es/business-services', { prefetch: true });
    expect(response.status).toBe(200);
    expect(setCookieHeader(response)).not.toMatch(/NEXT_LOCALE/);
    expect(forwardedLocale(response)).toBe('es');
    const rewrite = response.headers.get('x-middleware-rewrite');
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe('/business-services');
  });

  it('keeps the English thank-you page in English when NEXT_LOCALE=es is already set', () => {
    const response = invoke('/business-services/thank-you', { cookie: 'NEXT_LOCALE=es' });
    expect(response.status).toBe(200);
    expect(forwardedLocale(response)).toBe('en');
    expect(setCookieHeader(response)).not.toMatch(/NEXT_LOCALE/);
    expect(response.headers.get('x-middleware-request-x-lf-public-path')).toBe(
      '/business-services/thank-you',
    );
  });

  it('does not let a Spanish campaign name flip an English URL', () => {
    const response = invoke('/business-services/thank-you?utm_campaign=es-business-services');
    expect(response.status).toBe(200);
    expect(forwardedLocale(response)).toBe('en');
    expect(setCookieHeader(response)).not.toMatch(/NEXT_LOCALE/);
  });

  it('sends ?lang=es to the /es path without writing NEXT_LOCALE', () => {
    const response = invoke('/business-services?lang=es&utm_source=google');
    expect(response.status).toBe(308);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/es/business-services');
    expect(location.searchParams.get('lang')).toBeNull();
    expect(location.searchParams.get('utm_source')).toBe('google');
    expect(setCookieHeader(response)).not.toMatch(/NEXT_LOCALE/);
  });

  it('sends ?lang=en on a Spanish path back to English without writing NEXT_LOCALE', () => {
    const response = invoke('/es/business-services/thank-you?lang=en');
    expect(response.status).toBe(308);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/business-services/thank-you');
    expect(location.searchParams.has('lang')).toBe(false);
    expect(setCookieHeader(response)).not.toMatch(/NEXT_LOCALE/);
  });

  it('serves the operating agreement guide in Spanish from the /es path', () => {
    for (const page of [
      '/guides/florida-llc-operating-agreement',
      '/guides/florida-llc-operating-agreement/download',
    ]) {
      const response = invoke(`/es${page}`, { prefetch: true });
      expect(response.status, page).toBe(200);
      expect(setCookieHeader(response), page).not.toMatch(/NEXT_LOCALE/);
      expect(forwardedLocale(response), page).toBe('es');
      expect(response.headers.get('x-middleware-request-x-lf-public-path'), page).toBe(`/es${page}`);
      const rewrite = response.headers.get('x-middleware-rewrite');
      expect(rewrite, page).toBeTruthy();
      expect(new URL(rewrite!).pathname, page).toBe(page);
    }
  });

  it('keeps the English operating agreement guide in English when NEXT_LOCALE=es is set', () => {
    for (const page of [
      '/guides/florida-llc-operating-agreement',
      '/guides/florida-llc-operating-agreement/download',
    ]) {
      const response = invoke(page, { cookie: 'NEXT_LOCALE=es' });
      expect(response.status, page).toBe(200);
      expect(forwardedLocale(response), page).toBe('en');
      expect(setCookieHeader(response), page).not.toMatch(/NEXT_LOCALE/);
      expect(response.headers.get('x-middleware-request-x-lf-public-path'), page).toBe(page);
    }
  });

  it('reads locale for the operating agreement pages from getLocale', () => {
    for (const file of [
      'app/(marketing)/guides/florida-llc-operating-agreement/page.tsx',
      'app/(marketing)/guides/florida-llc-operating-agreement/download/page.tsx',
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source, file).toContain('getLocale()');
      expect(source, file).not.toContain('NEXT_LOCALE');
    }
  });

  it('keeps /es/wizard on the Spanish start page', () => {
    const response = invoke('/es/wizard');
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/es/start');
    expect(setCookieHeader(response)).not.toMatch(/NEXT_LOCALE/);
  });

  it('moves ?lang= onto the path and leaves a matching path alone', () => {
    expect(localeQueryRedirect('/business-services', new URLSearchParams('lang=es'))).toEqual({
      pathname: '/es/business-services',
      search: '',
    });
    expect(localeQueryRedirect('/es/pricing', new URLSearchParams('lang=en'))).toEqual({
      pathname: '/pricing',
      search: '',
    });
    expect(localeQueryRedirect('/es/pricing', new URLSearchParams('lang=es'))).toBeNull();
    expect(localeQueryRedirect('/', new URLSearchParams('lang=es&utm_source=ig'))).toEqual({
      pathname: '/es',
      search: 'utm_source=ig',
    });
  });
});

describe('cross-language links do not prefetch', () => {
  it('uses LocaleLink, which sets prefetch={false}, on the language toggle and En español', () => {
    const link = readFileSync(path.join(process.cwd(), 'components/i18n/LocaleLink.tsx'), 'utf8');
    expect(link).toContain('prefetch={false}');
    const layout = readFileSync(
      path.join(process.cwd(), 'app/(compliance-landing)/layout.tsx'),
      'utf8',
    );
    const page = readFileSync(
      path.join(process.cwd(), 'app/(compliance-landing)/business-services/page.tsx'),
      'utf8',
    );
    expect(layout).toContain('LocaleLink');
    expect(layout).toContain("locale === 'es' ? '/es/business-services' : '/business-services'");
    expect(page).toContain('En español');
    expect(page).toContain('href="/es/business-services"');
    expect(page).toContain('LocaleLink');
    const htmlLang = readFileSync(path.join(process.cwd(), 'components/i18n/HtmlLang.tsx'), 'utf8');
    expect(htmlLang).toContain('document.documentElement.lang');
    const switcher = readFileSync(
      path.join(process.cwd(), 'components/marketing/LanguageSwitcher.tsx'),
      'utf8',
    );
    expect(switcher).toContain('document.documentElement.lang = locale');
    expect(switcher).toContain('setLocaleAction');
  });

  it('loads the other language with a full navigation after the cookie is set', () => {
    const switcher = readFileSync(
      path.join(process.cwd(), 'components/marketing/LanguageSwitcher.tsx'),
      'utf8',
    );
    const cookie = switcher.indexOf('await setLocaleAction(locale)');
    const navigate = switcher.indexOf('window.location.assign(href)');
    expect(cookie).toBeGreaterThan(-1);
    expect(navigate).toBeGreaterThan(cookie);
    expect(switcher).not.toContain('router.push');
    expect(switcher).not.toContain('router.refresh');
  });
});
