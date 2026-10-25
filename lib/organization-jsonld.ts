import { BUSINESS_LEGAL_NAME, CONTACT_PHONE_E164 } from '@/lib/constants';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

/** Organization schema shared by marketing pages. Phone only; no email address. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LaunchForma',
    legalName: BUSINESS_LEGAL_NAME,
    url: BASE_URL,
    logo: `${BASE_URL}/images/logo-icon.png`,
    description:
      'LaunchForma simplifies business formation in Florida, Wyoming, and Delaware. LLC and Corporation filing with all-in pricing.',
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: CONTACT_PHONE_E164,
      contactType: 'customer service',
      availableLanguage: ['English', 'Spanish'],
    },
  };
}
