import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { SPANISH_GUIDE_LLC_SIN_SSN } from '@/lib/spanish-guide-links';

/** One related-guide link on the Spanish homepage and pricing page. */
export async function SpanishSsnGuideLink() {
  const locale = await getLocale();
  if (locale !== 'es') return null;
  return (
    <p className="container max-w-3xl px-4 pb-8 text-center text-sm">
      <Link
        href={SPANISH_GUIDE_LLC_SIN_SSN.href}
        className="font-medium text-primary hover:underline"
      >
        {SPANISH_GUIDE_LLC_SIN_SSN.label}
      </Link>
    </p>
  );
}
