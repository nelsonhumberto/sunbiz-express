import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';
import { guestResumeAllowed } from '@/lib/guest-identity';
import { resumeWizardPath } from '@/lib/wizard-constants';

export const dynamic = 'force-dynamic';

/**
 * Guest resume link target. Recovery / re-engagement emails sent to a guest
 * (who has no password and no dashboard) link here with the filing id and the
 * guest token. We validate the token against the GUEST user that owns the
 * filing, re-set the HttpOnly guest cookie, and drop them back into the wizard
 * at their last step. Invalid/expired links fall back to /start.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filingId = searchParams.get('f') ?? '';
  const token = searchParams.get('t') ?? '';

  const fail = () => NextResponse.redirect(new URL('/start', request.url));
  if (!filingId || !token) return fail();

  const user = await prisma.user.findUnique({
    where: { guestToken: token },
    select: { id: true, accountStatus: true, guestToken: true },
  });

  const filing = user
    ? await prisma.filing.findUnique({
        where: { id: filingId },
        select: { id: true, userId: true, currentStep: true, status: true },
      })
    : null;

  if (
    !guestResumeAllowed({
      accountStatus: user?.accountStatus,
      guestToken: user?.guestToken,
      token,
      filingUserId: filing?.userId,
      guestUserId: user?.id,
      filingStatus: filing?.status,
    }) ||
    !filing
  ) {
    return fail();
  }

  const res = NextResponse.redirect(
    new URL(resumeWizardPath(filing.id, filing.currentStep), request.url),
  );
  res.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
