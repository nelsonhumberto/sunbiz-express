import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { PrivacyChoicesPanel } from '@/components/legal/PrivacyChoicesPanel';
import { AD_OPT_OUT_COOKIE, isAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import { withLocaleMeta } from '@/lib/locale-seo';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations('privacyChoices');
  return withLocaleMeta(
    '/privacy-choices',
    { title: t('metaTitle'), description: t('metaDescription') },
    locale,
  );
}

export default async function PrivacyChoicesPage() {
  const t = await getTranslations('privacyChoices');
  const headerStore = headers();
  const serverGpc = headerStore.get('sec-gpc') === '1';
  const cookie = cookies().get(AD_OPT_OUT_COOKIE)?.value ?? null;
  const initialOptedOut = isAdMeasurementOptedOut({ cookie, secGpc: serverGpc ? '1' : null });

  return (
    <>
      <h1>{t('title')}</h1>
      <PrivacyChoicesPanel initialOptedOut={initialOptedOut} serverGpc={serverGpc} />
    </>
  );
}
