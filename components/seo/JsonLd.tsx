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
