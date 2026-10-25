import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import {
  trackGoogleLead,
  trackGooglePurchase,
  trackOpenAiLead,
} from '@/lib/analytics';
import {
  AD_OPT_OUT_COOKIE,
  AD_OPT_OUT_GPC_VALUE,
  AD_OPT_OUT_MAX_AGE,
  adOptOutCookieValue,
  gpcCookieDecision,
  isAdMeasurementOptedOut,
  serializeAdOptOutCookie,
  serializeGpcDerivedCookie,
  shouldInjectAdScripts,
} from '@/lib/ad-opt-out';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function invoke(urlPath: string, extra?: Record<string, string>, cookie?: string) {
  const headers = new Headers({ host: 'launchforma.com', ...extra });
  if (cookie) headers.set('cookie', cookie);
  const request = new NextRequest(new URL(urlPath, 'https://launchforma.com'), { headers });
  return middleware(request);
}

describe('ad measurement opt-out decision', () => {
  it('treats the cookie, the Sec-GPC header, and the navigator flag as an opt-out', () => {
    expect(isAdMeasurementOptedOut({})).toBe(false);
    expect(shouldInjectAdScripts({})).toBe(true);

    expect(isAdMeasurementOptedOut({ cookie: '1' })).toBe(true);
    expect(shouldInjectAdScripts({ cookie: '1' })).toBe(false);
    expect(isAdMeasurementOptedOut({ cookie: 'gpc' })).toBe(false);
    expect(shouldInjectAdScripts({ cookie: 'gpc' })).toBe(true);
    expect(shouldInjectAdScripts({ cookie: 'gpc', secGpc: '1' })).toBe(false);
    expect(isAdMeasurementOptedOut({ cookie: '0' })).toBe(false);
    expect(isAdMeasurementOptedOut({ cookie: null })).toBe(false);

    expect(isAdMeasurementOptedOut({ secGpc: '1' })).toBe(true);
    expect(shouldInjectAdScripts({ secGpc: '1', cookie: null })).toBe(false);
    expect(isAdMeasurementOptedOut({ secGpc: '0' })).toBe(false);
    expect(isAdMeasurementOptedOut({ secGpc: null })).toBe(false);

    expect(isAdMeasurementOptedOut({ serverGpc: true })).toBe(true);
    expect(shouldInjectAdScripts({ serverGpc: true, cookie: null })).toBe(false);

    expect(isAdMeasurementOptedOut({ globalPrivacyControl: true })).toBe(true);
    expect(shouldInjectAdScripts({ globalPrivacyControl: true, cookie: null })).toBe(false);
    expect(isAdMeasurementOptedOut({ globalPrivacyControl: false })).toBe(false);

    expect(adOptOutCookieValue('theme=dark; lf_ad_optout=1; other=1')).toBe('1');
    expect(adOptOutCookieValue('lf_ad_optout_extra=1')).toBeNull();
    expect(adOptOutCookieValue('lf_ad_optout=')).toBeNull();
    expect(isAdMeasurementOptedOut({ cookie: adOptOutCookieValue('a=b; lf_ad_optout=1') })).toBe(true);
  });

  it('stores a 1-year SameSite=Lax cookie and adds Secure only when asked', () => {
    expect(AD_OPT_OUT_COOKIE).toBe('lf_ad_optout');
    expect(AD_OPT_OUT_MAX_AGE).toBe(60 * 60 * 24 * 365);
    const secure = serializeAdOptOutCookie(true, true);
    expect(secure).toBe(
      `lf_ad_optout=1; Path=/; Max-Age=${AD_OPT_OUT_MAX_AGE}; SameSite=Lax; Secure`,
    );
    expect(serializeAdOptOutCookie(true, false)).toBe(
      `lf_ad_optout=1; Path=/; Max-Age=${AD_OPT_OUT_MAX_AGE}; SameSite=Lax`,
    );
    expect(serializeAdOptOutCookie(false, true)).toContain('Max-Age=0');
    expect(serializeAdOptOutCookie(false, true)).toContain('Secure');
    expect(serializeAdOptOutCookie(false, false)).not.toContain('Secure');
    const gpcCookie = serializeGpcDerivedCookie(false);
    expect(gpcCookie).toBe('lf_ad_optout=gpc; Path=/; SameSite=Lax');
    expect(gpcCookie).not.toContain('Max-Age');
    expect(serializeGpcDerivedCookie(true)).toContain('Secure');
  });

  it('records GPC as lf_ad_optout=gpc and clears that marker when the signal is gone', () => {
    expect(gpcCookieDecision(null, true)).toBe('set-gpc');
    expect(gpcCookieDecision('gpc', true)).toBe('leave');
    expect(gpcCookieDecision('gpc', false)).toBe('clear');
    expect(gpcCookieDecision('1', true)).toBe('leave');
    expect(gpcCookieDecision('1', false)).toBe('leave');
    expect(gpcCookieDecision(null, false)).toBe('leave');
    expect(AD_OPT_OUT_GPC_VALUE).toBe('gpc');

    const opted = invoke('/pricing', { 'sec-gpc': '1' });
    const setCookie = opted.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('lf_ad_optout=gpc');
    expect(setCookie).not.toContain('lf_ad_optout=1');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie.toLowerCase()).not.toContain('httponly');
    expect(setCookie.toLowerCase()).not.toContain('secure');
    expect(setCookie.toLowerCase()).not.toContain('max-age');

    const redirect = invoke('/contacto', { 'sec-gpc': '1' });
    expect(redirect.status).toBe(308);
    const redirectCookie = redirect.headers.get('set-cookie') ?? '';
    expect(redirectCookie).toContain('lf_ad_optout=gpc');
    expect(redirectCookie).not.toContain('lf_ad_optout=1');

    const plain = invoke('/pricing');
    expect(plain.headers.get('set-cookie') ?? '').not.toContain('lf_ad_optout');

    const cleared = invoke('/pricing', undefined, 'lf_ad_optout=gpc');
    const clearedCookie = cleared.headers.get('set-cookie') ?? '';
    expect(clearedCookie.toLowerCase()).toContain('lf_ad_optout=');
    expect(clearedCookie.toLowerCase()).toContain('max-age=0');
    expect(clearedCookie).not.toContain('lf_ad_optout=gpc');
    expect(clearedCookie).not.toContain('lf_ad_optout=1');

    const manualWhileGpc = invoke('/pricing', { 'sec-gpc': '1' }, 'lf_ad_optout=1');
    expect(manualWhileGpc.headers.get('set-cookie') ?? '').not.toContain('lf_ad_optout');

    const manualAfterGpc = invoke('/pricing', undefined, 'theme=dark; lf_ad_optout=1');
    expect(manualAfterGpc.headers.get('set-cookie') ?? '').not.toContain('lf_ad_optout');
  });
});

