import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { reset?: string };
}) {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  const t = await getTranslations('auth');

  return (
    <div className="space-y-6">
      {searchParams.reset === '1' && (
        <div className="rounded-md bg-success/10 border border-success/20 px-4 py-3 text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Password updated successfully. Sign in with your new password.
        </div>
      )}

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
    </div>
  );
}
