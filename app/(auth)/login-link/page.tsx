import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { findLoginLink, LOGIN_LINK_COOKIE, LOGIN_LINK_TTL_DAYS } from '@/lib/login-link';
import { safeRedirectPath } from '@/lib/utils';
import { TOTAL_STEPS } from '@/lib/wizard-constants';
import { Button } from '@/components/ui/button';
import { continueWithLoginLink } from './actions';
import { ContinueButton } from './continue-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Continue', robots: { index: false, follow: false } };

export default async function LoginLinkPage() {
  const link = await findLoginLink(cookies().get(LOGIN_LINK_COOKIE)?.value ?? '');
  const nextPath = safeRedirectPath(link?.nextPath) ?? '/dashboard';

  const session = await auth();
  if (link && session?.user?.id === link.userId) redirect(nextPath);

  if (!link || link.usedAt || link.expiresAt <= new Date()) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-medium tracking-tight">This link has expired</h1>
          <p className="text-sm text-ink-muted">
            For your security, sign-in links work once and expire after {LOGIN_LINK_TTL_DAYS} days.
            Sign in to pick up right where you left off.
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href={link ? `/sign-in?next=${encodeURIComponent(nextPath)}` : '/sign-in'}>Sign in</Link>
        </Button>
      </div>
    );
  }

  const toCheckout = nextPath.startsWith('/wizard/') && nextPath.endsWith(`/${TOTAL_STEPS}`);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Welcome back, {link.user.firstName}
        </h1>
        <p className="text-sm text-ink-muted">
          {toCheckout
            ? 'Your company is saved and ready for checkout.'
            : 'Your filing is saved right where you left off.'}
        </p>
      </div>
      <form action={continueWithLoginLink}>
        <ContinueButton label={toCheckout ? 'Continue to checkout' : 'Continue to my filing'} />
      </form>
      <p className="text-xs text-ink-subtle">This secure link signs you in once. No password needed.</p>
    </div>
  );
}