describe('analytics no-ops when opted out', () => {
  const envKeys = [
    'NEXT_PUBLIC_GOOGLE_ADS_ID',
    'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL',
    'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_LEAD',
  ] as const;
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function install(opts: { cookie?: string; gpc?: boolean }) {
    for (const key of envKeys) previous[key] = process.env[key];
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = 'AW-123';
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL = 'purchaseLabel';
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_LEAD = 'leadLabel';
    const gtag = vi.fn();
    const oaiq = vi.fn();
    vi.stubGlobal('document', { cookie: opts.cookie ?? '' });
    vi.stubGlobal('navigator', { globalPrivacyControl: Boolean(opts.gpc) });
    vi.stubGlobal('window', {
      gtag,
      oaiq,
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    });
    return { gtag, oaiq };
  }

  function fireAll() {
    trackGooglePurchase({ transactionId: 'tx_1', valueCents: 10000 });
    trackGoogleLead({ service: 'ra' });
    trackOpenAiLead();
  }

  it('sends purchase, lead, and OpenAI events when the visitor has not opted out', () => {
    const { gtag, oaiq } = install({ cookie: 'lf_utm=%7B%7D' });
    fireAll();
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'purchase',
      expect.objectContaining({ transaction_id: 'tx_1', value: 100, currency: 'USD' }),
    );
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'conversion',
      expect.objectContaining({ send_to: 'AW-123/purchaseLabel', transaction_id: 'tx_1' }),
    );
    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', { service: 'ra' });
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', { send_to: 'AW-123/leadLabel' });
    expect(oaiq).toHaveBeenCalledWith('measure', 'lead_created', { type: 'customer_action' });
  });

  it('does not call gtag or the OpenAI pixel when the opt-out cookie is set', () => {
    const { gtag, oaiq } = install({ cookie: 'theme=1; lf_ad_optout=1' });
    fireAll();
    expect(gtag).not.toHaveBeenCalled();
    expect(oaiq).not.toHaveBeenCalled();
  });

  it('does not call gtag or the OpenAI pixel when the navigator GPC flag is set', () => {
    const { gtag, oaiq } = install({ gpc: true, cookie: '' });
    fireAll();
    expect(gtag).not.toHaveBeenCalled();
    expect(oaiq).not.toHaveBeenCalled();
  });
});

