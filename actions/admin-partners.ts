'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { applyCommissionAction, parsePartnerForm } from '@/lib/affiliate-admin';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  return session;
}

function revalidateAffiliateAdmin() {
  revalidatePath('/admin/partners');
  revalidatePath('/admin/commissions');
}

function uniqueMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('code' in err) || (err as { code?: string }).code !== 'P2002') {
    return null;
  }
  const target = 'meta' in err ? (err as { meta?: { target?: unknown } }).meta?.target : null;
  const label = Array.isArray(target) ? target.join(' ') : String(target ?? '');
  if (label.toLowerCase().includes('stripe')) {
    return 'That Stripe promotion code id is already attached to a partner.';
  }
  return 'That partner code is already in use.';
}

function readPartnerFields(formData: FormData) {
  return parsePartnerForm({
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    paypalEmail: String(formData.get('paypalEmail') ?? ''),
    stripePromotionCodeId: String(formData.get('stripePromotionCodeId') ?? ''),
    status: String(formData.get('status') ?? 'ACTIVE'),
  });
}

export async function createPartner(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = readPartnerFields(formData);
  if (!parsed.ok) return parsed;
  try {
    await prisma.partner.create({ data: parsed.value });
  } catch (err) {
    return { ok: false, error: uniqueMessage(err) ?? 'Could not create the partner.' };
  }
  revalidateAffiliateAdmin();
  return { ok: true };
}

export async function updatePartner(
  partnerId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = readPartnerFields(formData);
  if (!parsed.ok) return parsed;
  try {
    await prisma.partner.update({
      where: { id: partnerId },
      data: parsed.value,
    });
  } catch (err) {
    return { ok: false, error: uniqueMessage(err) ?? 'Could not update the partner.' };
  }
  revalidateAffiliateAdmin();
  return { ok: true };
}

export async function setPartnerStatus(
  partnerId: string,
  status: 'ACTIVE' | 'PAUSED' | 'REMOVED',
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (status !== 'ACTIVE' && status !== 'PAUSED' && status !== 'REMOVED') {
    return { ok: false, error: 'Status must be Active, Paused, or Removed.' };
  }
  try {
    await prisma.partner.update({ where: { id: partnerId }, data: { status } });
  } catch {
    return { ok: false, error: 'Could not update partner status.' };
  }
  revalidateAffiliateAdmin();
  return { ok: true };
}

async function recordCommissionAction(
  adminUserId: string,
  filingId: string,
  actionType: string,
  description: string,
  oldStatus: string | null,
  newStatus: string,
) {
  await prisma.adminAction.create({
    data: {
      adminUserId,
      filingId,
      actionType,
      description,
      oldValues: JSON.stringify({ commissionStatus: oldStatus }),
      newValues: JSON.stringify({ commissionStatus: newStatus }),
    },
  });
}

export async function approveCommission(filingId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { id: true, commissionStatus: true },
  });
  if (!filing) return { ok: false, error: 'Filing not found.' };
  const next = applyCommissionAction({ status: filing.commissionStatus, action: 'approve' });
  if (!next.ok) return next;
  await prisma.filing.update({
    where: { id: filing.id },
    data: { commissionStatus: next.status },
  });
  await recordCommissionAction(
    session.user.id,
    filing.id,
    'AFFILIATE_APPROVE',
    'Approved affiliate commission',
    filing.commissionStatus,
    next.status,
  );
  revalidateAffiliateAdmin();
  return { ok: true };
}

export async function markCommissionPaid(
  filingId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { id: true, commissionStatus: true },
  });
  if (!filing) return { ok: false, error: 'Filing not found.' };
  const next = applyCommissionAction({
    status: filing.commissionStatus,
    action: 'mark_paid',
    payoutNote: String(formData.get('payoutRef') ?? ''),
  });
  if (!next.ok) return next;
  await prisma.filing.update({
    where: { id: filing.id },
    data: { commissionStatus: next.status, commissionPayoutRef: next.payoutRef },
  });
  await recordCommissionAction(
    session.user.id,
    filing.id,
    'AFFILIATE_PAID',
    `Marked affiliate commission paid (${next.payoutRef})`,
    filing.commissionStatus,
    next.status,
  );
  revalidateAffiliateAdmin();
  return { ok: true };
}

export async function reverseCommission(filingId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { id: true, commissionStatus: true },
  });
  if (!filing) return { ok: false, error: 'Filing not found.' };
  const next = applyCommissionAction({ status: filing.commissionStatus, action: 'reverse' });
  if (!next.ok) return next;
  await prisma.filing.update({
    where: { id: filing.id },
    data: { commissionStatus: next.status },
  });
  await recordCommissionAction(
    session.user.id,
    filing.id,
    'AFFILIATE_REVERSE',
    'Reversed affiliate commission',
    filing.commissionStatus,
    next.status,
  );
  revalidateAffiliateAdmin();
  return { ok: true };
}
