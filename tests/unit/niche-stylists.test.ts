import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AbstractIntlMessages } from 'next-intl';
import sitemap from '@/app/sitemap';
import { NicheStylistsPage } from '@/components/marketing/NicheStylistsPage';
import { omitNicheClientMessages } from '@/i18n/config';
import { routing } from '@/i18n/routing';
import { buildLlmsTxt } from '@/lib/llms';
import {
  englishPathname,
  localizedPublicRedirect,
  pathForLocale,
  toSpanishUrl,
} from '@/lib/locale-paths';
import {
  faqAnswerText,
  nicheBundleBlockEnabled,
  nicheMetadataAlternates,
  nicheVisibleFaq,
  NICHE_STYLISTS_EN_PATH,
  NICHE_STYLISTS_EN_URL,
  NICHE_STYLISTS_ES_PATH,
  NICHE_STYLISTS_ES_URL,
  readNicheBundleCopy,
  readNicheStylistsCopy,
  type NicheStylistsCopy,
} from '@/lib/niche-stylists';
import { middleware } from '../../middleware';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const EN_PATH = '/llc-for/stylists-barbers';
const ES_PATH = '/es/llc-para/estilistas-barberos';

function translator(messages: Record<string, string>) {
  return (key: string) => {
    const value = messages[key];
    if (typeof value !== 'string') throw new Error(`missing ${key}`);
    return value;
  };
}

function render(copy: NicheStylistsCopy, bundle: { title: string; body: string } | null) {
  const html = renderToStaticMarkup(createElement(NicheStylistsPage, { copy, bundle }));
  return { html, $: load(html) };
}

function invoke(urlPath: string) {
  const headers = new Headers({ host: 'launchforma.com' });
  const request = new NextRequest(new URL(urlPath, 'https://launchforma.com'), { headers });
  return middleware(request);
}

describe('stylists and barbers locale routing', () => {
  it('maps the English path to the Spanish slug and back', () => {
    expect(routing.pathnames[EN_PATH]).toEqual({
      en: EN_PATH,
      es: '/llc-para/estilistas-barberos',
    });
    expect(toSpanishUrl(EN_PATH)).toBe(ES_PATH);
    expect(pathForLocale(EN_PATH, 'es')).toBe(ES_PATH);
    expect(pathForLocale(ES_PATH, 'en')).toBe(EN_PATH);
    expect(pathForLocale(`${ES_PATH}?utm_source=ig`, 'en')).toBe(`${EN_PATH}?utm_source=ig`);
    expect(englishPathname(ES_PATH)).toBe(EN_PATH);
    expect(NICHE_STYLISTS_EN_PATH).toBe(EN_PATH);
    expect(NICHE_STYLISTS_ES_PATH).toBe(ES_PATH);
  });

  it('rewrites the Spanish URL and 308s the non-canonical slugs', () => {
    expect(localizedPublicRedirect(EN_PATH)).toBeNull();
    expect(localizedPublicRedirect(ES_PATH)).toBeNull();
    expect(localizedPublicRedirect('/llc-para/estilistas-barberos')).toBe(ES_PATH);
    expect(localizedPublicRedirect('/es/llc-for/stylists-barbers')).toBe(ES_PATH);

    const spanish = invoke(ES_PATH);
    expect(spanish.status).toBe(200);
    expect(spanish.headers.get('x-middleware-request-x-lf-locale')).toBe('es');
    expect(spanish.headers.get('x-middleware-request-x-lf-public-path')).toBe(ES_PATH);
    const rewrite = spanish.headers.get('x-middleware-rewrite');
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe(EN_PATH);

    const english = invoke(EN_PATH);
    expect(english.status).toBe(200);
    expect(english.headers.get('x-middleware-request-x-lf-locale')).toBe('en');
    expect(english.headers.get('x-middleware-rewrite')).toBeNull();

    const bareSpanish = invoke('/llc-para/estilistas-barberos');
    expect(bareSpanish.status).toBe(308);
    expect(new URL(bareSpanish.headers.get('location')!).pathname).toBe(ES_PATH);

    const englishUnderEs = invoke('/es/llc-for/stylists-barbers');
    expect(englishUnderEs.status).toBe(308);
    expect(new URL(englishUnderEs.headers.get('location')!).pathname).toBe(ES_PATH);
  });

  it('self-canonicalizes each URL and points x-default at English', () => {
    expect(nicheMetadataAlternates('en')).toEqual({
      canonical: NICHE_STYLISTS_EN_URL,
      languages: {
        en: NICHE_STYLISTS_EN_URL,
        es: NICHE_STYLISTS_ES_URL,
        'x-default': NICHE_STYLISTS_EN_URL,
      },
    });
    expect(nicheMetadataAlternates('es').canonical).toBe(NICHE_STYLISTS_ES_URL);
    expect(nicheMetadataAlternates('es').languages).toEqual(nicheMetadataAlternates('en').languages);
  });
});

