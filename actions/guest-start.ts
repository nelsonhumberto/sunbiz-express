'use server';

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { auth, signIn } from '@/lib/auth';
import { newGuestToken, setGuestCookie, clearGuestCookie, getGuestUser } from '@/lib/guest';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { isRedirectError, withActionTimeout } from '@/lib/action-timeout';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { PREFERRED_STATE_COOKIE } from '@/lib/constants';
import {
  ensureUserFirstTouchUtm,
  filingUtmCreateFields,
  userUtmCreateFields,
} from '@/lib/utm-attribution';
import { getTranslations } from 'next-intl/server';
import { syncSCorpElectionAddOn } from '@/actions/wizard';
import type { TierSlug } from '@/lib/pricing';
import { normalizeNameCheckQuery } from '@/lib/name-check';

const StartSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  state: z.enum(['FL', 'WY', 'DE']).optional(),
  // SCORP is a customer-facing label for Corporation + S-Corp tax election.
  entityType: z.enum(['LLC', 'CORP', 'SCORP']).optional(),
  // Preselected package from a pricing CTA. Defaults to STANDARD when absent
  // or invalid so the wizard's tier step still works.
  tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']).optional(),
  // Business name seeded by the assistant (?name=) so the draft starts further along.
  businessName: z.string().max(100).optional(),
});

function resolveEntityChoice(choice: 'LLC' | 'CORP' | 'SCORP' | undefined): {
  entityType: 'LLC' | 'CORP';
  taxElection: 'S_CORP' | null;
} {
  if (choice === 'SCORP') return { entityType: 'CORP', taxElection: 'S_CORP' };
  if (choice === 'CORP') return { entityType: 'CORP', taxElection: null };
  return { entityType: 'LLC', taxElection: null };
}

export interface StartGuestResult {
  ok?: boolean;
  error?: string;
}

/**
 * Begin a guest filing. Creates (or reuses) a shadow GUEST user, attaches a
 * fresh draft Filing in the chosen state, sets the guest cookie, and
 * redirects into the wizard.
 *
 * If an email already belongs to a normal ACTIVE user, we redirect to
 * /sign-in instead of silently merging - that prevents account-takeover.
 */
export async function startGuestFiling(
  _prev: StartGuestResult,
  formData: FormData,
): Promise<StartGuestResult> {
  const parsed = StartSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    state: formData.get('state') ?? undefined,
    entityType: formData.get('entityType') ?? undefined,
    tier: (formData.get('tier') as string)?.toUpperCase() || undefined,
    businessName: (formData.get('businessName') as string)?.trim() || undefined,
  });
  const t = await getTranslations('start');
  if (!parsed.success) {
    return { error: t('errorInvalid') };
  }

  const { firstName, lastName } = parsed.data;
  const { entityType, taxElection } = resolveEntityChoice(parsed.data.entityType);
  const serviceTier = parsed.data.tier ?? 'STANDARD';
  const seededName = normalizeNameCheckQuery(parsed.data.businessName) || null;
  const email = parsed.data.email.toLowerCase().trim();
  const stateCode: StateCode = (parsed.data.state ?? 'FL') as StateCode;
  if (!ACTIVE_FORMATION_STATES.includes(stateCode)) {
    return { error: t('errorStateUnavailable') };
  }

  // Authed users skip guest entirely - go straight to filing creation.
  const session = await auth();
  if (session?.user?.id) {
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType,
        taxElection,
        state: stateCode,
        serviceTier,
        businessName: seededName,
        currentStep: 2,
        completedSteps: JSON.stringify([1]),
        ...filingUtmCreateFields(),
      },
    });
    await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);
    redirect(`/wizard/${filing.id}/2`);
  }

  // Block reuse of an existing ACTIVE account from this entry path.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.accountStatus !== 'GUEST') {
    const next = encodeURIComponent('/dashboard');
    redirect(
      `/sign-in?email=${encodeURIComponent(email)}&from=start&next=${next}`,
    );
  }

  // Create a fresh GUEST user (or reuse if the same email already started).
  let guestUser = existing;
  let token = guestUser?.guestToken ?? null;
  if (!guestUser) {
    token = newGuestToken();
    // We MUST satisfy the non-null `passwordHash` constraint. Use a random
    // unguessable hash that the credentials provider can never validate.
    const placeholderPassword = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      10,
    );
    guestUser = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash: placeholderPassword,
        accountStatus: 'GUEST',
        guestToken: token,
        ...userUtmCreateFields(),
      },
    });
  } else if (!token) {
    // Guest record exists but token is missing (shouldn't happen, but recover).
    token = newGuestToken();
    await prisma.user.update({
      where: { id: guestUser.id },
      data: { guestToken: token, firstName, lastName },
    });
  } else {
    await prisma.user.update({
      where: { id: guestUser.id },
      data: { firstName, lastName },
    });
    await ensureUserFirstTouchUtm(guestUser.id);
  }

  setGuestCookie(token!);

  // Persist preferred state for the marketing chrome.
  cookies().set(PREFERRED_STATE_COOKIE, stateCode, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  // Returning guest? Resume their existing draft instead of spawning a new one
  // on every /start submit (prevents draft sprawl + loses no progress).
  if (existing) {
    const draft = await prisma.filing.findFirst({
      where: { userId: guestUser.id, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, currentStep: true },
    });
    if (draft) {
      const step = draft.currentStep && draft.currentStep >= 1 ? draft.currentStep : 2;
      redirect(`/wizard/${draft.id}/${step}`);
    }
  }

  // Spin up a draft filing. Step 1 is already done, so we open step 2.
  // A name from ?name= is prefilled there and checked on arrival.
  const filing = await prisma.filing.create({
    data: {
      userId: guestUser.id,
      entityType,
      taxElection,
      state: stateCode,
      serviceTier,
      businessName: seededName,
      currentStep: 2,
      completedSteps: JSON.stringify([1]),
      ...filingUtmCreateFields(),
    },
  });
  await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);

  redirect(`/wizard/${filing.id}/2`);
}

