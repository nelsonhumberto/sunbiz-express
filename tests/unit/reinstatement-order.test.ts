import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FL } from '@/lib/florida';
import { REINSTATEMENT_SERVICE_FEE, REINSTATEMENT_SERVICE_FEE_CENTS } from '@/lib/pricing';
import {
  enforceServerAmount,
  reinstatementStripeMetadata,
  serviceOrderIdempotencyKey,
} from '@/lib/service-order';
import {
  floridaCivilDate,
  quoteReinstatement,
  ReinstatementQuoteError,
} from '@/lib/reinstatement-quote';
import { customerSunbizMessage } from '@/lib/sunbiz-public-error';
import { SunbizError } from '@/lib/sunbiz';
import { guestAnnualReportPrice } from '@/lib/guest-service-price';
import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';

const MAY_1_LATE_EVENING = new Date('2026-05-02T03:30:00.000Z');
const MAY_2_EARLY = new Date('2026-05-02T04:30:00.000Z');
const APRIL_15 = new Date('2026-04-15T16:00:00.000Z');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

const SUNBIZ_AMOUNT_NOTE_EN = 'If Sunbiz requires a different amount when we file, we will contact you before filing. We never charge more without your OK.';
const SUNBIZ_AMOUNT_NOTE_ES = 'Si Sunbiz exige un monto diferente al presentar, te contactaremos antes de presentar. Nunca cobramos más sin tu aprobación.';

describe('reinstatement fee math', () => {
  it('keeps the approved service fee at $149', () => {
    expect(REINSTATEMENT_SERVICE_FEE).toBe(149);
    expect(REINSTATEMENT_SERVICE_FEE_CENTS).toBe(14_900);
    expect(FL.fees.reinstatementLLC).toBe(10_000);
    expect(FL.fees.annualReportLLC).toBe(13_875);
  });

  it('prices one year due at $387.75 before and after May 1', () => {
    for (const now of [APRIL_15, MAY_1_LATE_EVENING, MAY_2_EARLY]) {
      const quote = quoteReinstatement({ years: [2026], now });
      expect(quote.annualReportCents).toBe(13_875);
      expect(quote.stateFeeCents).toBe(10_000 + 13_875);
      expect(quote.totalCents).toBe(38_775);
      expect(quote.lines.map((line) => line.kind)).toEqual(['service', 'reinstatement', 'annual_report']);
      expect(quote.lines.filter((line) => line.statePassThrough).map((line) => line.kind)).toEqual([
        'reinstatement',
        'annual_report',
      ]);
    }
  });

  it('prices two years due at $526.50', () => {
    const quote = quoteReinstatement({ years: [2025, 2026], now: MAY_2_EARLY });
    expect(quote.years).toEqual([2025, 2026]);
    expect(quote.annualReportCents).toBe(27_750);
    expect(quote.stateFeeCents).toBe(10_000 + 27_750);
    expect(quote.totalCents).toBe(52_650);
    expect(quote.lines.filter((line) => line.kind === 'annual_report')).toHaveLength(2);
  });

  it('rejects a future year', () => {
    expect(() => quoteReinstatement({ years: [2027], now: APRIL_15 })).toThrow(ReinstatementQuoteError);
  });

  it('charges no $400 late fee anywhere in reinstatement', () => {
    const files = [
      'lib/reinstatement-quote.ts',
      'lib/reinstatement-fulfill.ts',
      'lib/service-order.ts',
      'components/marketing/ReinstatementOrderForm.tsx',
      'app/(marketing)/reinstate-llc/page.tsx',
      'app/(marketing)/reinstate-llc/confirmation/page.tsx',
      'app/(admin)/admin/filings/[id]/page.tsx',
    ];
    for (const file of files) {
      const text = source(file);
      expect(text, file).not.toMatch(/\$400|40_000|late_fee|lateFeeCents|annualReportLateFee|feeLate/);
    }
    const email = source('lib/email.ts');
    const receipt = email.slice(email.indexOf('REINSTATEMENT_ORDER_ADMIN'), email.indexOf('OA_TEMPLATE_CONFIRM'));
    expect(receipt).not.toMatch(/\$400|Late fee|late fee|Recargo por presentación tardía/);
    const en = JSON.parse(source('messages/en.json')).reinstateLlc;
    const es = JSON.parse(source('messages/es.json')).reinstateLlc;
    expect(JSON.stringify(en)).not.toMatch(/\$400|late fee|feeLate|yearLate/i);
    expect(JSON.stringify(es)).not.toMatch(/\$400|reinstalación|feeLate|yearLate/);
    expect(en.sunbizAmountNote).toBe(SUNBIZ_AMOUNT_NOTE_EN);
    expect(es.sunbizAmountNote).toBe(SUNBIZ_AMOUNT_NOTE_ES);
    expect(source('app/(marketing)/reinstate-llc/page.tsx')).toContain("t('sunbizAmountNote')");
    expect(source('components/marketing/ReinstatementOrderForm.tsx')).toContain("t('sunbizAmountNote')");
    expect(floridaCivilDate(MAY_1_LATE_EVENING)).toEqual({ year: 2026, month: 5, day: 1 });
  });
});

