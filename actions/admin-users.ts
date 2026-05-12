'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/sign-in');
}

export async function setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { accountStatus: status } });
  revalidatePath('/admin/users');
}

export async function setUserRole(userId: string, role: 'USER' | 'ADMIN') {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath('/admin/users');
}

export async function adminSendPasswordReset(userId: string) {
  await requireAdmin();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  // Invalidate existing tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId, token, expiresAt },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const resetUrl = `${siteUrl}/reset-password?token=${token}`;

  await sendEmail({
    type: 'PASSWORD_RESET',
    to: user.email,
    userId: user.id,
    context: { firstName: user.firstName, resetUrl },
  });

  revalidatePath('/admin/users');
}

export async function deleteUser(userId: string) {
  await requireAdmin();
  // Cascade is set on all related models in the schema — a single delete
  // removes filings, payments, documents, emails, and reset tokens.
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath('/admin/users');
}
