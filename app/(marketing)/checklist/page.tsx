import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { ChecklistBoard } from '@/components/marketing/ChecklistBoard';
import { checklistCopy } from '@/lib/drip-copy';
import { withLocaleMeta } from '@/lib/locale-seo';

const START_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com').replace(/\/$/, '');

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const copy = checklistCopy(locale === 'en' ? 'en' : 'es');
  return withLocaleMeta(
    '/checklist',
    {
      title: copy.pageTitle,
      description: copy.pageIntro,
      openGraph: { title: copy.pageTitle, description: copy.pageIntro, type: 'article' },
    },
    locale,
  );
}

export default async function ChecklistPage() {
  const locale = await getLocale();
  const lang = locale === 'en' ? 'en' : 'es';
  const copy = checklistCopy(lang);
  const startHref = lang === 'es' ? `${START_URL}/es` : START_URL;

  return (
    <article className="container max-w-3xl py-10 md:py-16">
      <h1 className="text-balance font-display text-3xl font-medium leading-tight tracking-tight md:text-5xl">
        {copy.pageTitle}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-muted md:text-lg">{copy.pageIntro}</p>
      <ChecklistBoard sections={copy.sections} />
      <aside className="mt-10 rounded-2xl border border-border bg-muted/40 p-5 md:p-8">
        <h2 className="font-display text-2xl font-medium leading-tight">{copy.closerTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted md:text-base">{copy.closerBody}</p>
        <a
          href={startHref}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 text-center text-sm font-semibold text-white sm:w-auto"
        >
          {copy.closerCta}
        </a>
      </aside>
      <p className="mt-8 text-sm italic leading-relaxed text-ink-subtle">{copy.pageDisclaimer}</p>
    </article>
  );
}
