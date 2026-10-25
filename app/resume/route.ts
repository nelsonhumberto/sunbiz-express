import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';
import { guestResumeAllowed } from '@/lib/guest-identity';
import { hrefForLocale } from '@/lib/app-href';
import { PUBLIC_PATH_HEADER, localeFromPublicPath } from '@/lib/locale-paths';
import { localeFromPathOrFiling } from '@/lib/request-locale';
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

  const seenPath = request.headers.get(PUBLIC_PATH_HEADER) || new URL(request.url).pathname;
  const pathLocale = localeFromPublicPath(seenPath);
  const fail = () =>
    NextResponse.redirect(
      new URL(hrefForLocale('/start', pathLocale === 'es' ? 'es' : 'en'), request.url),
    );
  if (!filingId || !token) return fail();

  const user = await prisma.user.findUnique({
    where: { guestToken: token },
    select: { id: true, accountStatus: true, guestToken: true },
  });

  const filing = user
    ? await prisma.filing.findUnique({
        where: { id: filingId },
        select: { id: true, userId: true, currentStep: true, status: true, locale: true },
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
    new URL(
      hrefForLocale(
        resumeWizardPath(filing.id, filing.currentStep),
        localeFromPathOrFiling(pathLocale === 'es' ? 'es' : null, filing.locale),
      ),
      request.url,
    ),
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