describe('privacy policy text', () => {
  it('publishes the approved English and Spanish copy with the generic email line', () => {
    const page = readFileSync('app/(legal)/privacy/page.tsx', 'utf8');
    expect(page).not.toContain('LegalDraftNotice');
    expect(page).toContain('Effective October 25, 2026');
    expect(page).toContain(
      '**Google (Gmail / Google Workspace), our email delivery provider**: to send transactional emails and, if you sign up, our newsletter and checklist emails.',
    );
    expect(page).not.toContain('Resend');
    expect(page).not.toContain('SendGrid');
    expect(page).not.toContain('CHANGED');
    expect(page).not.toContain('TBD');
    expect(page).not.toContain('—');
    expect(page).toContain('lf_ad_optout');
    expect(page).toContain(
      'We do not currently respond to Do Not Track signals, but we do honor Global Privacy Control (see Section 6).',
    );
    expect(page).toContain(
      'LaunchForma Privacy Policy: what we collect, why, who we share it with, how we use analytics and ad measurement, and how to exercise your GDPR / CCPA rights.',
    );

    expect(es.legalPrivacy.effective).toBe('Vigente desde el 25 de octubre de 2026');
    expect(es.legalPrivacy.metaDescription).toBe(
      'Política de privacidad de LaunchForma: qué recopilamos, para qué, con quién lo compartimos, cómo usamos la analítica y la medición de anuncios, y cómo ejercer tus derechos de GDPR y CCPA.',
    );
    expect(es.legalPrivacy.body).toContain(
      '**Google (Gmail / Google Workspace), nuestro proveedor de envío de correo**: para enviar correos transaccionales y, si te suscribes, nuestro boletín y los correos de la lista de verificación.',
    );
    expect(es.legalPrivacy.body).not.toContain('Resend');
    expect(es.legalPrivacy.body).not.toContain('SendGrid');
    expect(es.legalPrivacy.body).not.toContain('—');
    expect(es.legalPrivacy.body).toContain('lf_ad_optout');
    expect(es.legalPrivacy.body).toContain('consulta la Sección 6');
    expect(es.footer.doNotSell).toBe('No vender ni compartir mi información personal');
    expect(en.footer.doNotSell).toBe('Do Not Sell or Share My Personal Information');
    expect(en.privacyChoices.gpc).toBe("GPC signal detected, you're opted out");

    expect(readFileSync('app/(legal)/disclaimer/page.tsx', 'utf8')).toContain('LegalDraftNotice');
    expect(readFileSync('app/(legal)/terms/page.tsx', 'utf8')).toContain('LegalDraftNotice');
    expect(readFileSync('app/(legal)/refund-policy/page.tsx', 'utf8')).toContain('LegalDraftNotice');

    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain('<AdMeasurementGate');
    expect(layout).toContain('serverGpc');
    expect(layout).toContain('serverCookie');
    expect(layout).not.toContain('googletagmanager.com');
    expect(layout).not.toContain('google-analytics.com');
    expect(layout).not.toContain('bzrcdn.openai.com');
    expect(layout).toContain('<Analytics />');
    expect(layout).toContain('PostHogProvider');
  });
});
