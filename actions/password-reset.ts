'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { checkActionRateLimit } from '@/lib/rate-limit';

const EXPIRY_HOURS = 1;

// ─── Step 1: user submits their email ────────────────────────────────────────

export interface ForgotResult {
  ok?: boolean;
  error?: string;
}

export async function requestPasswordReset(
  _: ForgotResult,
  formData: FormData,
): Promise<ForgotResult> {
  // Throttle reset requests to curb email bombing + enumeration probing.
  const limited = checkActionRateLimit('password-reset', 5, 15 * 60 * 1000);
  if (limited) return { error: limited };

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return ok to prevent email enumeration - don't reveal whether the
  // account exists.
  if (!user) return { ok: true };

  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const resetUrl = `${siteUrl}/reset-password?token=${token}`;

  await sendEmail({
    type: 'PASSWORD_RESET',
    to: user.email,
    userId: user.id,
    context: { firstName: user.firstName, resetUrl },
  });

  return { ok: true };
}

// ─── Step 2: user submits new password ───────────────────────────────────────

const ResetSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100)
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export interface ResetResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function resetPassword(
  _: ResetResult,
  formData: FormData,
): Promise<ResetResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = ResetSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { error: 'Please fix the errors below.', fieldErrors };
  }

  const { token, password } = parsed.data;

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record) return { error: 'Invalid or expired reset link. Request a new one.' };
  if (record.usedAt) return { error: 'This link has already been used. Request a new one.' };
  if (record.expiresAt < new Date()) {
    return { error: 'This link has expired. Request a new one.' };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect('/sign-in?reset=1');
}
