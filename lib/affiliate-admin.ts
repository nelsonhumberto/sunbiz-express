/**
 * Admin helpers for invite-only partners and monthly PayPal commissions.
 * Pure functions only. Stripe objects are never created here.
 */

import { normalizeAffiliateCode, type AffiliatePartnerStatus, type CommissionStatus } from '@/lib/affiliate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROMO_ID_RE = /^[A-Za-z0-9_-]{1,255}$/;

export type PartnerDraft = {
  code: string;
  name: string;
  email: string;
  paypalEmail: string | null;
  stripePromotionCodeId: string | null;
  status: AffiliatePartnerStatus;
};

export type CommissionAction = 'approve' | 'mark_paid' | 'reverse';

export type CommissionOrder = {
  filingId: string;
  businessName: string | null;
  serviceTier: string;
  buyerEmail: string;
  commissionCents: number;
  commissionStatus: CommissionStatus;
  payoutRef: string | null;
  eventAt: Date;
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  partnerEmail: string;
  paypalEmail: string | null;
};

export type PartnerMonthSummary = {
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  partnerEmail: string;
  paypalEmail: string | null;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  reversedCents: number;
  orders: CommissionOrder[];
};

export function parseCommissionMonth(
  raw: string | null | undefined,
  now = new Date(),
): { year: number; month: number; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec((raw ?? '').trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month, label: `${match[1]}-${match[2]}` };
    }
  }
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const label = `${year}-${String(month).padStart(2, '0')}`;
  return { year, month, label };
}

export function monthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export function commissionEventAt(input: {
  checkoutPaymentIntentId?: string | null;
  submittedAt?: Date | null;
  createdAt: Date;
  payments: Array<{
    status: string;
    stripePaymentIntentId?: string | null;
    completedAt?: Date | null;
    createdAt: Date;
  }>;
}): Date {
  const checkoutId = input.checkoutPaymentIntentId;
  const matched = checkoutId
    ? input.payments.find((payment) => payment.stripePaymentIntentId === checkoutId)
    : undefined;
  if (matched?.completedAt) return matched.completedAt;
  if (matched) return matched.createdAt;
  const succeeded = input.payments
    .filter((payment) => payment.status === 'SUCCEEDED')
    .map((payment) => payment.completedAt ?? payment.createdAt)
    .sort((a, b) => a.getTime() - b.getTime());
  if (succeeded[0]) return succeeded[0];
  return input.submittedAt ?? input.createdAt;
}

export function inMonth(date: Date, year: number, month: number): boolean {
  const { start, end } = monthRangeUtc(year, month);
  const time = date.getTime();
  return time >= start.getTime() && time < end.getTime();
}

export function parsePartnerForm(input: {
  code?: string | null;
  name?: string | null;
  email?: string | null;
  paypalEmail?: string | null;
  stripePromotionCodeId?: string | null;
  status?: string | null;
}): { ok: true; value: PartnerDraft } | { ok: false; error: string } {
  const code = normalizeAffiliateCode(input.code);
  if (!code) {
    return { ok: false, error: 'Code must be 2 to 32 letters, numbers, dashes, or underscores.' };
  }
  const name = (input.name ?? '').trim();
  if (!name || name.length > 120) {
    return { ok: false, error: 'Name is required and must be 120 characters or fewer.' };
  }
  const email = (input.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, error: 'A valid partner email is required.' };
  }
  const paypalRaw = (input.paypalEmail ?? '').trim().toLowerCase();
  if (paypalRaw && (!EMAIL_RE.test(paypalRaw) || paypalRaw.length > 200)) {
    return { ok: false, error: 'PayPal email must be a valid email, or left blank.' };
  }
  const promoRaw = (input.stripePromotionCodeId ?? '').trim();
  if (promoRaw && !PROMO_ID_RE.test(promoRaw)) {
    return {
      ok: false,
      error: 'Stripe promotion code id must be the existing id, with no spaces.',
    };
  }
  const status = (input.status ?? 'ACTIVE').trim().toUpperCase();
  if (status !== 'ACTIVE' && status !== 'PAUSED' && status !== 'REMOVED') {
    return { ok: false, error: 'Status must be Active, Paused, or Removed.' };
  }
  return {
    ok: true,
    value: {
      code,
      name,
      email,
      paypalEmail: paypalRaw || null,
      stripePromotionCodeId: promoRaw || null,
      status,
    },
  };
}

