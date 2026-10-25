import { getLocale, getTranslations } from 'next-intl/server';
import { hrefForLocale } from '@/lib/app-href';

export default async function NotFound() {
  const locale = (await getLocale()) === 'es' ? 'es' : 'en';
  const t = await getTranslations('notFound');

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-surface px-6 py-16">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-sm font-semibold tracking-wide text-primary">{t('code')}</p>
        <h1 className="font-display text-3xl font-medium">{t('title')}</h1>
        <p className="text-sm text-ink-muted leading-relaxed">{t('body')}</p>
        <a
          href={hrefForLocale('/', locale)}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          {t('home')}
        </a>
      </div>
    </main>
  );
}
