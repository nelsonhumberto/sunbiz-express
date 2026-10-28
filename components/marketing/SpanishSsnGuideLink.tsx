import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import {
  SPANISH_GUIDE_LLC_COSTO,
  SPANISH_GUIDE_LLC_EXTRANJEROS,
  SPANISH_GUIDE_LLC_SIN_SSN,
} from '@/lib/spanish-guide-links';

const RELATED = [
  SPANISH_GUIDE_LLC_SIN_SSN,
  SPANISH_GUIDE_LLC_COSTO,
  SPANISH_GUIDE_LLC_EXTRANJEROS,
] as const;

/** Related-guide links on the Spanish homepage and pricing page. */
export async function SpanishSsnGuideLink() {
  const locale = await getLocale();
  if (locale !== 'es') return null;
  return (
    <p className="container max-w-3xl px-4 pb-8 text-center text-sm">
      {RELATED.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? <span className="text-ink-subtle"> · </span> : null}
          <Link href={link.href} className="font-medium text-primary hover:underline">
            {link.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