describe('server amount enforcement', () => {
  it('accepts a missing or matching client amount and rejects every other amount', () => {
    expect(enforceServerAmount(undefined, 38_775)).toEqual({ ok: true });
    expect(enforceServerAmount(38_775, 38_775)).toEqual({ ok: true });
    expect(enforceServerAmount(1, 38_775)).toEqual({ ok: false });
    expect(enforceServerAmount(38_775.5, 38_775)).toEqual({ ok: false });
  });
});

describe('public annual report price stays the current total', () => {
  it('charges $80 plus the state fee and optional registered agent, with no late fee', () => {
    expect(guestAnnualReportPrice('LLC', false)).toEqual({
      serviceCents: 8_000,
      stateFeeCents: 13_875,
      raCents: 0,
      totalCents: 21_875,
    });
    expect(guestAnnualReportPrice('CORP', false).totalCents).toBe(8_000 + 15_000);
    expect(guestAnnualReportPrice('LLC', true).totalCents).toBe(21_875 + 15_000);
    const helper = source('lib/guest-service-price.ts');
    expect(helper).not.toContain('lateFee');
    expect(helper).not.toContain('FL_AR_LATE_FEE');
  });
});

const auth = vi.hoisted(() => vi.fn());
const serviceInquiryCreate = vi.hoisted(() => vi.fn());
const paymentFindUnique = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const userCreate = vi.hoisted(() => vi.fn());
const filingCreate = vi.hoisted(() => vi.fn());
const paymentCreate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const paymentIntentsCreate = vi.hoisted(() => vi.fn());
const paymentIntentsRetrieve = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/db', () => ({
  prisma: {
    serviceInquiry: { create: serviceInquiryCreate },
    payment: { findUnique: paymentFindUnique },
    user: { findUnique: userFindUnique, create: userCreate },
    $transaction: transaction,
  },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: { create: paymentIntentsCreate, retrieve: paymentIntentsRetrieve },
  }),
}));
vi.mock('@/lib/email', () => ({ sendEmail }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit,
  clientIp: () => '203.0.113.8',
  checkActionRateLimit: () => null,
}));
vi.mock('@/lib/utm-server', () => ({ getServerUtmAttribution: () => null }));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));

import { POST } from '@/app/api/stripe/service-order/route';
import { fulfillReinstatementOrder } from '@/lib/reinstatement-fulfill';

function reinstatementBody(extra: Record<string, unknown> = {}) {
  return {
    type: 'reinstatement',
    documentNumber: 'l14000012345',
    companyName: 'Palm LLC',
    sunbizStatus: 'INACTIVE',
    years: [2024],
    contactName: 'Ana Lopez',
    email: 'ana@example.com',
    phone: '305-555-0100',
    officerName: 'Ana Lopez',
    officerTitle: 'Manager',
    changeNote: 'Add a manager',
    termsAccepted: true,
    locale: 'en',
    ...extra,
  };
}

