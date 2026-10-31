import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginConversionStorageKey, purchaseConversionStorageKey } from '@/lib/ads-conversions';
import { applyGoogleConsent } from '@/lib/google-consent';
import {
  clearPendingAdsQueueForTests,
  flushPendingAdsConversions,
  trackGoogleBeginFiling,
  trackGooglePurchase,
} from '@/lib/analytics';

describe('ads conversion queue', () => {
  const envKeys = ['NEXT_PUBLIC_GOOGLE_ADS_ID', 'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL', 'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING', 'NEXT_PUBLIC_VERCEL_ENV', 'VERCEL_ENV'] as const;
  const previous: Record<string, string | undefined> = {};
  const local = new Map<string, string>();
  const session = new Map<string, string>();

  afterEach(() => {
    clearPendingAdsQueueForTests();
    vi.unstubAllGlobals();
    local.clear();
    session.clear();
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function install(options?: { search?: string; pathname?: string; gtag?: boolean }) {
    for (const key of envKeys) previous[key] = process.env[key];
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = 'AW-123';
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL = 'purchaseLabel';
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING = 'beginLabel';
    const gtag = vi.fn();
    const info = vi.fn();
    const sessionStorage = {
      get length() {
        return session.size;
      },
      key(index: number) {
        return [...session.keys()][index] ?? null;
      },
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => {
        session.set(key, value);
      },
      removeItem: (key: string) => {
        session.delete(key);
      },
    };
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('navigator', { globalPrivacyControl: false });
    vi.stubGlobal('console', { ...console, info });
    vi.stubGlobal('window', {
      ...(options?.gtag === false ? {} : { gtag }),
      location: { search: options?.search ?? '', pathname: options?.pathname ?? '/' },
      localStorage: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => {
          local.set(key, value);
        },
      },
      sessionStorage,
    });
    return { gtag, info, window: window as Window & { gtag?: (...args: unknown[]) => void } };
  }

  it('fires a stored purchase once when gtag exists, without Accept', () => {
    const { gtag, window: win } = install({ pathname: '/checkout/success', gtag: false });
    trackGooglePurchase({
      transactionId: 'filing_1',
      valueCents: 19900,
      currency: 'usd',
      email: 'buyer@example.com',
    });
    expect(gtag).not.toHaveBeenCalled();
    expect([...session.keys()].some((key) => key.includes('filing_1'))).toBe(true);

    clearPendingAdsQueueForTests();
    win.gtag = gtag;
    flushPendingAdsConversions();
    flushPendingAdsConversions();

    const purchases = gtag.mock.calls.filter((call) => call[1] === 'purchase');
    const conversions = gtag.mock.calls.filter((call) => call[1] === 'conversion');
    expect(purchases).toHaveLength(1);
    expect(conversions).toHaveLength(1);
    expect(conversions[0]?.[2]).toMatchObject({
      send_to: 'AW-123/purchaseLabel',
      transaction_id: 'filing_1',
      value: 199,
      currency: 'USD',
    });
    expect(local.get(purchaseConversionStorageKey('filing_1'))).toBe('1');
    expect(session.size).toBe(0);
  });

  it('keeps a begin_filing hit in sessionStorage until gtag exists, then sends it once', () => {
    const { gtag, window: win } = install({ gtag: false });
    trackGoogleBeginFiling({ filingId: 'filing_1' });
    expect(gtag).not.toHaveBeenCalled();
    expect([...session.keys()].some((key) => key.includes('lf_ads_begin:filing_1'))).toBe(true);

    clearPendingAdsQueueForTests();
    expect([...session.keys()].some((key) => key.includes('filing_1'))).toBe(true);

    win.gtag = gtag;
    flushPendingAdsConversions();
    flushPendingAdsConversions();
    applyGoogleConsent('granted');

    const conversions = gtag.mock.calls.filter((call) => call[1] === 'conversion');
    expect(conversions).toHaveLength(1);
    expect(conversions[0]?.[2]).toMatchObject({
      send_to: 'AW-123/beginLabel',
      transaction_id: 'filing_1',
      value: 1,
      currency: 'USD',
    });
    expect(local.get(beginConversionStorageKey('filing_1'))).toBe('1');
    expect([...session.keys()].some((key) => key.startsWith('lf_ads_pending:'))).toBe(false);
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
  });

  it('fires begin_filing immediately in the denied state and does not send it again', () => {
    const { gtag } = install({ gtag: true });
    trackGoogleBeginFiling({ filingId: 'filing_1' });
    trackGooglePurchase({ transactionId: 'filing_1', valueCents: 19900, currency: 'usd' });
    applyGoogleConsent('granted');
    flushPendingAdsConversions();
    trackGoogleBeginFiling({ filingId: 'filing_1' });
    trackGooglePurchase({ transactionId: 'filing_1', valueCents: 19900, currency: 'usd' });

    const conversions = gtag.mock.calls.filter((call) => call[1] === 'conversion');
    const purchases = gtag.mock.calls.filter((call) => call[1] === 'purchase');
    expect(purchases).toHaveLength(1);
    expect(conversions).toHaveLength(2);
    expect(conversions.map((call) => (call[2] as { send_to?: string }).send_to).sort()).toEqual([
      'AW-123/beginLabel',
      'AW-123/purchaseLabel',
    ]);
    expect(session.size).toBe(0);
  });

  it('blocks a tester on production even with the debug flag', () => {
    const { gtag } = install({ search: '?lf_ads_debug=1', gtag: true });
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    window.sessionStorage.setItem('lf_ads_debug', '1');
    trackGooglePurchase({
      transactionId: 'filing_qa',
      valueCents: 19900,
      isTester: true,
      email: 'qa+buyer@launchforma.com',
    });
    trackGoogleBeginFiling({
      filingId: 'filing_qa',
      isTester: true,
      email: 'qa+buyer@launchforma.com',
    });
    flushPendingAdsConversions();
    expect(gtag).not.toHaveBeenCalled();
    expect(local.size).toBe(0);
  });

  it('lets a tester conversion fire on preview only, with an lfdebug transaction id', () => {
    const { gtag, info } = install({ search: '?lf_ads_debug=1', gtag: true });
    process.env.VERCEL_ENV = 'preview';
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
    trackGoogleBeginFiling({
      filingId: 'filing_qa',
      isTester: true,
      email: 'qa+buyer@launchforma.com',
    });
    const conversions = gtag.mock.calls.filter((call) => call[1] === 'conversion');
    expect(conversions).toHaveLength(1);
    expect(conversions[0]?.[2]).toMatchObject({
      send_to: 'AW-123/beginLabel',
      transaction_id: 'lfdebug-filing_qa',
      value: 1,
      currency: 'USD',
    });
    expect(info).toHaveBeenCalledWith('AW-123/beginLabel');

    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    trackGooglePurchase({
      transactionId: 'filing_qa',
      valueCents: 34900,
      isTester: true,
    });
    expect(gtag.mock.calls.filter((call) => call[1] === 'purchase')).toHaveLength(0);
  });
});
