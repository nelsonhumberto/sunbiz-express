import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db';
import { loginLinkClaimPlan } from './guest-identity';
import { safeRedirectPath } from './utils';

export const LOGIN_LINK_COOKIE = 'lf_login_link';
export const LOGIN_LINK_TTL_DAYS = 3;

/** 32 random bytes in base64url: 43 chars, no padding. */
export const LOGIN_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a one-time sign-in link that lands the user on `nextPath`. Older
 * unused links for the same user are revoked, so only one is ever live.
 */
export async function createLoginLink(userId: string, nextPath: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.loginLinkToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.loginLinkToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        nextPath: safeRedirectPath(nextPath) ?? '/dashboard',
        expiresAt: new Date(Date.now() + LOGIN_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    }),
  ]);
  return `${siteUrl}/api/login-link?token=${token}`;
}

/** Look a link up without consuming it. */
export async function findLoginLink(token: string) {
  if (!LOGIN_LINK_TOKEN_PATTERN.test(token)) return null;
  return prisma.loginLinkToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      userId: true,
      nextPath: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { firstName: true } },
    },
  });
}

/**
 * Consume a live link and return the account it signs in, or null when the
 * link is unknown, used, expired, or the account can't use link sign-in.
 * The conditional update makes consumption atomic: only one caller can win.
 */
export async function consumeLoginLink(token: string) {
  if (!LOGIN_LINK_TOKEN_PATTERN.test(token)) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const { count } = await prisma.loginLinkToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) return null;

  const row = await prisma.loginLinkToken.findUnique({
    where: { tokenHash },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          accountStatus: true,
          isTester: true,
        },
      },
    },
  });
  const user = row?.user;
  if (!user) return null;
  const plan = loginLinkClaimPlan(user.accountStatus, user.role);
  if (plan === 'deny') return null;
  if (plan === 'claim_guest') {
    // The draft already belongs to this row. Claiming it here is the attach.
    await prisma.user.update({
      where: { id: user.id },
      data: { accountStatus: 'ACTIVE', guestToken: null },
    });
    return { ...user, accountStatus: 'ACTIVE' };
  }
  return user;
}
