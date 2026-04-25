'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, CalendarCheck, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/marketing/Logo';
import { signOutAction } from '@/actions/auth';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText },
  { href: '/dashboard/compliance', label: 'Compliance', icon: CalendarCheck },
];

interface DashboardNavProps {
  isAdmin: boolean;
  user: { name?: string | null; email?: string | null };
}

export function DashboardNav({ isAdmin, user }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 lg:w-64 shrink-0 flex-col border-r border-border bg-white">
      <div className="px-6 py-5 border-b border-border">
        <Logo size="sm" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-ink-muted hover:bg-muted hover:text-ink'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="my-3 border-t border-border" />
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-accent/15 text-accent-700'
                  : 'text-ink-muted hover:bg-muted hover:text-ink'
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-border space-y-1">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-ink leading-tight truncate">{user.name}</p>
          <p className="text-xs text-ink-subtle truncate">{user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
