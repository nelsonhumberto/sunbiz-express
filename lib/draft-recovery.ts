/**
 * Drafts the recovery cron must not email. Pure so the route and tests
 * share one definition.
 */
export interface RecoveryDraft {
  isTest: boolean;
  adminArchivedAt: Date | null;
  userArchivedAt: Date | null;
  user: { role: string; email: string };
}

export function shouldSkipDraftRecovery(draft: RecoveryDraft): boolean {
  if (draft.isTest) return true;
  if (draft.adminArchivedAt || draft.userArchivedAt) return true;
  if (draft.user.role === 'ADMIN') return true;
  const email = draft.user.email.trim().toLowerCase();
  if (email.endsWith('@launchforma.com')) return true;
  return false;
}

/** The 7-day abandoned-draft email is sent once. abandonedAt is that stamp. */
export function shouldSkipSevenDayAbandoned(draft: { abandonedAt: Date | null }): boolean {
  return draft.abandonedAt != null;
}

/** Stamp abandonedAt only after a successful 7-day send for a DRAFT filing. */
export function shouldStampAbandonedAt(input: {
  status: string;
  notificationType: string;
  deliveryStatus: string;
}): boolean {
  return (
    input.notificationType === 'ABANDONED_7D' &&
    input.status === 'DRAFT' &&
    input.deliveryStatus === 'SENT'
  );
}
