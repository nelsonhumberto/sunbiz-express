import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  const t = await getTranslations('auth');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight">{t('signInTitle')}</h1>
        <p className="text-sm text-ink-muted">
          {t('signInNew')}{' '}
          <Link href="/sign-up" className="text-primary font-medium hover:underline">
            {t('signUpLink')}
          </Link>
          .
        </p>
      </div>

      <SignInForm />

      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-ink-muted">
        <p className="font-medium text-ink mb-2">{t('demoCredentials')}</p>
        <p className="font-mono">demo@inc.demo · Demo1234!</p>
        <p className="font-mono">admin@inc.demo · Demo1234!</p>
      </div>
    </div>
  );
}
