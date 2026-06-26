import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { SkipLink } from '@/components/a11y/SkipLink';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface">
      <SkipLink />
      <DashboardNav
        isAdmin={session.user.role === 'ADMIN'}
        user={{ name: session.user.name, email: session.user.email }}
      />
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 focus:outline-none">
        {children}
      </main>
    </div>
  );
}
