'use server';

import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';
import { stampQaLaunchformaGuest } from '@/lib/qa-guest';
import { auth, signOut } from '@/lib/auth';
import { getGuestUser, clearGuestCookie, GUEST_COOKIE } from '@/lib/guest';
import { redirectLocalized } from '@/lib/locale-redirect';
import {
  isPlaceholderGuestEmail,
  planGuestDraftAttach,
  planGuestEmailWrite,
  planMismatchedGuestSignIn,
  readGuestAsideEmails,
  wizardHrefForDraft,
  withoutPendingAccountEmail,
  type GuestEmailOwner,
} from '@/lib/guest-identity';
import { guestResumeUrl, resolveDripLocale, resumeDripMailbox, signInResumeUrl } from '@/lib/draft-recovery';
import { hrefForLocale } from '@/lib/app-href';
import { createLoginLink, LOGIN_LINK_TTL_DAYS } from '@/lib/login-link';
import { localeFromPathOrFiling } from '@/lib/request-locale';
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

async function guestCopy(filingLocale?: string | null) {
  const locale = localeFromPathOrFiling(await storedLocale(), filingLocale);
  return getTranslations({ locale, namespace: 'wizard' });
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
 *
 * `guest` is passed in so /start can save the address in the same request
 * that sets the guest cookie. The cookie is not readable until the next request.
 */
export async function storeGuestEmailOnDraft(
  guest: { id: string; email: string },
  filing: { id: string; optionalDetails: string | null; locale: string | null },
  rawEmail: string,
): Promise<GuestEmailResult> {
  const t = await guestCopy(filing.locale);
  const normalized = normalizeEmail(rawEmail);
  if (!isDeliverableEmail(normalized) || isPlaceholderGuestEmail(normalized)) {
    return { ok: false, error: t('guestEmailInvalid') };
  }

  await stampQaLaunchformaGuest({
    userId: guest.id,
    filingId: filing.id,
    emails: [normalized],
  });

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

export async function saveGuestEmail(filingId: string, rawEmail: string): Promise<GuestEmailResult> {
  const guest = await getGuestUser();
  const filing = guest
    ? await prisma.filing.findFirst({
        where: { id: filingId, userId: guest.id, status: 'DRAFT' },
        select: { id: true, optionalDetails: true, locale: true },
      })
    : null;
  const t = await guestCopy(filing?.locale);
  if (!guest || !filing) return { ok: false, error: t('errorSaveGeneric') };
  return storeGuestEmailOnDraft(guest, filing, rawEmail);
}

/**
 * Email the existing filing-started note with this guest's resume link.
 * Same mailbox rules as the resume drip. No new template.
 */
export async function sendGuestDraftResumeLink(filingId: string): Promise<GuestEmailResult> {
  const filing = await prisma.filing.findFirst({
    where: { id: filingId, status: 'DRAFT' },
    select: {
      id: true,
      locale: true,
      entryPath: true,
      businessName: true,
      currentStep: true,
      optionalDetails: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          locale: true,
          accountStatus: true,
          guestToken: true,
        },
      },
    },
  });
  const t = await guestCopy(filing?.locale);
  if (!filing?.user) return { ok: false, error: t('guestEmailInvalid') };
  const mailbox = resumeDripMailbox(filing.user.email, filing.optionalDetails);
  if (!mailbox) return { ok: false, error: t('guestEmailInvalid') };

  const locale = resolveDripLocale(filing.locale, filing.user.locale, filing.entryPath);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const step = filing.currentStep && filing.currentStep >= 2 ? filing.currentStep : 2;
  const resumeUrl =
    filing.user.accountStatus === 'GUEST' && filing.user.guestToken
      ? guestResumeUrl(siteUrl, filing.id, filing.user.guestToken, locale)
      : signInResumeUrl(siteUrl, `/wizard/${filing.id}/${step}`, locale);

  await sendEmail({
    type: 'FILING_STARTED',
    to: mailbox,
    userId: filing.user.id,
    filingId: filing.id,
    context: {
      firstName: filing.user.firstName?.trim() || undefined,
      businessName: filing.businessName ?? undefined,
      resumeUrl,
      locale,
    },
  });
  return { ok: true, sent: true, ownerId: filing.user.id };
}

