import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { landingStartTier } from '@/lib/lp-tier';
import { tierPackagePriceCents } from '@/lib/pricing';

const openGuestDraft = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn((_name: string) => null as string | null));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: () => ({ get: (name: string) => headerGet(name) }),
  cookies: () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/auth', () => ({ auth: async () => null }));
vi.mock('@/lib/ads-actor', () => ({
  adsActorForUser: async () => ({ email: null, isTester: false }),
}));
vi.mock('@/lib/marketing-faq', () => ({ getMarketingFaq: () => [] }));
vi.mock('@/components/marketing/FAQSection', () => ({ FAQSection: () => null }));
vi.mock('@/components/marketing/GovDisclosure', () => ({ GovDisclosure: () => null }));
vi.mock('@/components/seo/JsonLd', () => ({
  JsonLd: () => null,
  faqPageJsonLd: () => ({}),
}));
vi.mock('@/actions/guest-start', () => ({ openGuestDraft }));
vi.mock('@/actions/checklist-signup', () => ({
  captureChecklistSignup: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children?: ReactNode }) => children ?? null,
}));

import FloridaLlcLandingPage from '@/app/(marketing)/lp/florida-llc/page';
import { FloridaLlcLanding, submitFloridaLlcLanding } from '@/components/marketing/FloridaLlcLanding';

const EN_SEARCH = '?utm_source=google&utm_medium=cpc&utm_campaign=qa_pr103&tier=STANDARD';

function findInitialTier(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const el = node as {
    type?: { name?: string };
    props?: { initialTier?: string; children?: unknown };
  };
  if (el.type === FloridaLlcLanding || el.type?.name === 'FloridaLlcLanding') {
    return el.props?.initialTier;
  }
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findInitialTier(child);
      if (found) return found;
    }
  } else if (children) {
    return findInitialTier(children);
  }
  return undefined;
}

describe('English landing passes tier=STANDARD into openGuestDraft', () => {
  beforeEach(() => {
    openGuestDraft.mockReset();
    openGuestDraft.mockResolvedValue({ redirectTo: '/wizard/filing_en/2' });
    headerGet.mockReset();
    headerGet.mockImplementation((name: string) => (name === 'x-lf-search' ? EN_SEARCH : null));
  });

  it('reads tier from the English page query and from the forwarded search header', async () => {
    const withProps = await FloridaLlcLandingPage({
      searchParams: {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'qa_pr103',
        tier: 'STANDARD',
      },
    });
    expect(findInitialTier(withProps)).toBe('STANDARD');

    const fromHeader = await FloridaLlcLandingPage({ searchParams: {} });
    expect(findInitialTier(fromHeader)).toBe('STANDARD');
  });

  it('submits STANDARD when the form field and the English URL say STANDARD', async () => {
    const html = renderToStaticMarkup(
      createElement(FloridaLlcLanding, {
        attributionSearch: EN_SEARCH,
        initialTier: undefined,
        floridaNote: 'Florida only',
        stateName: 'Florida',
        trustLines: ['Licensed'],
      }),
    );
    expect(html).toContain('name="tier"');

    const tier = landingStartTier(null, EN_SEARCH);
    expect(tier).toBe('STANDARD');
    expect(tierPackagePriceCents(tier, 'LLC', 'FL')).toBe(34_900);

    await submitFloridaLlcLanding({
      tier,
      businessName: 'Northwind',
      browserPath: '/lp/florida-llc',
    });
    expect(openGuestDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'STANDARD',
        state: 'FL',
        entityType: 'LLC',
        businessName: 'Northwind',
        browserPath: '/lp/florida-llc',
        returnRedirect: true,
      }),
    );
  });

  it('keeps the URL tier when a stale Basic value is not the address bar', async () => {
    const tier = landingStartTier(null, EN_SEARCH);
    expect(landingStartTier('PREMIUM', EN_SEARCH)).toBe('PREMIUM');
    expect(landingStartTier(null, '?utm_source=google&utm_medium=cpc&utm_campaign=x')).toBe('BASIC');
    expect(landingStartTier(null, '?tier=nope')).toBe('BASIC');
    expect(tier).toBe('STANDARD');
    await submitFloridaLlcLanding({
      tier,
      businessName: 'Northwind',
      browserPath: '/lp/florida-llc',
    });
    expect(openGuestDraft).toHaveBeenCalledWith(expect.objectContaining({ tier: 'STANDARD' }));
  });
});
