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
