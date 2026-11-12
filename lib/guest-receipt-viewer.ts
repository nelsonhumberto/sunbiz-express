import 'server-only';

import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/guest';
import { PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import { retrieveCheckoutSession } from '@/lib/retrieve-checkout-session';
import { gateCheckoutSuccess } from '@/lib/checkout-session-verification';
import { checkoutSuccessQuery, guestMaySeePaidReceipt, isCheckoutSuccessPath } from '@/lib/guest-receipt-access';

export interface GuestReceiptViewer {
  userId: string;
  email: string;
  filingId: string;
}

/**
 * Signed-out visitor who may render /checkout/success.
 * Null for every other path, a missing cookie, a filing they do not own,
 * or a filing that is not paid.
 */
export async function guestReceiptViewer(): Promise<GuestReceiptViewer | null> {
  const headerStore = headers();
  const pathname = headerStore.get('x-lf-pathname') || headerStore.get(PUBLIC_PATH_HEADER);
  if (!isCheckoutSuccessPath(pathname)) return null;

  const { filingId, sessionId } = checkoutSuccessQuery(headerStore.get('x-lf-search'));
  if (!filingId) return null;

  const token = cookies().get(GUEST_COOKIE)?.value;
  if (!token) return null;

  const guest = await prisma.user.findUnique({
    where: { guestToken: token },
    select: { id: true, email: true, accountStatus: true },
  });
  if (!guest || guest.accountStatus !== 'GUEST') return null;

  const filing = await prisma.filing.findFirst({
    where: { id: filingId, userId: guest.id },
    select: {
      id: true,
      userId: true,
      payments: {
        where: { status: 'SUCCEEDED' },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!filing) return null;

  let checkoutSessionPaid = false;
  if (filing.payments.length === 0 && sessionId) {
    const snapshot = await retrieveCheckoutSession(sessionId);
    const gate = gateCheckoutSuccess({
      sessionId,
      session: snapshot,
      owner: {
        userId: guest.id,
        email: guest.email,
        requestedFilingId: filing.id,
        ownedFilingIds: [filing.id],
      },
    });
    checkoutSessionPaid = gate.status === 'paid';
  }

  if (
    !guestMaySeePaidReceipt({
      pathname,
      cookieUserId: guest.id,
      filingUserId: filing.userId,
      hasSucceededPayment: filing.payments.length > 0,
      checkoutSessionPaid,
    })
  ) {
    return null;
  }

  return { userId: guest.id, email: guest.email, filingId: filing.id };
}
