import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** Shown on Spanish legal pages. The English page remains the governing text. */
export async function LegalDraftNotice({ englishHref }: { englishHref: string }) {
  const t = await getTranslations('legalDraft');
  return (
    <aside
      className="not-prose mb-8 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-ink"
      role="note"
    >
      <p className="font-semibold">{t('title')}</p>
      <p className="mt-1 text-ink-muted leading-relaxed">
        {t('body')}{' '}
        <Link href={englishHref} className="font-medium text-primary underline">
          {t('englishLink')}
        </Link>
      </p>
    </aside>
  );
}
