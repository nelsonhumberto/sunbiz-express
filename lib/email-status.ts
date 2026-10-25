/** Recorded when a qa+ or e2e+ recipient is not handed to a provider. */
export const EMAIL_STATUS_SKIPPED_TEST = 'SKIPPED_TEST';

/** The outbox has the message. qa+ and e2e+ use SKIPPED_TEST instead of SENT. */
export function isRecordedEmailStatus(status: string): boolean {
  return status === 'SENT' || status === EMAIL_STATUS_SKIPPED_TEST;
}
