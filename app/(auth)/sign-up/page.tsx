import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Link as LocaleLink } from '@/i18n/navigation';
import { hrefForLocale } from '@/lib/app-href';
import { auth } from '@/lib/auth';
import { localeForRedirect, localizedNextParam, redirectLocalized } from '@/lib/locale-redirect';
import { SignUpForm } from './sign-up-form';

export const metadata = { title: 'Create your account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = await localizedNextParam(searchParams?.next);
  const session = await auth();
  if (session?.user) return await redirectLocalized(nextPath ?? '/dashboard');
  const t = await getTranslations('auth');
  const locale = await localeForRedirect();
  const signInHref = hrefForLocale(
    nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : '/sign-in',
    locale,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight">{t('signUpTitle')}</h1>
        <p className="text-sm text-ink-muted">
          {t('signUpAlready')}{' '}
          <Link href={signInHref} className="text-primary font-medium hover:underline">
            {t('signInLink')}
          </Link>
          .
        </p>
      </div>
      <SignUpForm nextHref={nextPath ?? ''} />
      <p className="text-xs text-ink-subtle text-center leading-relaxed">
        {t('termsFooter')}{' '}
        <LocaleLink href="/terms" className="underline hover:text-ink-muted">
          {t('termsLink')}
        </LocaleLink>{' '}
        {t('and')}{' '}
        <LocaleLink href="/privacy" className="underline hover:text-ink-muted">
          {t('privacyLink')}
        </LocaleLink>
        .
      </p>
    </div>
  );
}