beforeEach(() => {
  auth.mockReset();
  auth.mockResolvedValue(null);
  serviceInquiryCreate.mockReset();
  serviceInquiryCreate.mockResolvedValue({ id: 'inq_1' });
  paymentFindUnique.mockReset();
  paymentFindUnique.mockResolvedValue(null);
  userFindUnique.mockReset();
  userFindUnique.mockResolvedValue(null);
  userCreate.mockReset();
  userCreate.mockResolvedValue({ id: 'user_1', email: 'ana@example.com' });
  filingCreate.mockReset();
  filingCreate.mockResolvedValue({ id: 'filing_1' });
  paymentCreate.mockReset();
  paymentCreate.mockResolvedValue({ id: 'pay_1' });
  transaction.mockReset();
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
    filing: { create: filingCreate },
    payment: { create: paymentCreate },
  }));
  paymentIntentsCreate.mockReset();
  paymentIntentsCreate.mockResolvedValue({
    id: 'pi_123',
    client_secret: 'sec',
    amount: 1,
  });
  paymentIntentsRetrieve.mockReset();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
  rateLimit.mockReset();
  rateLimit.mockReturnValue({ ok: true, remaining: 7, retryAfterSeconds: 0 });
});

describe('guest service-order endpoint', () => {
  it('rejects a client amount that does not match the reinstatement quote', async () => {
    const res = await POST({
      json: async () => reinstatementBody({ amountCents: 100 }),
    } as never);
    expect(res.status).toBe(400);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(serviceInquiryCreate).not.toHaveBeenCalled();
  });

  it('creates a guest reinstatement PaymentIntent for the server total', async () => {
    const quote = quoteReinstatement({ years: [2024] });
    const res = await POST({
      json: async () => reinstatementBody({ amountCents: quote.totalCents }),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.amountCents).toBe(quote.totalCents);
    expect(serviceInquiryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        service: 'llc_reinstatement',
        email: 'ana@example.com',
        phone: '305-555-0100',
      }),
    });
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: quote.totalCents,
        metadata: reinstatementStripeMetadata('L14000012345', [2024]),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining('svc_reinstatement_L14000012345'),
      }),
    );
  });

  it('charges the server total when the client omits an amount', async () => {
    const quote = quoteReinstatement({ years: [2024] });
    const res = await POST({ json: async () => reinstatementBody() } as never);
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: quote.totalCents }),
      expect.anything(),
    );
  });

  it('prices a guest annual report without a late fee and without an account', async () => {
    const llc = await POST({
      json: async () => ({
        type: 'annual-report',
        documentNumber: 'L14000012345',
        entityType: 'LLC',
        useOurRa: false,
        email: 'ada@example.com',
        amountCents: 21_875,
      }),
    } as never);
    expect(llc.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 21_875,
        metadata: { type: 'annual-report', documentNumber: 'L14000012345' },
      }),
      expect.anything(),
    );
    expect(serviceInquiryCreate).not.toHaveBeenCalled();

    paymentIntentsCreate.mockClear();
    const withRa = await POST({
      json: async () => ({
        type: 'annual-report',
        documentNumber: 'L14000012345',
        entityType: 'LLC',
        useOurRa: true,
        amountCents: 36_875,
      }),
    } as never);
    expect(withRa.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 36_875 }),
      expect.anything(),
    );

    paymentIntentsCreate.mockClear();
    const corp = await POST({
      json: async () => ({
        type: 'annual-report',
        documentNumber: 'P14000012345',
        entityType: 'CORP',
        amountCents: 23_000,
      }),
    } as never);
    expect(corp.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 23_000 }),
      expect.anything(),
    );
  });

  it('rejects an annual report client amount that does not match', async () => {
    const res = await POST({
      json: async () => ({
        type: 'annual-report',
        documentNumber: 'L14000012345',
        entityType: 'LLC',
        amountCents: 100,
      }),
    } as never);
    expect(res.status).toBe(400);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('rate limits guest checkout', async () => {
    rateLimit.mockReturnValue({ ok: false, remaining: 0, retryAfterSeconds: 30 });
    const res = await POST({ json: async () => reinstatementBody() } as never);
    expect(res.status).toBe(429);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });
});

