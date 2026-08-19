'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Customer-facing account settings server actions.
 *
 * The May 2026 audit flagged that the dashboard has no place for the
 * customer to update their contact info, change their password, or
 * review billing history. This file backs the new
 * `/dashboard/settings` and `/dashboard/billing` routes.
 */

export interface UpdateProfileResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const ProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: z
    .string()
    .max(40)
    .regex(/^[\d\s+()-]*$/, 'Use only digits, spaces, and + ( ) -')
    .optional()
    .or(z.literal('')),
});

export async function updateProfile(
  _prev: UpdateProfileResult,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Please sign in.' };

  const parsed = ProfileSchema.safeParse({
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    phone: formData.get('phone') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { error: 'Please fix the errors below.', fieldErrors };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
      phone: parsed.data.phone?.trim() || null,
    },
  });

  revalidatePath('/dashboard/settings');
  return { ok: true };
}

export interface ChangePasswordResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100)
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export async function changePassword(
  _prev: ChangePasswordResult,
  formData: FormData,
): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Please sign in.' };

  const parsed = PasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword') ?? '',
    newPassword: formData.get('newPassword') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { error: 'Please fix the errors below.', fieldErrors };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) return { error: 'Account not found.' };

  // OWASP A07 - verify the current password before allowing a rotation.
  // This blocks the "stolen-session writes new password" attack vector.
  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return {
      error: 'Current password did not match.',
      fieldErrors: { currentPassword: 'Incorrect current password.' },
    };
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash },
  });

  return { ok: true };
}
