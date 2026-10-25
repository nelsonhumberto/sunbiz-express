import 'server-only';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { normalizeEmail } from '@/lib/email-address';
import { planGuestAccountClaim } from '@/lib/guest-checkout';

/** Checkout set-password links stay valid for three days, same as a magic link. */
const SET_PASSWORD_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface GuestClaimResult {
  claimed: boolean;
  email?: string;
  /** In-memory only. Used to open a session for this row. Never emailed. */
  password?: string;
}

/**
 * Turn the paying guest into an account and email a set-password link.
 * Idempotent: a second call sees ACTIVE and does not send again.
 * The filing and payment already belong to this user id, so claiming does
 * not move them onto anyone else.
 */
export async function claimPaidGuestAccount(input: {
  userId: string;
  filingId: string;
  locale?: string | null;
}): Promise<GuestClaimResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, accountStatus: true, firstName: true },
  });
  if (!user) return { claimed: false };

  const email = normalizeEmail(user.email);
  const emailOwner = await prisma.user.findUnique({
    where: { email },
    select: { id: true, accountStatus: true },
  });
  const plan = planGuestAccountClaim({
    userId: user.id,
    accountStatus: user.accountStatus,
    email,
    emailOwner,
  });
  if (plan.action !== 'claim') return { claimed: false };

  const password = generateSetPasswordSecret();
  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await prisma.user.updateMany({
    where: { id: user.id, accountStatus: 'GUEST' },
    data: {
      passwordHash,
      accountStatus: 'ACTIVE',
      guestToken: null,
    },
  });
  if (updated.count !== 1) return { claimed: false };

  try {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SET_PASSWORD_TTL_MS),
      },
    });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
    await sendEmail({
      type: 'GUEST_SET_PASSWORD',
      to: plan.email,
      userId: user.id,
      filingId: input.filingId,
      context: {
        firstName: user.firstName?.trim() || undefined,
        resetUrl: `${siteUrl}/reset-password?token=${token}`,
        locale: input.locale ?? undefined,
        loginEmail: plan.email,
      },
    });
  } catch (err) {
    logger.error(
      'guest set-password email failed',
      { area: 'checkout', entityId: user.id, tag: 'guest-set-password' },
      err,
    );
  }

  return { claimed: true, email: plan.email, password };
}

function generateSetPasswordSecret(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 10 }, () => pick(all));
  return [...required, ...rest].sort(() => crypto.randomInt(0, 2) - 0.5).join('');
}
