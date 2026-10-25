import { CheckCircle2, MailCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { localizedNextParam, redirectLocalized } from '@/lib/locale-redirect';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { reset?: string; claimed?: string; email?: string; next?: string; from?: string };
}) {
  const nextPath = await localizedNextParam(searchParams.next);
  const session = await auth();
  if (session?.user) {
    return await redirectLocalized(nextPath ?? '/dashboard');
  }
  const t = await getTranslations('auth');
  const signUpHref = nextPath ? `/sign-up?next=${encodeURIComponent(nextPath)}` : '/sign-up';

  const claimed = searchParams.claimed === '1';
  const claimedEmail = searchParams.email ?? '';
  const fromStart = searchParams.from === 'start';

  return (
    <div className="space-y-6">
      {searchParams.reset === '1' && (
        <div className="rounded-md bg-success/10 border border-success/20 px-4 py-3 text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Password updated successfully. Sign in with your new password.
        </div>
      )}

      {fromStart && (
        <div className="rounded-md bg-primary/5 border border-primary/20 px-4 py-3 text-sm text-ink leading-relaxed">
          {t('fromStartNotice')}
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
          <Link href={signUpHref} className="text-primary font-medium hover:underline">
            {t('signUpLink')}
          </Link>
          .
        </p>
      </div>

      <SignInForm defaultEmail={searchParams.email ?? claimedEmail} nextHref={nextPath ?? ''} />
    </div>
  );
}
