'use server';

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { newGuestToken, setGuestCookie, GUEST_COOKIE, getGuestUser } from '@/lib/guest';
import { sendEmail } from '@/lib/email';
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

const StartSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  state: z.enum(['FL', 'WY', 'DE']).optional(),
  entityType: z.enum(['LLC', 'CORP']).optional(),
  // Preselected package from a pricing CTA. Defaults to STANDARD when absent
  // or invalid so the wizard's tier step still works.
  tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']).optional(),
});

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
 * /sign-in instead of silently merging — that prevents account-takeover.
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { firstName, lastName, entityType } = parsed.data;
  const serviceTier = parsed.data.tier ?? 'STANDARD';
  const email = parsed.data.email.toLowerCase().trim();
  const stateCode: StateCode = (parsed.data.state ?? 'FL') as StateCode;
  if (!ACTIVE_FORMATION_STATES.includes(stateCode)) {
    return { error: 'That state is not yet available.' };
  }

  // Authed users skip guest entirely — go straight to filing creation.
  const session = await auth();
  if (session?.user?.id) {
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType: entityType ?? 'LLC',
        state: stateCode,
        serviceTier,
        currentStep: 2,
        completedSteps: JSON.stringify([1]),
        ...filingUtmCreateFields(),
      },
    });
    redirect(`/wizard/${filing.id}/2`);
  }

  // Block reuse of an existing ACTIVE account from this entry path.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.accountStatus !== 'GUEST') {
    redirect(`/sign-in?email=${encodeURIComponent(email)}&from=start`);
  }

  // Create a fresh GUEST user (or reuse if the same email already started).
  let guestUser = existing;
  let token = guestUser?.guestToken ?? null;
  if (!guestUser) {
    token = newGuestToken();
    // We MUST satisfy the non-null `passwordHash` constraint. Use a random
    // unguessable hash that the credentials provider can never validate.
    const placeholderPassword = await bcrypt.hash(
      crypto.randomBytes(32).toString('hex'),
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

  // Spin up a draft filing for them. Step 1 (entity + state) is implicitly
  // complete because /start already collected both, so we drop them at the
  // name step instead of re-asking.
  const filing = await prisma.filing.create({
    data: {
      userId: guestUser.id,
      entityType: entityType ?? 'LLC',
      state: stateCode,
      serviceTier,
      currentStep: 2,
      completedSteps: JSON.stringify([1]),
      ...filingUtmCreateFields(),
    },
  });

  redirect(`/wizard/${filing.id}/2`);
}

// ─── Claim Account (popup → real account) ────────────────────────────────

const ClaimSchema = z.object({
  email: z.string().email(),
});

export interface ClaimResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

/**
 * Convert the current GUEST user into an ACTIVE account. Generates a random
 * password, sets it on the user, emails them the credentials, clears the
 * guest token, and keeps them in the wizard. The user can change the email
 * (e.g. they signed up with a typo) — if changed we re-check for collisions.
 */
export async function claimGuestAccount(
  _prev: ClaimResult,
  formData: FormData,
): Promise<ClaimResult> {
  const parsed = ClaimSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: 'Please enter a valid email.' };
  }
  const newEmail = parsed.data.email.toLowerCase().trim();

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

  const tempPassword = generateReadablePassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: guest.id },
    data: {
      email: newEmail,
      passwordHash,
      accountStatus: 'ACTIVE',
      emailVerified: false,
      guestToken: null,
    },
  });

  // Send credentials via the regular email pipeline. The user can sign in
  // immediately or keep filing as is — both paths work because the wizard
  // already has a draft attached to this user.
  try {
    await sendEmail({
      type: 'WELCOME',
      to: newEmail,
      userId: guest.id,
      context: {
        firstName: guest.firstName,
        tempPassword,
        loginEmail: newEmail,
      },
    });
  } catch {
    // We never block the conversion on email delivery.
  }

  // Clear guest cookie — they now have a real account they can sign in with.
  cookies().delete(GUEST_COOKIE);

  return {
    ok: true,
    message: `Account created. Sign-in details have been emailed to ${newEmail}.`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build a short, readable, sufficiently-strong password that we can email
 * to a freshly-converted guest. 14 characters across 4 character classes is
 * comfortably above OWASP minimums.
 */
function generateReadablePassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 10 }, () => pick(all));
  return [...required, ...rest]
    .sort(() => crypto.randomInt(0, 2) - 0.5)
    .join('');
}
