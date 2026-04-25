'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, FileEdit, Hourglass, AlertCircle } from 'lucide-react';

const STATUS_CONFIG = {
  DRAFT: { variant: 'secondary' as const, icon: FileEdit },
  SUBMITTED: { variant: 'warn' as const, icon: Hourglass },
  APPROVED: { variant: 'success' as const, icon: CheckCircle2 },
  REJECTED: { variant: 'danger' as const, icon: AlertCircle },
  ABANDONED: { variant: 'outline' as const, icon: XCircle },
};

export function StatusBadge({ status, size }: { status: string; size?: 'sm' | 'default' | 'lg' }) {
  const t = useTranslations('status');
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.DRAFT;
  const Icon = config.icon;
  const label = t(status as never) ?? status;
  return (
    <Badge variant={config.variant} size={size}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
