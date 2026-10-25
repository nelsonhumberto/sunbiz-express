import { Badge } from '@/components/ui/badge';
import { MarkDomainRegisteredButton } from '@/components/admin/MarkDomainRegisteredButton';

/**
 * Shown on paid Premium filings. The warn badge stays until an admin marks
 * the .com registered. That mark is Filing.optionalDetails.domainRegisteredAt.
 */
export function DomainRegistrationRow({
  filingId,
  registered,
  preferredDomain,
  compact = false,
}: {
  filingId: string;
  registered: boolean;
  preferredDomain: string | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'mt-2 space-y-1.5' : 'mt-3 space-y-1.5'}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warn" size="sm">
          Domain: register manually
        </Badge>
        {registered ? (
          <Badge variant="success" size="sm">
            Domain: registered
          </Badge>
        ) : null}
        <MarkDomainRegisteredButton filingId={filingId} registered={registered} />
      </div>
      {compact && !preferredDomain ? null : (
        <p className="text-xs text-ink-subtle">
          Preferred domain: {preferredDomain ?? 'Not collected'}
        </p>
      )}
    </div>
  );
}
