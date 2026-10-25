import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hrefForLocale, localizedRedirectHref, localizedRouterHref } from '@/lib/app-href';
import { useLocalizedRouter } from '@/components/i18n/useLocalizedRouter';
import { redirectLocalized } from '@/lib/locale-redirect';
import { middleware } from '../../middleware';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  pushed: [] as string[],
  replaced: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => nav.redirect(url),
  useRouter: () => ({
    push: (href: string) => {
      nav.pushed.push(href);
    },
    replace: (href: string) => {
      nav.replaced.push(href);
    },
    prefetch: () => undefined,
    back: () => undefined,
    refresh: () => undefined,
  }),
}));
vi.mock('next-intl', () => ({ useLocale: () => 'en' }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => {
    throw new Error('no request');
  },
}));

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

function invoke(urlPath: string) {
  const request = new NextRequest(new URL(urlPath, 'https://launchforma.com'), {
    headers: { host: 'launchforma.com' },
  });
  return middleware(request);
}

function Probe({ filingLocale, href }: { filingLocale?: string | null; href: string }) {
  const router = useLocalizedRouter(filingLocale);
  router.push(href);
  router.replace(href);
  return null;
}

beforeEach(() => {
  nav.redirect.mockClear();
  nav.pushed.length = 0;
  nav.replaced.length = 0;
});

describe('default locale stays unprefixed', () => {
  it('keeps English hrefs from hrefForLocale unprefixed and Spanish under /es', () => {
    expect(hrefForLocale('/pricing', 'en')).toBe('/pricing');
    expect(hrefForLocale('/checkout/success?filing=abc', 'en')).toBe('/checkout/success?filing=abc');
    expect(hrefForLocale('/wizard/filing_1/2', 'en')).toBe('/wizard/filing_1/2');
    expect(hrefForLocale('/en/pricing?tier=BASIC', 'en')).toBe('/pricing?tier=BASIC');
    expect(hrefForLocale('/pricing', 'es')).toBe('/es/pricing');
    expect(hrefForLocale('/checkout/success?filing=abc', 'es')).toBe('/es/checkout/success?filing=abc');
    expect(hrefForLocale('/es/pricing', 'es')).toBe('/es/pricing');
    expect(hrefForLocale('/pricing', 'en')).not.toMatch(/\/en(\/|$)/);
    expect(source('lib/app-href.ts')).not.toContain('getPathname');
  });

  it('pushes and replaces English routes without /en, and keeps /es', () => {
    renderToStaticMarkup(createElement(Probe, { filingLocale: 'en', href: '/wizard/filing_1/2' }));
    renderToStaticMarkup(
      createElement(Probe, { filingLocale: 'en', href: '/checkout/success?filing=abc' }),
    );
    renderToStaticMarkup(createElement(Probe, { filingLocale: 'es', href: '/pricing' }));
    expect(nav.pushed).toEqual([
      '/wizard/filing_1/2',
      '/checkout/success?filing=abc',
      '/es/pricing',
    ]);
    expect(nav.replaced).toEqual(nav.pushed);
    expect(nav.pushed.join(' ')).not.toMatch(/\/en(\/|$)/);
    expect(localizedRouterHref('/pricing', 'en')).toBe('/pricing');
    expect(localizedRouterHref('/pricing', 'es')).toBe('/es/pricing');
    const hook = source('components/i18n/useLocalizedRouter.ts');
    expect(hook).toContain('localizedRouterHref(href, locale)');
    expect(hook).not.toContain('{ locale }');
    expect(hook).not.toContain('useIntlRouter');
  });

  it('redirects English paths without /en and keeps Spanish under /es', async () => {
    await expect(redirectLocalized('/pricing', 'en')).rejects.toThrow('NEXT_REDIRECT /pricing');
    await expect(redirectLocalized('/wizard/filing_1/2?incomplete=1', 'es')).rejects.toThrow(
      'NEXT_REDIRECT /es/wizard/filing_1/2?incomplete=1',
    );
    await expect(redirectLocalized('/en/dashboard', 'en')).rejects.toThrow('NEXT_REDIRECT /dashboard');
    expect(localizedRedirectHref('/checkout/success?filing=abc', 'en')).toBe(
      '/checkout/success?filing=abc',
    );
    expect(localizedRedirectHref('/pricing', 'es')).toBe('/es/pricing');
    expect(nav.redirect).toHaveBeenCalledWith('/pricing');
    expect(nav.redirect).toHaveBeenCalledWith('/es/wizard/filing_1/2?incomplete=1');
    expect(source('lib/locale-redirect.ts')).not.toContain('redirect({ href:');
  });

  it('308s /en and /en/* to the unprefixed path and keeps the query string', () => {
    const pricing = invoke('/en/pricing?tier=BASIC');
    expect(pricing.status).toBe(308);
    const pricingUrl = new URL(pricing.headers.get('location')!);
    expect(pricingUrl.pathname).toBe('/pricing');
    expect(pricingUrl.search).toBe('?tier=BASIC');

    const root = invoke('/en');
    expect(root.status).toBe(308);
    expect(new URL(root.headers.get('location')!).pathname).toBe('/');

    const wizard = invoke('/en/wizard/filing_1/2?incomplete=1');
    expect(wizard.status).toBe(308);
    const wizardUrl = new URL(wizard.headers.get('location')!);
    expect(wizardUrl.pathname).toBe('/wizard/filing_1/2');
    expect(wizardUrl.searchParams.get('incomplete')).toBe('1');

    const enterprise = invoke('/enterprise');
    expect(enterprise.status).not.toBe(308);
    expect(enterprise.headers.get('location')).toBeNull();

    const spanish = invoke('/es/pricing');
    expect(spanish.status).not.toBe(308);
  });
});

describe('registered guest email shows the sign-in prompt', () => {
  it('uses the existing account prompt in English and Spanish', () => {
    expect(en.wizard.accountGateSignIn).toMatch(/sign in/i);
    expect(es.wizard.accountGateSignIn).toMatch(/entra/i);
    expect(en.wizard.accountGateSignInButton.length).toBeGreaterThan(0);
    expect(es.wizard.accountGateSignInButton.length).toBeGreaterThan(0);
    expect(en.wizard.accountGateSignIn).not.toMatch(/\u2014|\u2013/);
    expect(es.wizard.accountGateSignIn).not.toMatch(/\u2014|\u2013/);
  });
});
