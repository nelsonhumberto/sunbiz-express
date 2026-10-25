'use server';

import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';
import { getGuestUser, newGuestToken, setGuestCookie, clearGuestCookie, GUEST_COOKIE } from '@/lib/guest';
import {
  isPlaceholderGuestEmail,
  planGuestDraftAttach,
  planGuestEmailWrite,
  shouldAttachGuestDraft,
  wizardHrefForDraft,
  type GuestEmailOwner,
} from '@/lib/guest-identity';
import { createLoginLink, LOGIN_LINK_TTL_DAYS } from '@/lib/login-link';
import { safeParseJson } from '@/lib/utils';
import { storedLocale } from '@/lib/stored-locale';
import { cookies } from 'next/headers';

export interface GuestEmailResult {
  ok: boolean;
  error?: string;
  needsSignIn?: boolean;
  sent?: boolean;
  ownerId?: string;
}

async function writePendingAccountEmail(filingId: string, email: string | null, existing: string | null) {
  const prev = safeParseJson<Record<string, unknown>>(existing, {}) ?? {};
  if (email) prev.pendingAccountEmail = email;
  else delete prev.pendingAccountEmail;
  await prisma.filing.update({
    where: { id: filingId },
    data: { optionalDetails: JSON.stringify(prev) },
  });
}

/**
 * Store the email the visitor typed on the guest draft.
 * A free mailbox is written to User.email (what the resume drip sends to).
 * Another guest with that mailbox adopts this draft.
 * An existing account is not overwritten. Checkout asks them to sign in.
 */
export async function saveGuestEmail(filingId: string, rawEmail: string): Promise<GuestEmailResult> {
  const t = await getTranslations('wizard');
  const guest = await getGuestUser();
  if (!guest) return { ok: false, error: t('errorSaveGeneric') };

  const filing = await prisma.filing.findFirst({
    where: { id: filingId, userId: guest.id, status: 'DRAFT' },
    select: { id: true, optionalDetails: true },
  });
  if (!filing) return { ok: false, error: t('errorSaveGeneric') };

  const normalized = normalizeEmail(rawEmail);
  if (!isDeliverableEmail(normalized) || isPlaceholderGuestEmail(normalized)) {
    return { ok: false, error: t('guestEmailInvalid') };
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, accountStatus: true, guestToken: true },
  });

  let owner: GuestEmailOwner = 'free';
  if (existing?.id === guest.id) owner = 'self';
  else if (existing?.accountStatus === 'GUEST') owner = 'guest';
  else if (existing?.accountStatus === 'ACTIVE') owner = 'account';
  else if (existing) return { ok: false, error: t('guestEmailInvalid') };

  const plan = planGuestEmailWrite(owner);

  if (plan === 'hold_for_signin') {
    await writePendingAccountEmail(filing.id, normalized, filing.optionalDetails);
    return { ok: false, needsSignIn: true, error: t('guestEmailHasAccount') };
  }

  if (plan === 'write') {
    await prisma.user.update({
      where: { id: guest.id },
      data: { email: normalized },
    });
  }

  if (plan === 'adopt_guest' && existing) {
    let token = existing.guestToken;
    if (!token) {
      token = newGuestToken();
      await prisma.user.update({
        where: { id: existing.id },
        data: { guestToken: token },
      });
    }
    await prisma.filing.update({
      where: { id: filing.id },
      data: { userId: existing.id },
    });
    const remaining = await prisma.filing.count({ where: { userId: guest.id } });
    if (remaining === 0) {
      await prisma.user.update({
        where: { id: guest.id },
        data: { accountStatus: 'DELETED', guestToken: null },
      });
    }
    setGuestCookie(token);
    await writePendingAccountEmail(filing.id, null, filing.optionalDetails);
    return { ok: true, ownerId: existing.id };
  }

  await writePendingAccountEmail(filing.id, null, filing.optionalDetails);
  return { ok: true, ownerId: guest.id };
}

/** Email a one-time sign-in link that claims this guest at the payment step. */
export async function sendGuestCheckoutLink(
  filingId: string,
  rawEmail: string,
): Promise<GuestEmailResult> {
  const t = await getTranslations('wizard');
  const saved = await saveGuestEmail(filingId, rawEmail);
  if (!saved.ok || saved.needsSignIn || !saved.ownerId) return saved;

  const owner = await prisma.user.findUnique({
    where: { id: saved.ownerId },
    select: { id: true, email: true, firstName: true, accountStatus: true },
  });
  if (!owner || isPlaceholderGuestEmail(owner.email)) {
    return { ok: false, error: t('guestEmailInvalid') };
  }

  const locale = await storedLocale();
  const link = await createLoginLink(owner.id, `/wizard/${filingId}/11`);
  await sendEmail({
    type: 'CHECKOUT_LOGIN_LINK',
    to: owner.email,
    userId: owner.id,
    filingId,
    context: {
      firstName: owner.firstName?.trim() || undefined,
      resumeUrl: link,
      locale: locale ?? undefined,
      linkExpiresInDays: LOGIN_LINK_TTL_DAYS,
    },
  });
  return { ok: true, sent: true, ownerId: owner.id };
}

export interface AttachGuestDraftsResult {
  movedIds: string[];
  resumeHref: string | null;
}

/**
 * Move this browser's guest drafts onto the account that just signed up
 * or signed in. Password claim of the same row is already attached.
 */
export async function attachGuestDraftsToAccount(
  accountUserId: string,
): Promise<AttachGuestDraftsResult> {
  const token = cookies().get(GUEST_COOKIE)?.value;
  if (!token) return { movedIds: [], resumeHref: null };

  const guest = await prisma.user.findUnique({
    where: { guestToken: token },
    select: { id: true, accountStatus: true, email: true },
  });
  if (!guest || guest.accountStatus !== 'GUEST') return { movedIds: [], resumeHref: null };

  const account = await prisma.user.findUnique({
    where: { id: accountUserId },
    select: { id: true, email: true },
  });
  if (!account || !shouldAttachGuestDraft({ guestEmail: guest.email, accountEmail: account.email })) {
    return { movedIds: [], resumeHref: null };
  }

  const drafts = await prisma.filing.findMany({
    where: { userId: guest.id, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, currentStep: true },
  });
  const plan = planGuestDraftAttach({
    guestUserId: guest.id,
    accountUserId: account.id,
    draftFilingIds: drafts.map((draft) => draft.id),
  });
  if (plan.action !== 'move') {
    return {
      movedIds: [],
      resumeHref: drafts[0] ? wizardHrefForDraft(drafts[0].id, drafts[0].currentStep) : null,
    };
  }

  if (plan.filingIds.length > 0) {
    await prisma.filing.updateMany({
      where: { id: { in: plan.filingIds }, userId: guest.id, status: 'DRAFT' },
      data: { userId: account.id },
    });
  }
  const remaining = await prisma.filing.count({ where: { userId: guest.id } });
  if (remaining === 0 && plan.retireGuestUserId) {
    await prisma.user.update({
      where: { id: plan.retireGuestUserId },
      data: { accountStatus: 'DELETED', guestToken: null },
    });
  }
  clearGuestCookie();
  const latest = drafts[0];
  return {
    movedIds: plan.filingIds,
    resumeHref: latest ? wizardHrefForDraft(latest.id, latest.currentStep) : null,
  };
}
