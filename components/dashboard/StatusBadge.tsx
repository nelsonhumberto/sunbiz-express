import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, FileEdit, Hourglass, AlertCircle } from 'lucide-react';

const STATUS_CONFIG = {
  DRAFT: { label: 'Draft', variant: 'secondary' as const, icon: FileEdit },
  SUBMITTED: { label: 'In Review', variant: 'warn' as const, icon: Hourglass },
  APPROVED: { label: 'Approved', variant: 'success' as const, icon: CheckCircle2 },
  REJECTED: { label: 'Action Needed', variant: 'danger' as const, icon: AlertCircle },
  ABANDONED: { label: 'Abandoned', variant: 'outline' as const, icon: XCircle },
};

export function StatusBadge({ status, size }: { status: string; size?: 'sm' | 'default' | 'lg' }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.DRAFT;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} size={size}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
