'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/sign-in');
  return session.user;
}

/**
 * Write a row to the AdminAction audit log. Used for sensitive admin
 * mutations (tester-flag toggles, status changes) so we can reconstruct
 * who did what and when after the fact. The May 2026 audit specifically
 * flagged that the tester flag had no audit trail.
 *
 * `filingId` is optional because most user mutations are not tied to a
 * specific filing. We still store the row - the `description` field
 * carries the human-readable summary.
 */
async function writeAdminAudit(args: {
  adminUserId?: string;
  actionType: string;
  description: string;
  oldValues?: unknown;
  newValues?: unknown;
}) {
  try {
    await prisma.adminAction.create({
      data: {
        adminUserId: args.adminUserId,
        actionType: args.actionType,
        description: args.description,
        oldValues: args.oldValues ? JSON.stringify(args.oldValues) : null,
        newValues: args.newValues ? JSON.stringify(args.newValues) : null,
      },
    });
  } catch (err) {
    logger.error('AdminAction write failed', {
      area: 'admin',
      tag: 'admin-audit-write',
    }, err);
  }
}

export async function setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
  const admin = await requireAdmin();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true, email: true },
  });
  await prisma.user.update({ where: { id: userId }, data: { accountStatus: status } });
  await writeAdminAudit({
    adminUserId: admin.id,
    actionType: 'USER_STATUS_CHANGE',
    description: `Set account status for ${existing?.email ?? userId} to ${status}`,
    oldValues: { accountStatus: existing?.accountStatus },
    newValues: { accountStatus: status },
  });
  revalidatePath('/admin/users');
}

export async function setUserRole(userId: string, role: 'USER' | 'ADMIN') {
  const admin = await requireAdmin();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await writeAdminAudit({
    adminUserId: admin.id,
    actionType: 'USER_ROLE_CHANGE',
    description: `Changed role for ${existing?.email ?? userId} from ${existing?.role ?? '?'} to ${role}`,
    oldValues: { role: existing?.role },
    newValues: { role },
  });
  revalidatePath('/admin/users');
}

export async function adminSendPasswordReset(userId: string) {
  const admin = await requireAdmin();

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

  await writeAdminAudit({
    adminUserId: admin.id,
    actionType: 'PASSWORD_RESET_SENT',
    description: `Triggered password reset email for ${user.email}`,
  });
  revalidatePath('/admin/users');
}

export async function toggleTester(userId: string, isTester: boolean) {
  const admin = await requireAdmin();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { isTester: true, email: true },
  });
  await prisma.user.update({ where: { id: userId }, data: { isTester } });
  // Tester flags bypass live Stripe charges, so toggles are
  // security-sensitive. The May 2026 audit explicitly flagged that the
  // toggle had no audit trail - this row is the audit trail.
  await writeAdminAudit({
    adminUserId: admin.id,
    actionType: 'USER_TESTER_FLAG_CHANGE',
    description: `Set tester flag for ${existing?.email ?? userId} to ${isTester ? 'ON' : 'OFF'}`,
    oldValues: { isTester: existing?.isTester },
    newValues: { isTester },
  });
  revalidatePath('/admin/users');
}

export async function deleteUser(userId: string) {
  const admin = await requireAdmin();
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  // Cascade is set on all related models in the schema - a single delete
  // removes filings, payments, documents, emails, and reset tokens.
  await prisma.user.delete({ where: { id: userId } });
  await writeAdminAudit({
    adminUserId: admin.id,
    actionType: 'USER_DELETED',
    description: `Deleted account for ${existing?.email ?? userId}`,
    oldValues: existing,
  });
  revalidatePath('/admin/users');
}
