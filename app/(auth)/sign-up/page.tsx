import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { SignUpForm } from './sign-up-form';

export const metadata = { title: 'Create your account' };

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  const t = await getTranslations('auth');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight">{t('signUpTitle')}</h1>
        <p className="text-sm text-ink-muted">
          {t('signUpAlready')}{' '}
          <Link href="/sign-in" className="text-primary font-medium hover:underline">
            {t('signInLink')}
          </Link>
          .
        </p>
      </div>
      <SignUpForm />
      <p className="text-xs text-ink-subtle text-center leading-relaxed">
        {t('termsFooter')}{' '}
        <Link href="/terms" className="underline hover:text-ink-muted">
          {t('termsLink')}
        </Link>{' '}
        {t('and')}{' '}
        <Link href="/privacy" className="underline hover:text-ink-muted">
          {t('privacyLink')}
        </Link>
        .
      </p>
    </div>
  );
}
