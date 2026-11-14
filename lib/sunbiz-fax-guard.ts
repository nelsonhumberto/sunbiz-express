/**
 * The admin "FILE the company" action faxes Sunbiz. A filing marked isTest,
 * or owned by an isTester user, must never place that call.
 */

export const SUNBIZ_FAX_TEST_BLOCK_MESSAGE =
  'No fax was sent. This filing or its user is marked as a test.';

export type SunbizFaxTestFlags = {
  isTest?: boolean | null;
  isTester?: boolean | null;
};

export function sunbizFaxBlocked(flags: SunbizFaxTestFlags | null | undefined): boolean {
  if (!flags) return false;
  return flags.isTest === true || flags.isTester === true;
}

export function sunbizFaxBlockBody(flags: SunbizFaxTestFlags | null | undefined): {
  error: 'test_filing';
  dryRun: true;
  message: string;
} | null {
  if (!sunbizFaxBlocked(flags)) return null;
  return {
    error: 'test_filing',
    dryRun: true,
    message: SUNBIZ_FAX_TEST_BLOCK_MESSAGE,
  };
}
