import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');

  return (
    <div className="min-h-screen flex bg-surface">
      <DashboardNav
        isAdmin={session.user.role === 'ADMIN'}
        user={{ name: session.user.name, email: session.user.email }}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
