'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { localizedHref } from '@/lib/locale-paths';

/** Footer link required for the state "do not sell or share" opt-out. */
export function DoNotSellLink({ className }: { className?: string }) {
  const t = useTranslations('footer');
  const locale = useLocale();
  return (
    <Link href={localizedHref('/privacy-choices', locale)} className={className}>
      {t('doNotSell')}
    </Link>
  );
}
