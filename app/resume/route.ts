import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';

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
    select: { id: true, accountStatus: true },
  });
  if (!user || user.accountStatus !== 'GUEST') return fail();

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { id: true, userId: true, currentStep: true, status: true },
  });
  if (!filing || filing.userId !== user.id) return fail();

  // Submitted filings can't be resumed in the wizard - send to /start which
  // will route appropriately.
  if (filing.status !== 'DRAFT') return fail();

  const step = filing.currentStep && filing.currentStep >= 1 ? filing.currentStep : 2;
  const res = NextResponse.redirect(new URL(`/wizard/${filing.id}/${step}`, request.url));
  res.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
