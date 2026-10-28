import 'server-only';

import { cookies } from 'next/headers';
import { isLaunchformaQaEmail } from '@/lib/ads-conversions';
import { prisma } from '@/lib/db';
import { QA_COOKIE, qaGuestStampPlan } from '@/lib/qa-marker';

/** The browser asked for QA. Readable by server actions after the cookie is set. */
export function qaMarkedFromRequest(): boolean {
  return cookies().get(QA_COOKIE)?.value === '1';
}

/**
 * Guest filings opened with a qa+@launchforma.com address are test traffic.
 * One stamp covers every create path: the filing is isTest and its user is isTester.
 */
export async function stampQaLaunchformaGuest(input: {
  userId: string;
  filingId: string;
  emails?: Array<string | null | undefined>;
  /** Browser asked for QA with ?qa=1 or utm_campaign=qa_*. Suppresses that draft only. */
  qaMarked?: boolean;
}): Promise<boolean> {
  const emailHit = (input.emails ?? []).some((email) => isLaunchformaQaEmail(email));
  if (!emailHit && !input.qaMarked) return false;
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { accountStatus: true },
  });
  const plan = qaGuestStampPlan({
    emailHit,
    qaMarked: input.qaMarked,
    accountStatus: user?.accountStatus,
  });
  if (!plan.markUser && !plan.markFiling) return false;
  if (plan.markUser) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { isTester: true },
    });
  }
  if (plan.markFiling) {
    await prisma.filing.update({
      where: { id: input.filingId },
      data: { isTest: true },
    });
  }
  return true;
}
