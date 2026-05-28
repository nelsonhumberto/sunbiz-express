import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getGuestUser } from '@/lib/guest';
import { SkipLink } from '@/components/a11y/SkipLink';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Wizard layout — admits both authenticated users AND guests holding a valid
 * `LF_GUEST_TOKEN` cookie. Anyone else is bounced to /sign-in.
 *
 * The dashboard chrome is intentionally omitted because guests don't have a
 * dashboard yet. The wizard renders its own header/progress UI inside
 * `WizardShell`.
 */
export default async function WizardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    const guest = await getGuestUser();
    if (!guest) redirect('/sign-in');
  }

  return (
    <div id="main-content" tabIndex={-1} className="min-h-screen bg-surface focus:outline-none">
      <SkipLink />
      {children}
    </div>
  );
}
