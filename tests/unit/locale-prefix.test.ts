import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { messagesForPath, stripSpanishPrefix } from '@/i18n/config';

describe('stripSpanishPrefix', () => {
  it('rewrites /es and /es/ to the homepage', () => {
    expect(stripSpanishPrefix('/es')).toBe('/');
    expect(stripSpanishPrefix('/es/')).toBe('/');
  });

  it('limits the business-services payload to the namespaces that page renders', () => {
    const messages = {
      businessServices: { headline: 'Docs' },
      disclosure: { notAffiliatedServices: 'Private company' },
      footer: { terms: 'Terms' },
      common: { appName: 'LaunchForma' },
      offer: { headline1: 'Form your business' },
      pricing: { footnote: 'state fee' },
      dashboard: { title: 'hidden' },
    };
    const slim = messagesForPath('/business-services', messages);
    expect(slim.disclosure).toEqual({ notAffiliatedServices: 'Private company' });
    expect(slim.footer).toEqual({
      terms: 'Terms',
      privacy: '',
      refundPolicy: '',
      disclaimer: '',
      doNotSell: '',
    });
    expect(slim).not.toHaveProperty('offer');
    expect(messagesForPath('/pricing', messages)).not.toHaveProperty('dashboard');
    expect(messagesForPath('/pricing', messages)).toHaveProperty('offer');
  });

  it('limits the contact page to the client namespaces that page renders', () => {
    const messages = {
      assistant: { title: 'Chat' },
      businessServices: { submit: 'Send' },
      disclosure: { notAffiliated: 'Private' },
      footer: { contact: 'Contact' },
      nav: { pricing: 'Pricing' },
      common: { skipToContent: 'Skip to main content' },
      legalTerms: { body: 'mailto:legal@launchforma.com' },
      auth: { sidePanelSocial: 'help@launchforma.com' },
      offer: { headline1: 'Form your business' },
    };
    const slim = messagesForPath('/contact', messages);
    expect(Object.keys(slim).sort()).toEqual([
      'assistant',
      'businessServices',
      'common',
      'disclosure',
      'footer',
      'nav',
    ]);
    expect(slim.common).toEqual({ skipToContent: 'Skip to main content' });
    const compliance = readFileSync('app/(compliance-landing)/layout.tsx', 'utf8');
    expect(compliance).toContain('<SkipLink label={t(\'skip\')} />');
    expect(messagesForPath('/business-services', messages)).not.toHaveProperty('common');
    expect(JSON.stringify(slim)).not.toMatch(/@launchforma\.com|mailto:/);
    expect(messagesForPath('/about', messages)).toHaveProperty('legalTerms');
    expect(messagesForPath('/about', messages)).toHaveProperty('offer');
  });

  it('rewrites a prefixed path and leaves ordinary paths alone', () => {
    expect(stripSpanishPrefix('/es/business-services')).toBe('/business-services');
    expect(stripSpanishPrefix('/es/business-services/thank-you')).toBe(
      '/business-services/thank-you',
    );
    expect(stripSpanishPrefix('/es/offer')).toBe('/offer');
    expect(stripSpanishPrefix('/business-services')).toBeNull();
    expect(stripSpanishPrefix('/services')).toBeNull();
    expect(stripSpanishPrefix('/estimate')).toBeNull();
  });
});
