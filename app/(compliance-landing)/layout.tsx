import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { SkipLink } from '@/components/a11y/SkipLink';
import { Logo } from '@/components/marketing/Logo';
import { cn } from '@/lib/utils';

export default async function ComplianceLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations('businessServices');
  const locale = await getLocale();

  return (
    <>
      <SkipLink label={t('skip')} />
      <header className="border-b border-border bg-white">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Logo href="/business-services" />
          <nav aria-label={t('languageNav')} className="flex items-center gap-1 text-sm font-medium">
            <Link
              href="/business-services?lang=en"
              hrefLang="en"
              aria-current={locale === 'en' ? 'true' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5',
                locale === 'en' ? 'bg-primary/10 text-primary' : 'text-ink-muted hover:text-ink',
              )}
            >
              English
            </Link>
            <Link
              href="/es/business-services"
              hrefLang="es"
              aria-current={locale === 'es' ? 'true' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5',
                locale === 'es' ? 'bg-primary/10 text-primary' : 'text-ink-muted hover:text-ink',
              )}
            >
              Español
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
    </>
  );
}
