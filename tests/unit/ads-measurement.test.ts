import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutAttributionMetadata } from '@/lib/checkout-attribution';
import {
  buildPurchaseCompletedCapture,
  posthogServerCaptureEnabled,
  posthogServerEventProperties,
  shouldCapturePaidTransition,
} from '@/lib/posthog-server';
import { distinctIdFromPosthogCookie, sanitizeDistinctId } from '@/lib/posthog-distinct-id';

function directive(source: string, name: string): string {
  const match = source.match(new RegExp(`"${name} [^"]+"`));
  if (!match) throw new Error(`missing ${name}`);
  return match[0];
}

describe('ads conversion CSP', () => {
  const source = readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');

  it('allows Google Ads, LinkedIn, PostHog, and the OpenAI pixel on the ping directives', () => {
    const img = directive(source, 'img-src');
    const connect = directive(source, 'connect-src');
    const script = directive(source, 'script-src');
    const frame = directive(source, 'frame-src');

    for (const host of [
      'https://ad.doubleclick.net',
      'https://*.doubleclick.net',
      'https://googleads.g.doubleclick.net',
      'https://www.googleadservices.com',
      'https://www.google.com',
      'https://px.ads.linkedin.com',
      'https://px4.ads.linkedin.com',
      'https://snap.licdn.com',
    ]) {
      expect(img).toContain(host);
      expect(connect).toContain(host);
      expect(frame).toContain(host);
    }

    for (const host of [
      'https://ad.doubleclick.net',
      'https://*.doubleclick.net',
      'https://googleads.g.doubleclick.net',
      'https://www.google.com',
      'https://www.googleadservices.com',
      'https://px.ads.linkedin.com',
      'https://snap.licdn.com',
    ]) {
      expect(script).toContain(host);
    }

    for (const host of ['https://us.i.posthog.com', 'https://us-assets.i.posthog.com']) {
      expect(script).toContain(host);
      expect(connect).toContain(host);
      expect(img).toContain(host);
    }

    for (const host of [
      'https://analytics.google.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
    ]) {
      expect(connect).toContain(host);
    }

    expect(img).toContain('https://pagead2.googlesyndication.com');
    expect(frame).toContain('https://www.googletagmanager.com');
    expect(script).toContain('https://bzrcdn.openai.com');
    expect(connect).toContain('https://bzr.openai.com');
    expect(connect).toContain('https://bzrcdn.openai.com');
    expect(img).toContain('https://bzr.openai.com');
    expect(directive(source, 'script-src')).not.toContain('unsafe-eval');
  });
});

describe('checkout attribution metadata', () => {
  it('copies cookie UTMs and the PostHog distinct id, with filing fallback', () => {
    expect(
      checkoutAttributionMetadata({
        cookie: { utm_source: 'google', utm_medium: 'cpc' },
        filing: {
          utmSource: 'old',
          utmCampaign: 'spring',
          utmContent: 'ad-1',
          utmTerm: 'llc',
        },
        posthogDistinctId: 'ph-user-1',
      }),
    ).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'spring',
      utm_content: 'ad-1',
      utm_term: 'llc',
      posthog_distinct_id: 'ph-user-1',
    });
  });

  it('drops empty and unsafe distinct ids', () => {
    expect(sanitizeDistinctId('  ')).toBeNull();
    expect(sanitizeDistinctId('bad\nid')).toBeNull();
    expect(distinctIdFromPosthogCookie(encodeURIComponent(JSON.stringify({ distinct_id: 'abc' })))).toBe(
      'abc',
    );
  });
});

describe('purchase_completed_server payload', () => {
  it('sends dollars, currency, order id, distinct id, and UTMs', () => {
    const body = buildPurchaseCompletedCapture(
      {
        id: 'pi_123',
        amount: 22400,
        currency: 'usd',
        created: 1_700_000_000,
        metadata: {
          filingId: 'filing_1',
          userId: 'user_1',
          posthog_distinct_id: 'ph-user-1',
          utm_source: 'linkedin',
          utm_medium: 'paid-social',
          utm_campaign: 'en-fl-llc',
          utm_content: 'creative-1',
          utm_term: 'form a llc',
        },
      },
      1_700_000_000_000,
    );

    expect(body).toMatchObject({
      event: 'purchase_completed_server',
      distinct_id: 'ph-user-1',
      context: { filing_id: 'filing_1' },
      properties: {
        order_id: 'filing_1',
        filing_id: 'filing_1',
        payment_intent_id: 'pi_123',
        amount: 224,
        currency: 'USD',
        $insert_id: 'filing_1',
        utm_source: 'linkedin',
        utm_medium: 'paid-social',
        utm_campaign: 'en-fl-llc',
        utm_content: 'creative-1',
        utm_term: 'form a llc',
        ...posthogServerEventProperties(),
      },
    });
    expect(body?.properties.is_internal).toBeUndefined();
  });

  it('falls back to the payment intent id when no filing id was stored', () => {
    const body = buildPurchaseCompletedCapture({ id: 'pi_abc', amount_received: 100, currency: 'usd' });
    expect(body?.distinct_id).toBe('pi_abc');
    expect(body?.context.filing_id).toBe('pi_abc');
    expect(body?.properties.order_id).toBe('pi_abc');
    expect(body?.properties.$insert_id).toBe('pi_abc');
    expect(body?.properties.amount).toBe(1);
  });

  it('marks internal buyers and skips a capture that did not insert the payment', () => {
    const body = buildPurchaseCompletedCapture(
      { id: 'pi_123', amount: 100, metadata: { filingId: 'filing_1' } },
      undefined,
      { internal: true },
    );
    expect(body?.properties.is_internal).toBe(true);
    expect(shouldCapturePaidTransition(true)).toBe(true);
    expect(shouldCapturePaidTransition(false)).toBe(false);
  });

  it('sends server captures only when VERCEL_ENV is production', () => {
    const previous = process.env.VERCEL_ENV;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'ph_test';
    process.env.VERCEL_ENV = 'preview';
    expect(posthogServerCaptureEnabled()).toBe(false);
    process.env.VERCEL_ENV = 'development';
    expect(posthogServerCaptureEnabled()).toBe(false);
    delete process.env.VERCEL_ENV;
    expect(posthogServerCaptureEnabled()).toBe(false);
    process.env.VERCEL_ENV = 'production';
    expect(posthogServerCaptureEnabled()).toBe(true);
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    if (key === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
  });
});
