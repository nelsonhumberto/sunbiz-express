'use server';

import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';
import { getGuestUser, clearGuestCookie, GUEST_COOKIE } from '@/lib/guest';
import {
  isPlaceholderGuestEmail,
  planGuestDraftAttach,
  planGuestEmailWrite,
  readTypedGuestEmail,
  shouldAttachGuestDraft,
  wizardHrefForDraft,
  type GuestEmailOwner,
} from '@/lib/guest-identity';
import { guestResumeUrl } from '@/lib/draft-recovery';
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

async function writeGuestEmailAside(
  filingId: string,
  existing: string | null,
  patch: { pendingAccountEmail?: string | null; typedGuestEmail?: string | null },
) {
  const prev = safeParseJson<Record<string, unknown>>(existing, {}) ?? {};
  for (const key of ['pendingAccountEmail', 'typedGuestEmail'] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value) prev[key] = value;
    else delete prev[key];
  }
  await prisma.filing.update({
    where: { id: filingId },
    data: { optionalDetails: JSON.stringify(prev) },
  });
}

/**
 * Store the email the visitor typed on the guest draft.
 * A free mailbox is written to User.email (what the resume drip sends to).
 * Another guest or account keeps this draft on this browser. The typed
 * address is stored on this filing only, so the drip can still mail it
 * with this guest's own resume token. Nothing is revealed about the other row.
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
    select: { id: true, accountStatus: true },
  });

  let owner: GuestEmailOwner = 'free';
  if (existing?.id === guest.id) owner = 'self';
  else if (existing?.accountStatus === 'GUEST') owner = 'guest';
  else if (existing?.accountStatus === 'ACTIVE') owner = 'account';
  else if (existing) return { ok: false, error: t('guestEmailInvalid') };

  const plan = planGuestEmailWrite(owner);

  if (plan === 'hold_for_signin') {
    await writeGuestEmailAside(filing.id, filing.optionalDetails, {
      pendingAccountEmail: normalized,
      typedGuestEmail: normalized,
    });
    return { ok: false, needsSignIn: true, error: t('guestEmailHasAccount') };
  }

  if (plan === 'keep_own') {
    await writeGuestEmailAside(filing.id, filing.optionalDetails, {
      pendingAccountEmail: null,
      typedGuestEmail: normalized,
    });
    return { ok: true, ownerId: guest.id };
  }

  if (plan === 'write') {
    await prisma.user.update({
      where: { id: guest.id },
      data: { email: normalized },
    });
  }

  await writeGuestEmailAside(filing.id, filing.optionalDetails, {
    pendingAccountEmail: null,
    typedGuestEmail: null,
  });
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

  const typed = normalizeEmail(rawEmail);
  const owner = await prisma.user.findUnique({
    where: { id: saved.ownerId },
    select: { id: true, email: true, firstName: true, accountStatus: true, guestToken: true },
  });
  if (!owner || !isDeliverableEmail(typed)) {
    return { ok: false, error: t('guestEmailInvalid') };
  }

  const locale = await storedLocale();
  const ownsMailbox =
    !isPlaceholderGuestEmail(owner.email) && normalizeEmail(owner.email) === typed;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const resumeUrl =
    ownsMailbox
      ? await createLoginLink(owner.id, `/wizard/${filingId}/11`)
      : owner.accountStatus === 'GUEST' && owner.guestToken
        ? guestResumeUrl(siteUrl, filingId, owner.guestToken)
        : null;
  if (!resumeUrl) return { ok: false, error: t('guestEmailInvalid') };

  await sendEmail({
    type: 'CHECKOUT_LOGIN_LINK',
    to: ownsMailbox ? owner.email : typed,
    userId: owner.id,
    filingId,
    context: {
      firstName: owner.firstName?.trim() || undefined,
      resumeUrl,
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
  if (!account) return { movedIds: [], resumeHref: null };

  const drafts = await prisma.filing.findMany({
    where: { userId: guest.id, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, currentStep: true, optionalDetails: true },
  });
  const typedEmails = drafts
    .map((draft) => readTypedGuestEmail(draft.optionalDetails))
    .filter((email): email is string => Boolean(email));
  if (
    !shouldAttachGuestDraft({
      guestEmail: guest.email,
      accountEmail: account.email,
      typedEmails,
    })
  ) {
    return { movedIds: [], resumeHref: null };
  }

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