/** Email a one-time sign-in link that claims this guest at the payment step. */
export async function sendGuestCheckoutLink(
  filingId: string,
  rawEmail: string,
): Promise<GuestEmailResult> {
  const saved = await saveGuestEmail(filingId, rawEmail);
  const filing = await prisma.filing.findFirst({
    where: { id: filingId },
    select: { locale: true },
  });
  const t = await guestCopy(filing?.locale);
  if (!saved.ok || saved.needsSignIn || !saved.ownerId) return saved;

  const typed = normalizeEmail(rawEmail);
  const owner = await prisma.user.findUnique({
    where: { id: saved.ownerId },
    select: { id: true, email: true, firstName: true, accountStatus: true, guestToken: true },
  });
  if (!owner || !isDeliverableEmail(typed)) {
    return { ok: false, error: t('guestEmailInvalid') };
  }

  const locale = localeFromPathOrFiling(await storedLocale(), filing?.locale);
  const ownsMailbox =
    !isPlaceholderGuestEmail(owner.email) && normalizeEmail(owner.email) === typed;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const resumeUrl =
    ownsMailbox
      ? await createLoginLink(owner.id, hrefForLocale(`/wizard/${filingId}/11`, locale))
      : owner.accountStatus === 'GUEST' && owner.guestToken
        ? guestResumeUrl(siteUrl, filingId, owner.guestToken, locale)
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
  const typedEmails = drafts.flatMap((draft) => readGuestAsideEmails(draft.optionalDetails));
  const latest = drafts[0] ?? null;
  const mismatch = planMismatchedGuestSignIn({
    guestEmail: guest.email,
    accountEmail: account.email,
    typedEmails,
    filingId: latest?.id ?? null,
    currentStep: latest?.currentStep,
  });
  // Different email: leave the draft on the guest. The notice explains why
  // and resumes it. Do not follow this with a filing move.
  if (!mismatch.attach) {
    return { movedIds: [], resumeHref: mismatch.noticeHref };
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
    for (const draft of drafts) {
      if (!plan.filingIds.includes(draft.id)) continue;
      const cleared = withoutPendingAccountEmail(draft.optionalDetails);
      if (!cleared || cleared === draft.optionalDetails) continue;
      await prisma.filing.update({
        where: { id: draft.id },
        data: { optionalDetails: cleared },
      });
    }
  }
  const remaining = await prisma.filing.count({ where: { userId: guest.id } });
  if (remaining === 0 && plan.retireGuestUserId) {
    await prisma.user.update({
      where: { id: plan.retireGuestUserId },
      data: { accountStatus: 'DELETED', guestToken: null },
    });
  }
  clearGuestCookie();
  return {
    movedIds: plan.filingIds,
    resumeHref: latest ? wizardHrefForDraft(latest.id, latest.currentStep) : null,
  };
}

const FILING_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

export interface GuestDraftEmailMismatchView {
  filingId: string;
  locale: 'en' | 'es';
}

/**
 * Signed-in account whose email is not the one on this browser's guest draft.
 * Returns null unless the cookie still owns that draft, so a filing id alone
 * cannot reveal it.
 */
export async function loadGuestDraftEmailMismatch(
  filingId: string,
): Promise<GuestDraftEmailMismatchView | null> {
  const resolved = await resolveMismatchedGuestDraft(filingId);
  if (!resolved) return null;
  return { filingId: resolved.filing.id, locale: resolved.locale };
}

/**
 * Sign out of the other account and either resume the guest draft or open
 * sign-in for the email the order was started with. The draft stays put
 * until that matching account signs in.
 */
export async function leaveMismatchedAccountForDraft(formData: FormData): Promise<void> {
  const filingId = String(formData.get('filingId') ?? '');
  const intent = formData.get('intent') === 'signin' ? 'signin' : 'guest';
  const resolved = await resolveMismatchedGuestDraft(filingId);
  if (!resolved || !resolved.plan.resumeHref) {
    await redirectLocalized('/dashboard');
    return;
  }
  const resume = resolved.plan.resumeHref;
  const target =
    intent === 'signin'
      ? `/sign-in?next=${encodeURIComponent(resume)}${
          resolved.typedEmail ? `&email=${encodeURIComponent(resolved.typedEmail)}` : ''
        }`
      : resume;
  await signOut({ redirectTo: hrefForLocale(target, resolved.locale) });
}

async function resolveMismatchedGuestDraft(filingId: string) {
  if (!FILING_ID_RE.test(filingId)) return null;
  const session = await auth();
  const accountEmail = session?.user?.email;
  if (!session?.user?.id || !accountEmail) return null;
  const guest = await getGuestUser();
  if (!guest) return null;
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: {
      id: true,
      userId: true,
      status: true,
      currentStep: true,
      optionalDetails: true,
      locale: true,
    },
  });
  if (!filing || filing.status !== 'DRAFT' || filing.userId !== guest.id) return null;
  const typedEmails = readGuestAsideEmails(filing.optionalDetails);
  const plan = planMismatchedGuestSignIn({
    guestEmail: guest.email,
    accountEmail,
    typedEmails,
    filingId: filing.id,
    currentStep: filing.currentStep,
  });
  if (plan.attach) return null;
  return {
    filing,
    plan,
    typedEmail: typedEmails[0] ?? null,
    locale: localeFromPathOrFiling(await storedLocale(), filing.locale),
  };
}