describe('guest reinstatement order creation', () => {
  function paidIntent(amount: number, metadata: Record<string, string>) {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_123',
      status: 'succeeded',
      amount,
      livemode: false,
      metadata,
      payment_method: {
        id: 'pm_1',
        card: { last4: '4242', brand: 'visa' },
        billing_details: { name: 'Ana Lopez' },
      },
    });
  }

  it('stores a REINSTATEMENT filing and a test payment after a succeeded intent', async () => {
    const quote = quoteReinstatement({ years: [2024] });
    paidIntent(quote.totalCents, reinstatementStripeMetadata('L14000012345', [2024]));
    const result = await fulfillReinstatementOrder({
      ...reinstatementBody({ amountCents: quote.totalCents }),
      paymentIntentId: 'pi_123',
    });
    expect(result).toEqual({ ok: true, filingId: 'filing_1' });
    expect(filingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        filingSource: 'REINSTATEMENT',
        status: 'SUBMITTED',
        entityType: 'LLC',
        state: 'FL',
        businessName: 'Palm LLC',
        isTest: true,
        totalCents: quote.totalCents,
        serviceFeeCents: 14_900,
        stateFeeCents: quote.stateFeeCents,
      }),
    });
    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripePaymentIntentId: 'pi_123',
        amountCents: quote.totalCents,
        status: 'SUCCEEDED',
        isTest: true,
        stateFilingFeeCents: quote.stateFeeCents,
        formationServiceFeeCents: 14_900,
      }),
    });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      type: 'REINSTATEMENT_ORDER_ADMIN',
      to: INQUIRY_NOTIFY_EMAIL,
    }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      type: 'REINSTATEMENT_ORDER_RECEIPT',
      to: 'ana@example.com',
    }));
  });

  it('does not record an order when the paid amount does not match the quote', async () => {
    paidIntent(100, reinstatementStripeMetadata('L14000012345', [2024]));
    const quote = quoteReinstatement({ years: [2024] });
    const result = await fulfillReinstatementOrder({
      ...reinstatementBody({ amountCents: quote.totalCents }),
      paymentIntentId: 'pi_123',
    });
    expect(result.ok).toBe(false);
    expect(filingCreate).not.toHaveBeenCalled();
  });

  it('returns the existing filing when the payment was already recorded', async () => {
    paymentFindUnique.mockResolvedValue({ filingId: 'filing_existing' });
    const quote = quoteReinstatement({ years: [2024] });
    paidIntent(quote.totalCents, reinstatementStripeMetadata('L14000012345', [2024]));
    const result = await fulfillReinstatementOrder({
      ...reinstatementBody({ amountCents: quote.totalCents }),
      paymentIntentId: 'pi_123',
    });
    expect(result).toEqual({ ok: true, filingId: 'filing_existing' });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('checkout boundaries', () => {
  it('leaves payment-intent, the dashboard annual report, and Step12Payment alone', () => {
    const paymentRoute = source('app/api/stripe/payment-intent/route.ts');
    expect(paymentRoute).not.toContain('reinstatement');
    expect(paymentRoute).not.toContain('service-order');
    expect(source('actions/annual-report.ts')).not.toContain('FL_AR_LATE_FEE');
    expect(source('actions/annual-report.ts')).not.toContain('quoteReinstatement');
    expect(source('components/dashboard/AnnualReportForm.tsx')).not.toContain('lateFee');
    expect(source('components/wizard/steps/Step12Payment.tsx')).not.toContain('service-order');
    expect(source('components/marketing/ReinstatementOrderForm.tsx')).toContain("setLookupError(t('lookupFailed'))");
    expect(source('components/marketing/ReinstatementOrderForm.tsx')).not.toContain('res.error');
    expect(customerSunbizMessage(new SunbizError(
      'not_configured',
      'Entity lookup requires SUNBIZDAILY_API_KEY, or set LINK_ENTITY_ALLOW_SEED_LOOKUP=true for local seed data.',
    ))).toBe('Could not load that record. Please try again.');
    expect(customerSunbizMessage(new SunbizError('not_found', 'No match in Sunbiz for that document number.'))).toBe(
      'No match in Sunbiz for that document number.',
    );
    const guest = source('components/marketing/GuestAnnualReportForm.tsx');
    expect(guest).toContain("intentPath: '/api/stripe/service-order'");
    expect(guest).toContain("type: 'annual-report'");
    expect(source('next.config.js')).toContain("source: '/reinstate-florida-llc'");
    expect(source('next.config.js')).toContain("destination: '/reinstate-llc'");
    const key = serviceOrderIdempotencyKey({
      type: 'reinstatement',
      documentNumber: 'L14000012345',
      amountCents: 38_775,
      years: [2024],
      email: 'ana@example.com',
    });
    expect(key).toContain('reinstatement');
    expect(key).toContain('L14000012345');
  });
});
