import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { messagesForPath } from '@/i18n/config';
import { routing } from '@/i18n/routing';
import {
  BUSINESS_ADDRESS,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
} from '@/lib/constants';
import { localizedPublicRedirect } from '@/lib/locale-paths';
import { organizationJsonLd } from '@/lib/organization-jsonld';
import { middleware } from '../../middleware';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function invoke(urlPath: string) {
  const headers = new Headers({ host: 'launchforma.com' });
  const request = new NextRequest(new URL(urlPath, 'https://launchforma.com'), { headers });
  return middleware(request);
}

describe('contact pathnames', () => {
  it('declares the Spanish slug in next-intl pathnames', () => {
    expect(routing.pathnames['/contact']).toEqual({ en: '/contact', es: '/contacto' });
  });

  it('308s the non-canonical slugs and rewrites /es/contacto to /contact', () => {
    expect(localizedPublicRedirect('/contacto')).toBe('/es/contacto');
    expect(localizedPublicRedirect('/contacto/')).toBe('/es/contacto');
    expect(localizedPublicRedirect('/es/contact')).toBe('/es/contacto');
    expect(localizedPublicRedirect('/es/contact/')).toBe('/es/contacto');
    expect(localizedPublicRedirect('/contact')).toBeNull();
    expect(localizedPublicRedirect('/es/contacto')).toBeNull();

    const bare = invoke('/contacto?utm_source=google');
    expect(bare.status).toBe(308);
    const bareLocation = new URL(bare.headers.get('location')!);
    expect(bareLocation.pathname).toBe('/es/contacto');
    expect(bareLocation.searchParams.get('utm_source')).toBe('google');

    const englishSlug = invoke('/es/contact');
    expect(englishSlug.status).toBe(308);
    expect(new URL(englishSlug.headers.get('location')!).pathname).toBe('/es/contacto');

    const spanish = invoke('/es/contacto');
    expect(spanish.status).toBe(200);
    expect(spanish.headers.get('x-middleware-request-x-lf-locale')).toBe('es');
    expect(spanish.headers.get('x-middleware-request-x-lf-public-path')).toBe('/es/contacto');
    const rewrite = spanish.headers.get('x-middleware-rewrite');
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe('/contact');

    const english = invoke('/contact');
    expect(english.status).toBe(200);
    expect(english.headers.get('x-middleware-request-x-lf-locale')).toBe('en');
    expect(english.headers.get('x-middleware-rewrite')).toBeNull();
  });
});

describe('contact page content', () => {
  const page = readFileSync(
    path.join(process.cwd(), 'app/(marketing)/contact/page.tsx'),
    'utf8',
  );
  const footer = readFileSync(
    path.join(process.cwd(), 'components/marketing/Footer.tsx'),
    'utf8',
  );

  it('reuses the inquiry form, the footer address, and the phone link', () => {
    expect(page).toContain('ServiceInquiryForm');
    expect(page).toContain('id="request"');
    expect(page).toContain('BUSINESS_ADDRESS');
    expect(page).toContain('CONTACT_PHONE_DISPLAY');
    expect(page).toContain('tel:${CONTACT_PHONE_E164}');
    expect(page).not.toContain('mailto:');
    expect(page).not.toContain('BUSINESS_EMAIL');
    expect(page).not.toContain('hello@');
    expect(page).not.toContain('support@');
    expect(page).not.toContain(BUSINESS_ADDRESS);
    expect(CONTACT_PHONE_DISPLAY).toBe('(844) 703-6762');
    expect(CONTACT_PHONE_E164).toBe('+18447036762');
    expect(footer).toContain("href('/contact')");
    expect(footer).not.toContain('/about#contact');
  });

  it('adds sitemap hreflang for /contact and /es/contacto', () => {
    const entries = sitemap();
    const enUrl = 'https://launchforma.com/contact';
    const esUrl = 'https://launchforma.com/es/contacto';
    const english = entries.find((entry) => entry.url === enUrl);
    const spanish = entries.find((entry) => entry.url === esUrl);
    const languages = { en: enUrl, es: esUrl, 'x-default': enUrl };
    expect(english?.alternates?.languages).toEqual(languages);
    expect(spanish?.alternates?.languages).toEqual(languages);
    expect(entries.map((entry) => entry.url)).not.toContain('https://launchforma.com/es/contact');
    expect(entries.map((entry) => entry.url)).not.toContain('https://launchforma.com/contacto');
  });

  it('puts the telephone on the Organization contactPoint and leaves email out', () => {
    const data = organizationJsonLd();
    expect(data.contactPoint).toEqual({
      '@type': 'ContactPoint',
      telephone: CONTACT_PHONE_E164,
      contactType: 'customer service',
      availableLanguage: ['English', 'Spanish'],
    });
    expect(JSON.stringify(data)).not.toMatch(/@launchforma\.com|mailto:/);

    const jsonLd = readFileSync(path.join(process.cwd(), 'components/seo/JsonLd.tsx'), 'utf8');
    expect(jsonLd).toContain('export { organizationJsonLd }');
    expect(jsonLd).not.toContain('hello@launchforma.com');
    expect(jsonLd).not.toContain('email:');
  });

  it('renders /contact and /es/contacto without an address or a mailto link', () => {
    // /es/contacto rewrites to /contact, so both locales share this provider path.
    for (const messages of [en, es]) {
      const html = renderedContactHtml(messages);
      expect(html).not.toMatch(/@launchforma\.com/);
      expect(html).not.toMatch(/mailto:/i);
      expect(html).toContain(CONTACT_PHONE_E164);
    }

    const otherPages = JSON.stringify(messagesForPath('/about', es));
    expect(otherPages).toContain('mailto:legal@launchforma.com');
    expect(otherPages).toContain('help@launchforma.com');
    expect(JSON.stringify(messagesForPath('/about', en))).toContain('help@launchforma.com');
  });

  it('keeps Spanish contact copy free of em dashes and en dashes', () => {
    const copy = (es as { contactPage: Record<string, string> }).contactPage;
    const english = (en as { contactPage: Record<string, string> }).contactPage;
    expect(copy.heading).toBe('Contacto');
    expect(english.heading).toBe('Contact');
    expect(JSON.stringify(copy)).not.toMatch(/—|–/);
    expect(JSON.stringify(english)).not.toMatch(/—|–/);
    expect(copy.intro).toMatch(/ll[aá]manos/i);
    expect(copy.intro).toContain('Te responde');
    expect(copy.metaDescription).toContain('Te responde');
    expect(copy.metaDescription).toContain('{phone}');
    expect(JSON.stringify(copy)).not.toContain('contesta');
  });
});

/** HTML that ships for /contact and /es/contacto: schema, client catalog, page copy. */
function renderedContactHtml(messages: typeof en) {
  const clientMessages = messagesForPath('/contact', messages);
  const pageCopy = Object.values(messages.contactPage).join('\n');
  return [
    `<script type="application/ld+json">${JSON.stringify(organizationJsonLd())}</script>`,
    `<script>${JSON.stringify(clientMessages)}</script>`,
    pageCopy,
  ].join('\n');
}
