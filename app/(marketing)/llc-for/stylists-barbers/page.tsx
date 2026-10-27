import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { NicheStylistsPage } from '@/components/marketing/NicheStylistsPage';
import {
  nicheBundleBlockEnabled,
  nicheMetadataAlternates,
  NICHE_STYLISTS_EN_URL,
  NICHE_STYLISTS_ES_URL,
  readNicheBundleCopy,
  readNicheStylistsCopy,
} from '@/lib/niche-stylists';

export async function generateMetadata(): Promise<Metadata> {
  noStore();
  const locale = (await getLocale()) === 'es' ? 'es' : 'en';
  const t = await getTranslations('nicheStylists');
  const copy = readNicheStylistsCopy((key) => t(key), locale);
  return {
    title: { absolute: copy.metaTitle },
    description: copy.metaDescription,
    alternates: nicheMetadataAlternates(locale),
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      type: 'website',
      locale: locale === 'es' ? 'es_US' : 'en_US',
      url: locale === 'es' ? NICHE_STYLISTS_ES_URL : NICHE_STYLISTS_EN_URL,
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
  };
}

export default async function StylistsBarbersPage() {
  noStore();
  const locale = (await getLocale()) === 'es' ? 'es' : 'en';
  const t = await getTranslations('nicheStylists');
  const copy = readNicheStylistsCopy((key) => t(key), locale);
  // Both locales. NICHE_BUNDLE_BLOCK_ENABLED is the only gate, and it stays off by default.
  const bundle = nicheBundleBlockEnabled() ? readNicheBundleCopy((key) => t(key)) : null;

  return <NicheStylistsPage copy={copy} bundle={bundle} />;
}
