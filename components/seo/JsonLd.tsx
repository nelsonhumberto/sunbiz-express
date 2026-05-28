/**
 * Renders a JSON-LD structured data script tag. Server-safe (no client
 * hooks). Each schema type gets a typed factory function below.
 */

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LaunchForma',
    url: BASE_URL,
    logo: `${BASE_URL}/images/logo-icon.png`,
    description:
      'LaunchForma simplifies business formation in Florida, Wyoming, and Delaware. LLC and Corporation filing with all-in pricing.',
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'hello@launchforma.com',
      contactType: 'customer service',
      availableLanguage: ['English', 'Spanish'],
    },
  };
}

export function faqPageJsonLd(
  items: { q: string; a: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

export function serviceJsonLd(stateName: string, stateSlug: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${stateName} LLC & Corporation Formation`,
    provider: {
      '@type': 'Organization',
      name: 'LaunchForma',
    },
    description: `Form a ${stateName} LLC or Corporation with all-in package pricing, free Year-1 Registered Agent, and fast filing.`,
    url: `${BASE_URL}/states/${stateSlug}`,
    areaServed: {
      '@type': 'State',
      name: stateName,
    },
    serviceType: 'Business Formation',
  };
}

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Product / offer catalog for `/pricing`. Each tier surfaces as an Offer
 * inside an aggregated Product so Google can surface "price range" rich
 * results.
 */
export function pricingProductJsonLd(args: {
  stateName: string;
  tiers: { name: string; priceCents: number; description: string }[];
}) {
  const prices = args.tiers.map((t) => t.priceCents / 100);
  const lowPrice = Math.min(...prices).toFixed(2);
  const highPrice = Math.max(...prices).toFixed(2);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `LaunchForma ${args.stateName} Business Formation Packages`,
    description: `All-in pricing for forming a ${args.stateName} LLC or Corporation — state filing fee included, free Year-1 Registered Agent.`,
    brand: { '@type': 'Brand', name: 'LaunchForma' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice,
      highPrice,
      offerCount: args.tiers.length,
      offers: args.tiers.map((t) => ({
        '@type': 'Offer',
        name: t.name,
        price: (t.priceCents / 100).toFixed(2),
        priceCurrency: 'USD',
        description: t.description,
        availability: 'https://schema.org/InStock',
      })),
    },
  };
}

/**
 * Service offer catalog for `/services`. Each add-on becomes an Offer.
 */
export function servicesItemListJsonLd(
  items: { name: string; description: string; priceCents: number }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'LaunchForma Business Formation Services',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Offer',
        name: item.name,
        description: item.description,
        price: (item.priceCents / 100).toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    })),
  };
}

/**
 * Standalone Article schema for long-form guide pages — feeds Google's
 * "Article" rich result.
 */
export function articleJsonLd(args: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.headline,
    description: args.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': args.url },
    url: args.url,
    datePublished: args.datePublished,
    dateModified: args.dateModified ?? args.datePublished,
    publisher: {
      '@type': 'Organization',
      name: 'LaunchForma',
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/images/logo-icon.png`,
      },
    },
    author: {
      '@type': 'Organization',
      name: args.authorName ?? 'LaunchForma',
    },
  };
}
