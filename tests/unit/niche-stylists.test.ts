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
import { tierPackagePriceCents, tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

const ESSENTIAL = formatCurrency(tierPackagePriceCents('BASIC', 'LLC', 'FL'));
const STATE_FEE = formatCurrency(tierPriceParts('BASIC', 'LLC', 'FL').stateFeeCents);
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
    expect(enCopy.metaTitle).toBe(`LLC for Hair Stylists and Barbers in Florida | ${ESSENTIAL}`);
    expect(enCopy.metaDescription).toBe(
      `Start your Florida LLC online in minutes. Essential is ${ESSENTIAL} and includes the ${STATE_FEE} state fee. We file it with the state. Built for your chair.`,
    );
    expect(enCopy.h1).toBe('Your chair, your business. Start your LLC in minutes.');
    expect(enCopy.subhead).toBe(
      "Fill out a short form online, we file your LLC with the State of Florida, and you're done. LaunchForma is an online formation service for Florida businesses, run by a husband and wife team and helping business owners since 2015.",
    );
    expect(enCopy.ctaLabel).toBe(`Start my LLC for ${ESSENTIAL}`);
    expect(enCopy.ctaHref).toBe('/start');
    expect(enCopy.stepsTitle).toBe('Easier than you think');
    expect(enCopy.steps[1]).toEqual({
      title: 'We file it with Florida.',
      body: 'We prepare your Articles of Organization and submit them to the state.',
    });
    expect(enCopy.steps[2]?.title).toBe("That's it.");
    expect(enCopy.dayTitle).toBe('It helps from day one');
    expect(enCopy.dayOne).toHaveLength(3);
    expect(enCopy.laterTitle).toBe("When you're ready, your LLC makes it easier to...");
    expect(enCopy.laterIntro).toBe(
      'No rush, and none of this is required. Whenever you want, your LLC gives you a cleaner way to:',
    );
    expect(enCopy.later[3]).toBe(
      'Walk into tax season more organized. An LLC plus a business bank account and an EIN makes it easier to keep business costs separate and documented. The LLC itself does not create a deduction. Ask your tax preparer what you can deduct.',
    );
    expect(enCopy.toolsTitle).toBe('Want to read more first?');
    expect(enCopy.tools[0]).toEqual({
      label: 'Starting Your LLC: a one-page guide',
      href: '/checklist',
    });
    expect(enCopy.readyBody).toBe(
      'You take care of your clients. We take care of the filing. It only takes a few minutes.',
    );
    expect(enBundle.title).toBe('Launch Bundle, $299 for our first 10 customers');
    expect(enBundle.body).toBe(
      'Essential with the $125 state fee, plus your EIN, plus a single-member Operating Agreement. [See the Launch Bundle](/launch-bundle)',
    );
    expect(enBundle.body).not.toMatch(/year-1 registered agent/);
    expect(enCopy.faq).toHaveLength(7);
    expect(enCopy.faq[0]).toEqual({
      q: 'Is it hard to set up an LLC?',
      a: 'No. You fill out a short form online in a few minutes and we file it with the state for you.',
    });
    expect(enCopy.faq[2]?.a).toContain(
      'An LLC is a choice that gives your work a real business name and a professional separation.',
    );
    expect(JSON.stringify(enCopy.faq)).not.toMatch(/Is the site in Spanish|Ver en español/);

    expect(esCopy.metaTitle).toBe(`LLC para estilistas y barberos en Florida | Esencial ${ESSENTIAL}`);
    expect(esCopy.metaDescription).toBe(
      `Empieza tu LLC en Florida en línea en unos minutos. Esencial cuesta ${ESSENTIAL} e incluye la tarifa estatal de ${STATE_FEE}. Nosotros la presentamos ante el estado.`,
    );
    expect(esCopy.h1).toBe('Tu silla, tu negocio. Empieza tu LLC en minutos.');
    expect(esCopy.subhead).toBe(
      'Llenas un formulario corto en línea, nosotros presentamos tu LLC ante el Estado de Florida y listo. LaunchForma es un servicio en línea para formar negocios en Florida, de un matrimonio que ayuda a dueños de negocio desde 2015.',
    );
    expect(esCopy.ctaLabel).toBe(`Empezar mi LLC por ${ESSENTIAL}`);
    expect(esCopy.ctaHref).toBe('/es/start');
    expect(esCopy.stepsTitle).toBe('Más fácil de lo que piensas');
    expect(esCopy.steps[2]).toEqual({
      title: 'Y ya.',
      body: 'Tu LLC está en camino. No necesitas nada más para empezar.',
    });
    expect(esCopy.dayTitle).toBe('Te ayuda desde el primer día');
    expect(esCopy.laterTitle).toBe('Cuando quieras, tu LLC te facilita...');
    expect(esCopy.laterIntro).toBe(
      'Sin prisa, y nada de esto es obligatorio. Cuando te convenga, tu LLC te da una forma más ordenada de:',
    );
    expect(esCopy.later[3]).toContain('La LLC por sí sola no crea una deducción.');
    expect(esCopy.toolsTitle).toBe('¿Quieres leer un poco más primero?');
    expect(esCopy.tools[0]).toEqual({
      label: 'Guía de una página para empezar tu LLC',
      href: '/es/checklist',
    });
    expect(esCopy.readyTitle).toBe('Cuando tú digas');
    expect(esCopy.readyBody).toBe(
      'Tú atiendes a tu clientela. Nosotros nos encargamos de presentar tu LLC. Solo toma unos minutos.',
    );
    expect(esCopy.faq).toHaveLength(7);
    expect(esCopy.faq[0]?.q).toBe('¿Es difícil formar una LLC?');
    expect(esCopy.faq[2]?.a).toContain(
      'La LLC es una opción que le da a tu trabajo un nombre de negocio de verdad y una separación profesional.',
    );
    expect(JSON.stringify(esCopy.faq)).not.toMatch(/atender en español|View in English/);
    expect(es.nicheStylists.bundleTitle).toBe(
      'Launch Bundle, $299 para nuestros primeros 10 clientes',
    );
    expect(es.nicheStylists.bundleBody).toBe(
      'Esencial con la tarifa estatal de $125, más tu EIN y un acuerdo operativo para un solo miembro. [Ver el Launch Bundle](/launch-bundle)',
    );
    expect(es.nicheStylists).not.toHaveProperty('bossTitle');
    expect(es.nicheStylists).not.toHaveProperty('howTitle');
    expect(en.nicheStylists).not.toHaveProperty('bossTitle');
    expect(en.nicheStylists).not.toHaveProperty('howTitle');
    expect(JSON.stringify(es.nicheStylists)).not.toMatch(/Paquete de Lanzamiento|Usted ya|Su silla/);

    for (const blob of [JSON.stringify(en.nicheStylists), JSON.stringify(es.nicheStylists)]) {
      expect(blob).not.toMatch(/—|–/);
      expect(blob).not.toMatch(/[?&]ref=/);
      expect(blob).not.toMatch(/official in minutes|oficial en minutos/);
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
    expect(questions).toHaveLength(7);
    expect(answers[5]).toBe(
      'Essential includes the $125 Florida state fee and the filing of your LLC. It does not include a domain.',
    );
    expect($('[data-faq-a] a')).toHaveLength(0);
    expect(html).not.toMatch(/Is the site in Spanish|Ver en español|You are already the boss|How it works/);
    expect($('[data-section]').map((_, el) => $(el).attr('data-section')).get()).toEqual([
      'steps',
      'day-one',
      'later',
      'tools',
    ]);
    expect($('h2').map((_, el) => $(el).text()).get()).toEqual([
      enCopy.stepsTitle,
      enCopy.dayTitle,
      enCopy.laterTitle,
      enCopy.licenseTitle,
      enCopy.essentialTitle,
      enCopy.toolsTitle,
      enCopy.faqTitle,
      enCopy.readyTitle,
    ]);

    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toEqual(
      visible.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    );
    expect(JSON.stringify(schema)).not.toMatch(/Launch Bundle|\$299|launch-bundle|Paquete/);
    expect($('[data-bundle-block]')).toHaveLength(0);
    expect(html).not.toContain('Launch Bundle');
    expect(html).not.toContain('$299');

    const hrefs = $('a')
      .map((_, el) => $(el).attr('href') ?? '')
      .get();
    expect(hrefs.filter((href) => href === '/start').length).toBeGreaterThanOrEqual(3);
    expect(hrefs).toContain('/checklist');
    expect(hrefs).toContain('/guides/florida-llc-operating-agreement');
    for (const href of hrefs) expect(href).not.toMatch(/[?&]ref=/);
    expect($('h1').text()).toBe(enCopy.h1);
    expect($('h1').next('p').text()).toBe(enCopy.subhead);
  });

  it('renders the Spanish page with no bundle block', () => {
    const { $, html } = render(esCopy, null);
    const answers = $('[data-faq-a]')
      .map((_, el) => $(el).text())
      .get();
    expect(answers).toEqual(nicheVisibleFaq(esCopy).map((item) => item.a));
    expect(answers).toHaveLength(7);
    expect(answers[2]).toContain('nombre de negocio de verdad y una separación profesional.');
    expect($('[data-faq-a] a')).toHaveLength(0);
    expect(html).not.toMatch(/atender en español|View in English|Ya mandas en tu negocio|Cómo funciona/);
    expect($('h2').map((_, el) => $(el).text()).get()).toEqual([
      esCopy.stepsTitle,
      esCopy.dayTitle,
      esCopy.laterTitle,
      esCopy.licenseTitle,
      esCopy.essentialTitle,
      esCopy.toolsTitle,
      esCopy.faqTitle,
      esCopy.readyTitle,
    ]);
    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    expect(schema.inLanguage).toBe('es');
    expect(schema.mainEntity.map((item: { acceptedAnswer: { text: string } }) => item.acceptedAnswer.text)).toEqual(
      answers,
    );
    expect(JSON.stringify(schema)).not.toMatch(/Launch Bundle|\$299|launch-bundle|Paquete/);
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
    expect(JSON.stringify(schema)).not.toContain('$299');
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

describe('stylists pages are in the sitemap and llms.txt', () => {
  it('lists both URLs with the same hreflang alternates as other EN/ES pairs', () => {
    const entries = sitemap();
    const enUrl = 'https://launchforma.com/llc-for/stylists-barbers';
    const esUrl = 'https://launchforma.com/es/llc-para/estilistas-barberos';
    const english = entries.find((entry) => entry.url === enUrl);
    const spanish = entries.find((entry) => entry.url === esUrl);
    const languages = { en: enUrl, es: esUrl, 'x-default': enUrl };
    expect(english?.alternates?.languages).toEqual(languages);
    expect(spanish?.alternates?.languages).toEqual(languages);
    expect(entries.map((entry) => entry.url)).not.toContain(
      'https://launchforma.com/es/llc-for/stylists-barbers',
    );
    const text = buildLlmsTxt();
    expect(text).toContain(
      `- [LLC for Hair Stylists and Barbers](https://launchforma.com/llc-for/stylists-barbers): Florida LLC formation for hair stylists and barbers. Essential is ${ESSENTIAL} and includes the ${STATE_FEE} state fee. Spanish alternate: /es/llc-para/estilistas-barberos.`,
    );
    expect(text).toContain(
      `- [LLC para estilistas y barberos](https://launchforma.com/es/llc-para/estilistas-barberos): LLC en Florida para estilistas y barberos. Esencial cuesta ${ESSENTIAL} e incluye la tarifa estatal de ${STATE_FEE}. Alterna en inglés: /llc-for/stylists-barbers.`,
    );
    expect(readFileSync('app/sitemap.ts', 'utf8')).not.toContain('TODO(niche-pages-go-live)');
    expect(readFileSync('lib/llms.ts', 'utf8')).not.toContain('TODO(niche-pages-go-live)');
  });
});