describe('stylists and barbers copy', () => {
  const enCopy = readNicheStylistsCopy(translator(en.nicheStylists), 'en');
  const esCopy = readNicheStylistsCopy(translator(es.nicheStylists), 'es');
  const enBundle = readNicheBundleCopy(translator(en.nicheStylists));

  it('keeps the supplied wording, with no em dashes and no tracking params', () => {
    expect(enCopy.metaTitle).toBe('LLC for Stylists and Barbers in Florida | $149 Essential');
    expect(enCopy.metaDescription).toBe(
      'Form your Florida LLC for your chair, booth or shop. Essential is $149 and includes the $125 state fee. Built for stylists and barbers. Start today.',
    );
    expect(enCopy.h1).toBe('Your chair. Your clients. Your business.');
    expect(enCopy.subhead).toBe(
      'You already run a business every time you rent the chair, buy the color and book the next client. An LLC lets you run it like one. LaunchForma is an online formation service for Florida businesses, run by a husband and wife team and helping business owners since 2015.',
    );
    expect(enCopy.ctaLabel).toBe('Start my LLC for $149');
    expect(enCopy.ctaHref).toBe('/start');
    expect(enBundle.title).toBe('Launch Bundle, $199 for our first 10 customers');
    expect(enBundle.body).toBe(
      'Essential with the $125 state fee, plus your EIN, plus a single-member Operating Agreement. [See the Launch Bundle](/launch-bundle)',
    );
    expect(enBundle.body).not.toMatch(/year-1 registered agent/);
    expect(enCopy.faq[5]).toEqual({
      q: 'Is the site in Spanish?',
      a: 'Yes. [Ver en español](/es/llc-para/estilistas-barberos).',
    });

    expect(esCopy.metaTitle).toBe('LLC para estilistas y barberos en Florida | Esencial $149');
    expect(esCopy.metaDescription).toBe(
      'Forma tu LLC en Florida para tu silla, cabina o barbería. Esencial cuesta $149 e incluye la tarifa estatal de $125. Hecho para tu oficio.',
    );
    expect(esCopy.h1).toBe('Tu silla. Tus clientes. Tu negocio.');
    expect(esCopy.subhead).toContain('de un matrimonio que ayuda a dueños de negocio desde 2015.');
    expect(esCopy.ctaLabel).toBe('Empezar mi LLC por $149');
    expect(esCopy.ctaHref).toBe('/es/start');
    expect(esCopy.bossTitle).toBe('Ya mandas en tu negocio. Solo faltan los papeles.');
    expect(esCopy.readyTitle).toBe('Cuando tú digas');
    expect(esCopy.readyBody).toBe('Tú atiendes a tus clientes. Nosotros nos encargamos de los papeles.');
    expect(esCopy.faq[0]?.a).toContain('Mucha gente trabaja como negocio individual.');
    expect(esCopy.faq[5]).toEqual({
      q: '¿Me pueden atender en español?',
      a: 'Sí, de principio a fin. [View in English](/llc-for/stylists-barbers).',
    });
    expect(es.nicheStylists).not.toHaveProperty('bundleTitle');
    expect(es.nicheStylists).not.toHaveProperty('bundleBody');
    expect(JSON.stringify(es.nicheStylists)).not.toMatch(/Paquete de Lanzamiento|Usted ya|Su silla/);

    for (const blob of [JSON.stringify(en.nicheStylists), JSON.stringify(es.nicheStylists)]) {
      expect(blob).not.toMatch(/—|–/);
      expect(blob).not.toMatch(/[?&]ref=/);
    }
  });

  it('renders the visible FAQ into FAQPage JSON-LD and leaves the bundle out of the schema', () => {
    const { html, $ } = render(enCopy, null);
    const questions = $('[data-faq-q]')
      .map((_, el) => $(el).text())
      .get();
    const answers = $('[data-faq-a]')
      .map((_, el) => $(el).text())
      .get();
    const visible = nicheVisibleFaq(enCopy);
    expect(questions).toEqual(visible.map((item) => item.q));
    expect(answers).toEqual(visible.map((item) => item.a));
    expect(answers[5]).toBe('Yes. Ver en español.');
    expect($('[data-faq-a] a').attr('href')).toBe(ES_PATH);

    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toEqual(
      visible.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    );
    expect(JSON.stringify(schema)).not.toMatch(/Launch Bundle|\$199|launch-bundle|Paquete/);
    expect($('[data-bundle-block]')).toHaveLength(0);
    expect(html).not.toContain('Launch Bundle');
    expect(html).not.toContain('$199');

    const hrefs = $('a')
      .map((_, el) => $(el).attr('href') ?? '')
      .get();
    expect(hrefs.filter((href) => href === '/start').length).toBeGreaterThanOrEqual(3);
    expect(hrefs).toContain('/checklist');
    expect(hrefs).toContain('/guides/florida-llc-operating-agreement');
    for (const href of hrefs) expect(href).not.toMatch(/[?&]ref=/);
    expect(html).toContain(enCopy.h1);
    expect(html).toContain(enCopy.subhead);
  });

  it('renders the Spanish page with no bundle block', () => {
    const { $, html } = render(esCopy, null);
    const answers = $('[data-faq-a]')
      .map((_, el) => $(el).text())
      .get();
    expect(answers).toEqual(nicheVisibleFaq(esCopy).map((item) => item.a));
    expect(answers[5]).toBe('Sí, de principio a fin. View in English.');
    expect($('[data-faq-a] a').attr('href')).toBe(EN_PATH);
    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    expect(schema.inLanguage).toBe('es');
    expect(schema.mainEntity.map((item: { acceptedAnswer: { text: string } }) => item.acceptedAnswer.text)).toEqual(
      answers,
    );
    expect(JSON.stringify(schema)).not.toMatch(/Launch Bundle|\$199|launch-bundle|Paquete/);
    expect($('[data-bundle-block]')).toHaveLength(0);
    expect(html).not.toContain('/launch-bundle');
    const hrefs = $('a')
      .map((_, el) => $(el).attr('href') ?? '')
      .get();
    expect(hrefs.filter((href) => href === '/es/start')).toHaveLength(3);
    expect(hrefs).toContain('/es/checklist');
    expect(hrefs).toContain('/es/guides/florida-llc-operating-agreement');
    for (const href of hrefs) expect(href).not.toMatch(/[?&]ref=/);
  });

  it('shows the English bundle block only when the page passes it', () => {
    const { $ } = render(enCopy, enBundle);
    expect($('[data-bundle-block]')).toHaveLength(1);
    expect($('[data-bundle-block] h2').text()).toBe(enBundle.title);
    expect($('[data-bundle-block] p').text()).toBe(
      'Essential with the $125 state fee, plus your EIN, plus a single-member Operating Agreement. See the Launch Bundle',
    );
    expect($('[data-bundle-block] a').attr('href')).toBe('/launch-bundle');
    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    expect(JSON.stringify(schema)).not.toContain('Launch Bundle');
    expect(JSON.stringify(schema)).not.toContain('$199');
    expect(faqAnswerText(enBundle.body)).not.toContain('[');
  });
});

