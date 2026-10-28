import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adsDebugActive,
  adsSendTo,
  beginConversionStorageKey,
  isLaunchformaQaEmail,
  purchaseConversionStorageKey,
  purchasePayload,
  shouldSuppressAdsConversion,
} from '@/lib/ads-conversions';
import { hrefWithAttribution } from '@/lib/preserve-attribution';
import { trackGoogleBeginFiling, trackGooglePurchase } from '@/lib/analytics';

describe('ad conversion helpers', () => {
  it('suppresses testers, isTest filings, and qa+ launchforma mailboxes only', () => {
    expect(isLaunchformaQaEmail('qa+buyer@launchforma.com')).toBe(true);
    expect(isLaunchformaQaEmail('QA+Buyer@LaunchForma.com')).toBe(true);
    expect(isLaunchformaQaEmail('qa+@launchforma.com')).toBe(true);
    expect(isLaunchformaQaEmail('qa+buyer@gmail.com')).toBe(false);
    expect(isLaunchformaQaEmail('notqa+buyer@launchforma.com')).toBe(false);
    expect(shouldSuppressAdsConversion({ isTester: true })).toBe(true);
    expect(shouldSuppressAdsConversion({ isTest: true })).toBe(true);
    expect(shouldSuppressAdsConversion({ emails: ['qa+ada@launchforma.com'] })).toBe(true);
    expect(shouldSuppressAdsConversion({ emails: ['ada@example.com'] })).toBe(false);
  });

  it('builds the purchase payload in dollars and the send_to from env pieces', () => {
    expect(purchasePayload({ transactionId: ' filing_1 ', valueCents: 19900, currency: 'usd' })).toEqual({
      transaction_id: 'filing_1',
      value: 199,
      currency: 'USD',
    });
    expect(purchasePayload({ transactionId: ' ', valueCents: 100 })).toBeNull();
    expect(adsSendTo('AW-123', 'purchaseLabel')).toBe('AW-123/purchaseLabel');
    expect(adsSendTo('AW-123', '  ')).toBeNull();
    expect(adsSendTo(undefined, 'purchaseLabel')).toBeNull();
  });

  it('turns the debug flag on only for preview', () => {
    expect(adsDebugActive('?lf_ads_debug=1', 'preview')).toBe(true);
    expect(adsDebugActive('lf_ads_debug=1', 'production')).toBe(false);
    expect(adsDebugActive('', 'preview')).toBe(false);
  });

  it('keeps utm and gclid on the wizard href and does not replace tier', () => {
    expect(
      hrefWithAttribution('/start?tier=BASIC', 'utm_source=google&gclid=click1&tier=PREMIUM'),
    ).toBe('/start?tier=BASIC&utm_source=google&gclid=click1');
    expect(hrefWithAttribution('/wizard/filing_1/2', '')).toBe('/wizard/filing_1/2');
  });
});

describe('gtag conversion firing', () => {
  const envKeys = [
    'NEXT_PUBLIC_GOOGLE_ADS_ID',
    'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL',
    'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING',
    'NEXT_PUBLIC_VERCEL_ENV',
  ] as const;
  const previous: Record<string, string | undefined> = {};
  const store = new Map<string, string>();

  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function install(search = '') {
    for (const key of envKeys) previous[key] = process.env[key];
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = 'AW-123';
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL = 'purchaseLabel';
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING = 'beginLabel';
    const gtag = vi.fn();
    const info = vi.fn();
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('navigator', { globalPrivacyControl: false });
    vi.stubGlobal('console', { ...console, info });
    vi.stubGlobal('window', {
      gtag,
      location: { search },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    });
    return { gtag, info };
  }

  it('fires Filing Purchase once with value, currency, and transaction_id', () => {
    const { gtag } = install();
    trackGooglePurchase({ transactionId: 'filing_1', valueCents: 19900, currency: 'usd' });
    trackGooglePurchase({ transactionId: 'filing_1', valueCents: 19900, currency: 'usd' });
    const conversions = gtag.mock.calls.filter((call) => call[1] === 'conversion');
    const purchases = gtag.mock.calls.filter((call) => call[1] === 'purchase');
    expect(purchases).toHaveLength(1);
    expect(conversions).toHaveLength(1);
    expect(conversions[0]?.[2]).toEqual({
      send_to: 'AW-123/purchaseLabel',
      transaction_id: 'filing_1',
      value: 199,
      currency: 'USD',
    });
    expect(store.get(purchaseConversionStorageKey('filing_1'))).toBe('1');
  });

  it('fires Begin Filing once per filing with value 1 USD', () => {
    const { gtag } = install();
    trackGoogleBeginFiling({ filingId: 'filing_1', emails: ['ada@example.com'] });
    trackGoogleBeginFiling({ filingId: 'filing_1', emails: ['ada@example.com'] });
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-123/beginLabel',
      transaction_id: 'filing_1',
      value: 1,
      currency: 'USD',
    });
    expect(store.get(beginConversionStorageKey('filing_1'))).toBe('1');
    trackGoogleBeginFiling({ filingId: 'filing_2' });
    expect(gtag).toHaveBeenCalledTimes(2);
  });

  it('does not send Begin Filing without a filing id or when the label is missing', () => {
    const { gtag } = install();
    trackGoogleBeginFiling({ emails: ['ada@example.com'] });
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING;
    trackGoogleBeginFiling({ filingId: 'filing_1' });
    expect(gtag).not.toHaveBeenCalled();
  });

  it('suppresses test users and logs the payload on preview instead of sending', () => {
    const { gtag, info } = install('?lf_ads_debug=1');
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
    trackGooglePurchase({
      transactionId: 'filing_qa',
      valueCents: 19900,
      isTester: true,
      email: 'qa+buyer@launchforma.com',
    });
    trackGoogleBeginFiling({
      filingId: 'filing_qa',
      isTest: true,
      email: 'qa+buyer@launchforma.com',
    });
    expect(gtag).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
    expect(store.has(purchaseConversionStorageKey('filing_qa'))).toBe(false);
    expect(store.has(beginConversionStorageKey('filing_qa'))).toBe(false);
  });

  it('suppresses a qa mailbox with no debug log outside preview', () => {
    const { gtag, info } = install();
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    trackGooglePurchase({
      transactionId: 'filing_qa',
      valueCents: 34900,
      email: 'qa+buyer@launchforma.com',
    });
    expect(gtag).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});
