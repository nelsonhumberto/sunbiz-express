import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyCommissionAction,
  commissionEventAt,
  csvCell,
  inMonth,
  parsePartnerForm,
  payoutCsv,
  summarizePartnerMonth,
  type CommissionOrder,
} from '@/lib/affiliate-admin';

const WHEN = new Date('2026-10-15T12:00:00Z');

function order(overrides: Partial<CommissionOrder> = {}): CommissionOrder {
  return {
    filingId: 'fil_1',
    businessName: 'Ada LLC',
    serviceTier: 'BASIC',
    buyerEmail: 'buyer@example.com',
    commissionCents: 1000,
    commissionStatus: 'APPROVED',
    payoutRef: null,
    eventAt: WHEN,
    partnerId: 'p_ada',
    partnerName: 'Ada',
    partnerCode: 'ADA',
    partnerEmail: 'ada@partners.test',
    paypalEmail: 'pay@partners.test',
    ...overrides,
  };
}

describe('affiliate admin commissions', () => {
  it('approves pending, requires a PayPal note to mark paid, and reverses', () => {
    expect(applyCommissionAction({ status: 'PENDING', action: 'approve' })).toEqual({
      ok: true,
      status: 'APPROVED',
    });
    expect(applyCommissionAction({ status: 'APPROVED', action: 'approve' }).ok).toBe(false);
    expect(applyCommissionAction({ status: 'APPROVED', action: 'mark_paid', payoutNote: '   ' }).ok).toBe(false);
    expect(applyCommissionAction({ status: 'PENDING', action: 'mark_paid', payoutNote: 'BATCH-1' }).ok).toBe(false);
    expect(applyCommissionAction({ status: 'APPROVED', action: 'mark_paid', payoutNote: ' BATCH-1 ' })).toEqual({
      ok: true,
      status: 'PAID',
      payoutRef: 'BATCH-1',
    });
    expect(applyCommissionAction({ status: 'PAID', action: 'reverse' })).toEqual({ ok: true, status: 'REVERSED' });
    expect(applyCommissionAction({ status: 'REVERSED', action: 'reverse' }).ok).toBe(false);
    expect(applyCommissionAction({ status: null, action: 'approve' }).ok).toBe(false);
  });

  it('totals a partner month and exports only approved rows', () => {
    const rows = [
      order({ commissionStatus: 'PENDING', commissionCents: 1000, filingId: 'fil_a' }),
      order({ commissionStatus: 'APPROVED', commissionCents: 5000, filingId: 'fil_b' }),
      order({ commissionStatus: 'PAID', commissionCents: 10000, filingId: 'fil_c', payoutRef: 'OLD' }),
      order({
        commissionStatus: 'APPROVED',
        commissionCents: 2000,
        filingId: 'fil_d',
        partnerId: 'p_bee',
        partnerCode: 'BEE',
        partnerName: '=Bee',
        businessName: '+cmd',
      }),
    ];
    const summary = summarizePartnerMonth(rows);
    expect(summary.find((row) => row.partnerId === 'p_ada')).toMatchObject({
      pendingCents: 1000,
      approvedCents: 5000,
      paidCents: 10000,
    });

    const csv = payoutCsv('2026-10', rows);
    expect(csv).toContain('fil_b');
    expect(csv).not.toContain('fil_a');
    expect(csv).not.toContain('fil_c');
    expect(csv).toContain('5000');
    expect(csv).toContain("'=Bee");
    expect(csv).toContain("'+cmd");
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('safe')).toBe('safe');
  });

  it('buckets a filing by the formation payment time', () => {
    const eventAt = commissionEventAt({
      checkoutPaymentIntentId: 'pi_form',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      submittedAt: new Date('2026-09-02T00:00:00Z'),
      payments: [
        {
          status: 'SUCCEEDED',
          stripePaymentIntentId: 'pi_form',
          completedAt: new Date('2026-10-02T00:00:00Z'),
          createdAt: new Date('2026-10-02T00:00:00Z'),
        },
        {
          status: 'SUCCEEDED',
          stripePaymentIntentId: 'pi_ein',
          completedAt: new Date('2026-11-02T00:00:00Z'),
          createdAt: new Date('2026-11-02T00:00:00Z'),
        },
      ],
    });
    expect(inMonth(eventAt, 2026, 10)).toBe(true);
    expect(inMonth(eventAt, 2026, 9)).toBe(false);
    expect(inMonth(eventAt, 2026, 11)).toBe(false);
  });

  it('rejects a bad partner code and keeps the Stripe id as entered', () => {
    expect(parsePartnerForm({ code: 'A', name: 'Ada', email: 'ada@partners.test' }).ok).toBe(false);
    const parsed = parsePartnerForm({
      code: 'ada',
      name: 'Ada Partner',
      email: 'Ada@Partners.test',
      paypalEmail: '',
      stripePromotionCodeId: 'promo_Ada',
      status: 'paused',
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        code: 'ADA',
        name: 'Ada Partner',
        email: 'ada@partners.test',
        paypalEmail: null,
        stripePromotionCodeId: 'promo_Ada',
        status: 'PAUSED',
      },
    });
  });
});

describe('affiliate payout migration', () => {
  it('only adds a nullable payout note', () => {
    const sql = readFileSync(
      'prisma/migrations/20261025220000_affiliate_payout_ref/migration.sql',
      'utf8',
    );
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "commissionPayoutRef" TEXT');
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
  });
});