describe('niche bundle flag', () => {
  const previous = process.env.NICHE_BUNDLE_BLOCK_ENABLED;

  it('stays off unless the env flag is explicitly on', () => {
    delete process.env.NICHE_BUNDLE_BLOCK_ENABLED;
    expect(nicheBundleBlockEnabled()).toBe(false);
    process.env.NICHE_BUNDLE_BLOCK_ENABLED = 'false';
    expect(nicheBundleBlockEnabled()).toBe(false);
    process.env.NICHE_BUNDLE_BLOCK_ENABLED = 'true';
    expect(nicheBundleBlockEnabled()).toBe(true);
    process.env.NICHE_BUNDLE_BLOCK_ENABLED = '1';
    expect(nicheBundleBlockEnabled()).toBe(true);
    if (previous === undefined) delete process.env.NICHE_BUNDLE_BLOCK_ENABLED;
    else process.env.NICHE_BUNDLE_BLOCK_ENABLED = previous;
  });

  it('keeps bundle strings out of the client message catalog', () => {
    const client = omitNicheClientMessages(en as unknown as AbstractIntlMessages);
    expect(client).not.toHaveProperty('nicheStylists');
    expect(JSON.stringify(client)).not.toContain('Launch Bundle');
    expect(JSON.stringify(client)).not.toContain('first 10 customers');
    const page = readFileSync('app/(marketing)/llc-for/stylists-barbers/page.tsx', 'utf8');
    expect(page).toContain("locale === 'en' && nicheBundleBlockEnabled()");
    expect(page).not.toContain('?ref=');
    expect(page).toContain('title: { absolute: copy.metaTitle }');
    expect(page).toContain('nicheMetadataAlternates(locale)');
  });
});

describe('stylists pages stay out of sitemap and llms.txt', () => {
  it('does not list either URL until go-live', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).not.toContain('https://launchforma.com/llc-for/stylists-barbers');
    expect(urls).not.toContain('https://launchforma.com/es/llc-para/estilistas-barberos');
    const text = buildLlmsTxt();
    expect(text).not.toContain('/llc-for/stylists-barbers');
    expect(text).not.toContain('/es/llc-para/estilistas-barberos');
    expect(readFileSync('app/sitemap.ts', 'utf8')).toContain('TODO(niche-pages-go-live)');
    expect(readFileSync('lib/llms.ts', 'utf8')).toContain('TODO(niche-pages-go-live)');
  });
});
