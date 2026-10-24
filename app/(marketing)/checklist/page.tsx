import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { checklistCopy } from '@/lib/drip-copy';
import { withLocaleMeta } from '@/lib/locale-seo';

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
  const copy = checklistCopy(locale === 'en' ? 'en' : 'es');

  return (
    <article className="container max-w-3xl py-12 md:py-16">
      <h1 className="font-display text-3xl font-medium leading-tight tracking-tight md:text-5xl">
        {copy.pageTitle}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-muted md:text-lg">{copy.pageIntro}</p>
      <ol className="mt-8 space-y-4 md:mt-10">
        {copy.items.map((item, index) => (
          <li key={item.title} className="rounded-2xl border border-border bg-white p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              {index + 1}
            </p>
            <h2 className="mt-1 font-display text-xl font-medium">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted md:text-base">{item.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm leading-relaxed text-ink-subtle">{copy.disclaimer}</p>
    </article>
  );
}
