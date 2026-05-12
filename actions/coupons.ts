'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// ─── Public: validate a coupon code at checkout ───────────────────────────────

export interface CouponValidationResult {
  ok: boolean;
  error?: string;
  couponId?: string;
  code?: string;
  type?: 'PERCENT' | 'FIXED';
  value?: number;
  discountCents?: number;
  description?: string;
}

export async function validateCoupon(
  code: string,
  subtotalCents: number,
): Promise<CouponValidationResult> {
  if (!code?.trim()) return { ok: false, error: 'Enter a coupon code.' };

  const coupon = await prisma.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
  });

  if (!coupon) return { ok: false, error: 'Coupon code not found.' };
  if (!coupon.active) return { ok: false, error: 'This coupon is no longer active.' };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { ok: false, error: 'This coupon has expired.' };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: 'This coupon has reached its usage limit.' };
  }

  const discountCents =
    coupon.type === 'PERCENT'
      ? Math.round((subtotalCents * coupon.value) / 100)
      : coupon.value;

  return {
    ok: true,
    couponId: coupon.id,
    code: coupon.code,
    type: coupon.type as 'PERCENT' | 'FIXED',
    value: coupon.value,
    discountCents: Math.min(discountCents, subtotalCents),
    description: coupon.description ?? undefined,
  };
}

// ─── Admin: require admin helper ──────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/sign-in');
}

// ─── Admin: create coupon ─────────────────────────────────────────────────────

export interface CouponActionResult {
  ok?: boolean;
  error?: string;
}

export async function createCoupon(formData: FormData): Promise<CouponActionResult> {
  await requireAdmin();

  const code = (formData.get('code') as string)?.trim().toUpperCase();
  const description = (formData.get('description') as string)?.trim() || null;
  const type = formData.get('type') as 'PERCENT' | 'FIXED';
  const value = Number(formData.get('value'));
  const maxUses = formData.get('maxUses') ? Number(formData.get('maxUses')) : null;
  const expiresAt = formData.get('expiresAt')
    ? new Date(formData.get('expiresAt') as string)
    : null;

  if (!code) return { error: 'Code is required.' };
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
    return { error: 'Code must be 2–30 chars, letters, numbers, dash or underscore.' };
  }
  if (!type || !['PERCENT', 'FIXED'].includes(type)) return { error: 'Invalid type.' };
  if (isNaN(value) || value <= 0) return { error: 'Value must be greater than 0.' };
  if (type === 'PERCENT' && value > 100) return { error: 'Percent discount cannot exceed 100.' };

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) return { error: `Code "${code}" already exists.` };

  await prisma.coupon.create({
    data: {
      code,
      description,
      type,
      value: type === 'FIXED' ? Math.round(value * 100) : value, // store fixed as cents
      maxUses,
      expiresAt,
      active: true,
    },
  });

  revalidatePath('/admin/coupons');
  return { ok: true };
}

export async function toggleCoupon(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await prisma.coupon.update({ where: { id }, data: { active } });
  revalidatePath('/admin/coupons');
}

export async function deleteCoupon(id: string): Promise<void> {
  await requireAdmin();
  await prisma.coupon.delete({ where: { id } });
  revalidatePath('/admin/coupons');
}
