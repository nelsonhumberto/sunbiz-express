import { getTranslations } from 'next-intl/server';
import { LocaleLink } from '@/components/i18n/LocaleLink';

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
        <LocaleLink href={englishHref} hrefLang="en" className="font-medium text-primary underline">
          {t('englishLink')}
        </LocaleLink>
      </p>
    </aside>
  );
}
