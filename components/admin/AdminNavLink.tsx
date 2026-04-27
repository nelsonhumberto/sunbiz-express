'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, Mail, BarChart3, AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Mail,
  BarChart3,
  AlertTriangle,
};

interface Props {
  href: string;
  label: string;
  iconName: keyof typeof ICONS;
}

export function AdminNavLink({ href, label, iconName }: Props) {
  const pathname = usePathname();
  const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
  const Icon = ICONS[iconName];

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent/15 text-accent-700'
          : 'text-ink-muted hover:bg-muted hover:text-ink'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