// ─── Claim Account (popup → real account) ────────────────────────────────

const ClaimSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
  filingId: z.string().optional(),
});

export interface ClaimResult {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Wizard (or dashboard) path that still has this draft. */
  resumeHref?: string;
  signedIn?: boolean;
  fieldErrors?: Record<string, string>;
}

/**
 * Convert the current GUEST user into an ACTIVE account. The customer sets
 * the password in the form. We keep them a guest until sign-in succeeds so a
 * failed sign-in does not dump them on /sign-in without the draft. The welcome
 * email does not include a temporary password.
 */
export async function claimGuestAccount(
  _prev: ClaimResult,
  formData: FormData,
): Promise<ClaimResult> {
  const parsed = ClaimSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    filingId: (formData.get('filingId') as string) || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return {
      error: fieldErrors.password ?? fieldErrors.email ?? 'Please check your details.',
      fieldErrors,
    };
  }
  const newEmail = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;

  const guest = await getGuestUser();
  if (!guest) return { error: 'Your guest session has expired. Please start again.' };

  // If the customer typed a different email than the one already on the
  // guest record, check that it is not already taken by an ACTIVE account.
  if (newEmail !== guest.email) {
    const collision = await prisma.user.findUnique({ where: { email: newEmail } });
    if (collision && collision.id !== guest.id) {
      return {
        error:
          'That email is already in use. Sign in to that account, or use a different email.',
      };
    }
  }

  const resumeHref = await draftResumeHref(guest.id, parsed.data.filingId);

  // Set the password they chose, but stay a GUEST until sign-in succeeds.
  // Clearing the guest session first is what dropped people on /sign-in and
  // detached the browser from the draft.
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: guest.id },
    data: {
      email: newEmail,
      passwordHash,
    },
  });

  let signedIn = false;
  try {
    await withActionTimeout(
      signIn('credentials', {
        email: newEmail,
        password,
        redirect: false,
      }),
      8_000,
    );
    signedIn = true;
  } catch (err) {
    if (isRedirectError(err)) {
      signedIn = true;
    } else {
      logger.error(
        'guest account claim: sign-in failed',
        { area: 'guest', entityId: guest.id, tag: 'claim-signin' },
        err,
      );
    }
  }

  if (signedIn) {
    await prisma.user.update({
      where: { id: guest.id },
      data: {
        accountStatus: 'ACTIVE',
        emailVerified: false,
        guestToken: null,
      },
    });
    clearGuestCookie();
  }

  // Welcome email has no temporary password. Don't block the draft on delivery.
  try {
    await withActionTimeout(
      sendEmail({
        type: 'WELCOME',
        to: newEmail,
        userId: guest.id,
        context: { firstName: guest.firstName },
      }),
      4_000,
    );
  } catch (err) {
    logger.error(
      'guest account claim: welcome email failed',
      { area: 'guest', entityId: guest.id, tag: 'claim-email' },
      err,
    );
  }

  return {
    ok: true,
    signedIn,
    resumeHref,
    message: signedIn
      ? 'Account created. Your draft is saved to this account.'
      : 'Password saved. Your draft is still open. Continue it below or sign in with that password.',
  };
}

async function draftResumeHref(userId: string, filingId?: string): Promise<string> {
  if (filingId) {
    const owned = await prisma.filing.findFirst({
      where: { id: filingId, userId, status: 'DRAFT' },
      select: { id: true, currentStep: true },
    });
    if (owned) {
      const step = owned.currentStep && owned.currentStep >= 1 ? owned.currentStep : 2;
      return `/wizard/${owned.id}/${step}`;
    }
  }
  const draft = await prisma.filing.findFirst({
    where: { userId, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, currentStep: true },
  });
  if (!draft) return '/dashboard';
  const step = draft.currentStep && draft.currentStep >= 1 ? draft.currentStep : 2;
  return `/wizard/${draft.id}/${step}`;
}