export function applyCommissionAction(input: {
  status: CommissionStatus | null;
  action: CommissionAction;
  payoutNote?: string | null;
}):
  | { ok: true; status: CommissionStatus; payoutRef?: string }
  | { ok: false; error: string } {
  if (input.action === 'approve') {
    if (input.status !== 'PENDING') {
      return { ok: false, error: 'Only a pending commission can be approved.' };
    }
    return { ok: true, status: 'APPROVED' };
  }
  if (input.action === 'mark_paid') {
    if (input.status !== 'APPROVED') {
      return { ok: false, error: 'Approve the commission before marking it paid.' };
    }
    const note = (input.payoutNote ?? '').trim();
    if (!note) return { ok: false, error: 'A PayPal batch reference is required.' };
    if (note.length > 200) {
      return { ok: false, error: 'PayPal batch reference must be 200 characters or fewer.' };
    }
    return { ok: true, status: 'PAID', payoutRef: note };
  }
  if (input.status !== 'PENDING' && input.status !== 'APPROVED' && input.status !== 'PAID') {
    return { ok: false, error: 'This commission cannot be reversed.' };
  }
  return { ok: true, status: 'REVERSED' };
}

export function summarizePartnerMonth(orders: CommissionOrder[]): PartnerMonthSummary[] {
  const byPartner = new Map<string, PartnerMonthSummary>();
  for (const order of orders) {
    let row = byPartner.get(order.partnerId);
    if (!row) {
      row = {
        partnerId: order.partnerId,
        partnerName: order.partnerName,
        partnerCode: order.partnerCode,
        partnerEmail: order.partnerEmail,
        paypalEmail: order.paypalEmail,
        pendingCents: 0,
        approvedCents: 0,
        paidCents: 0,
        reversedCents: 0,
        orders: [],
      };
      byPartner.set(order.partnerId, row);
    }
    row.orders.push(order);
    if (order.commissionStatus === 'PENDING') row.pendingCents += order.commissionCents;
    if (order.commissionStatus === 'APPROVED') row.approvedCents += order.commissionCents;
    if (order.commissionStatus === 'PAID') row.paidCents += order.commissionCents;
    if (order.commissionStatus === 'REVERSED') row.reversedCents += order.commissionCents;
  }
  return [...byPartner.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName));
}

export const PAYOUT_CSV_COLUMNS = [
  'month',
  'partner_code',
  'partner_name',
  'partner_email',
  'paypal_email',
  'filing_id',
  'business_name',
  'service_tier',
  'buyer_email',
  'commission_cents',
  'partner_month_approved_cents',
  'commission_status',
  'event_at',
] as const;

/** Prefix formula triggers so a spreadsheet does not execute partner-supplied text. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function payoutCsv(monthLabel: string, orders: CommissionOrder[]): string {
  const approved = orders.filter((order) => order.commissionStatus === 'APPROVED');
  const totals = new Map<string, number>();
  for (const order of approved) {
    totals.set(order.partnerId, (totals.get(order.partnerId) ?? 0) + order.commissionCents);
  }
  const header = PAYOUT_CSV_COLUMNS.join(',');
  const lines = approved
    .slice()
    .sort((a, b) => a.partnerCode.localeCompare(b.partnerCode) || a.eventAt.getTime() - b.eventAt.getTime())
    .map((order) =>
      [
        monthLabel,
        order.partnerCode,
        order.partnerName,
        order.partnerEmail,
        order.paypalEmail ?? '',
        order.filingId,
        order.businessName ?? '',
        order.serviceTier,
        order.buyerEmail,
        order.commissionCents,
        totals.get(order.partnerId) ?? 0,
        order.commissionStatus,
        order.eventAt.toISOString(),
      ]
        .map((value) => csvCell(value))
        .join(','),
    );
  return `\uFEFF${[header, ...lines].join('\r\n')}`;
}
