import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { SkipLink } from '@/components/a11y/SkipLink';
import { LocaleLink } from '@/components/i18n/LocaleLink';
import { Logo } from '@/components/marketing/Logo';
import { cn } from '@/lib/utils';

export default async function ComplianceLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations('businessServices');
  const locale = await getLocale();
  const pathname = headers().get('x-lf-pathname') ?? '/business-services';
  const base = pathname.startsWith('/business-services') ? pathname : '/business-services';
  const enHref = base;
  const esHref = `/es${base}`;
  const logoHref = locale === 'es' ? '/es/business-services' : '/business-services';

  return (
    <>
      <SkipLink label={t('skip')} />
      <header className="border-b border-border bg-white">
        <div className="container flex h-14 items-center justify-between gap-4 md:h-16">
          <Logo href={logoHref} />
          <nav aria-label={t('languageNav')} className="flex items-center gap-1 text-sm font-medium">
            <LocaleLink
              href={enHref}
              hrefLang="en"
              aria-current={locale === 'en' ? 'true' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5',
                locale === 'en' ? 'bg-primary/10 text-primary' : 'text-ink-muted hover:text-ink',
              )}
            >
              English
            </LocaleLink>
            <LocaleLink
              href={esHref}
              hrefLang="es"
              aria-current={locale === 'es' ? 'true' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5',
                locale === 'es' ? 'bg-primary/10 text-primary' : 'text-ink-muted hover:text-ink',
              )}
            >
              Español
            </LocaleLink>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
    </>
  );
}
