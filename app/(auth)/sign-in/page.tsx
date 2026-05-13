import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { reset?: string; claimed?: string; email?: string; next?: string };
}) {
  const session = await auth();
  if (session?.user) {
    redirect(searchParams.next || '/dashboard');
  }
  const t = await getTranslations('auth');

  const claimed = searchParams.claimed === '1';
  const claimedEmail = searchParams.email ?? '';

  return (
    <div className="space-y-6">
      {searchParams.reset === '1' && (
        <div className="rounded-md bg-success/10 border border-success/20 px-4 py-3 text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Password updated successfully. Sign in with your new password.
        </div>
      )}

      {claimed && (
        <div className="rounded-md bg-primary/5 border border-primary/20 px-4 py-3 text-sm text-ink leading-relaxed flex items-start gap-2">
          <MailCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-primary mb-0.5">Your account is ready</p>
            <p className="text-xs text-ink-muted">
              We just emailed your sign-in details to{' '}
              <strong>{claimedEmail || 'the address on your filing'}</strong>. Sign in below to view
              your filing receipt and download your documents.
            </p>
          </div>
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

      <SignInForm defaultEmail={claimedEmail} nextHref={searchParams.next ?? ''} />
    </div>
  );
}
