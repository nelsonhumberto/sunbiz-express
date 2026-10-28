import 'server-only';

import { isLaunchformaQaEmail } from '@/lib/ads-conversions';
import { prisma } from '@/lib/db';

/**
 * Guest filings opened with a qa+@launchforma.com address are test traffic.
 * One stamp covers every create path: the filing is isTest and its user is isTester.
 */
export async function stampQaLaunchformaGuest(input: {
  userId: string;
  filingId: string;
  emails: Array<string | null | undefined>;
}): Promise<boolean> {
  if (!input.emails.some((email) => isLaunchformaQaEmail(email))) return false;
  await prisma.user.update({
    where: { id: input.userId },
    data: { isTester: true },
  });
  await prisma.filing.update({
    where: { id: input.filingId },
    data: { isTest: true },
  });
  return true;
}
