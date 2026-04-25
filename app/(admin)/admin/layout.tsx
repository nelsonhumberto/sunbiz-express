import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Logo } from '@/components/marketing/Logo';
import { signOutAction } from '@/actions/auth';
import { Badge } from '@/components/ui/badge';
import { AdminNavLink } from '@/components/admin/AdminNavLink';

const NAV: { href: string; label: string; iconName: 'LayoutDashboard' | 'FileText' | 'Mail' | 'BarChart3' }[] = [
  { href: '/admin', label: 'Overview', iconName: 'LayoutDashboard' },
  { href: '/admin/filings', label: 'Filings', iconName: 'FileText' },
  { href: '/admin/outbox', label: 'Email outbox', iconName: 'Mail' },
  { href: '/admin/analytics', label: 'Analytics', iconName: 'BarChart3' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="min-h-screen flex bg-surface">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-white">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <Logo size="sm" />
          <Badge variant="accent">
            <ShieldCheck className="h-3 w-3" />
            Admin
          </Badge>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <AdminNavLink key={item.href} {...item} />
          ))}
          <div className="my-3 border-t border-border" />
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-ink-muted hover:bg-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Exit admin
          </Link>
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-ink leading-tight truncate">{session.user.name}</p>
            <p className="text-xs text-ink-subtle truncate">{session.user.email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
