import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import { localizedHref } from '@/lib/locale-paths';
import { formatCurrency } from '@/lib/utils';
import { LAUNCH_BUNDLE_PRICE_CENTS } from '@/lib/pricing';
import { launchBundlePaymentAllowed, normalizeReferralRef } from '@/lib/launch-bundle';
import { countPaidLaunchBundleOrders } from '@/lib/launch-bundle-orders';
import { startLaunchBundle } from '@/actions/launch-bundle';

export const dynamic = 'force-dynamic';

// Direct-link only. noindex, nofollow. Not linked from nav, pricing, /start, or ads.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('launchBundle');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: 'noindex, nofollow',
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LaunchBundlePage({
  searchParams,
}: {
  searchParams?: { ref?: string | string[]; error?: string | string[] };
}) {
  const t = await getTranslations('launchBundle');
  const tDisc = await getTranslations('disclosure');
  const locale = await getLocale();
  const price = formatCurrency(LAUNCH_BUNDLE_PRICE_CENTS);
  const ref = normalizeReferralRef(firstParam(searchParams?.ref));
  const showError = firstParam(searchParams?.error) === 'start';
  const paid = await countPaidLaunchBundleOrders();
  const open = launchBundlePaymentAllowed(paid);
  const pricingHref = localizedHref('/pricing', locale);
  const startHref = localizedHref('/start', locale);

  const includes = [
    t('includeEssential'),
    t('includeFee', { price }),
    t('includeEin'),
    t('includeAgreement'),
    t('includeRa'),
    t('includeTiming'),
  ];

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 mesh-bg" />
      <div className="aurora" />
      <div className="container relative max-w-2xl py-16 md:py-24">
        <GovDisclosure variant="prominent" text={tDisc('notAffiliated')} />

        <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-primary">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight text-balance">
          {t('headline', { price })}
        </h1>
        <p className="mt-4 text-lg text-ink-muted leading-relaxed">{t('subhead', { price })}</p>

        <ul className="mt-8 space-y-3">
          {includes.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-ink leading-relaxed">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" strokeWidth={3} />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {open ? (
          <form action={startLaunchBundle} className="mt-8">
            {ref ? <input type="hidden" name="ref" value={ref} /> : null}
            <Button type="submit" size="xl" className="text-base shadow-xl">
              {t('cta')}
              <ArrowRight className="h-5 w-5" />
            </Button>
            {showError ? <p className="mt-3 text-sm text-destructive">{t('startError')}</p> : null}
          </form>
        ) : (
          <div className="mt-8 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-display text-2xl font-medium">{t('soldOutTitle')}</h2>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed">{t('soldOutBody')}</p>
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <Button asChild>
                <Link href={pricingHref}>{t('viewPackages')}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={startHref}>{t('startRegular')}</Link>
              </Button>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-ink-subtle leading-relaxed">{t('finePrint')}</p>
      </div>
    </div>
  );
}
