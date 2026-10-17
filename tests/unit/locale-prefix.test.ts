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
    });
    expect(slim).not.toHaveProperty('offer');
    expect(messagesForPath('/pricing', messages)).not.toHaveProperty('dashboard');
    expect(messagesForPath('/pricing', messages)).toHaveProperty('offer');
  });

  it('rewrites a prefixed path and leaves ordinary paths alone', () => {
    expect(stripSpanishPrefix('/es/business-services')).toBe('/business-services');
    expect(stripSpanishPrefix('/es/offer')).toBe('/offer');
    expect(stripSpanishPrefix('/business-services')).toBeNull();
    expect(stripSpanishPrefix('/services')).toBeNull();
    expect(stripSpanishPrefix('/estimate')).toBeNull();
  });
});
