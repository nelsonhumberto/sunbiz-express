import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());
const getGuestUser = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const paymentIntentsCreate = vi.hoisted(() => vi.fn());
const paymentIntentsRetrieve = vi.hoisted(() => vi.fn());
const paymentIntentsUpdate = vi.hoisted(() => vi.fn());
const refundsCreate = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const fetchDetail = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/guest', () => ({ getGuestUser }));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique: filingFindUnique, update: vi.fn() },
    annualReport: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    coupon: { findUnique: vi.fn() },
    registeredAgentService: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: {
      create: paymentIntentsCreate,
      retrieve: paymentIntentsRetrieve,
      update: paymentIntentsUpdate,
    },
    refunds: { create: refundsCreate },
    customers: { create: vi.fn() },
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit,
  clientIp: () => '203.0.113.8',
}));
vi.mock('@/lib/sunbiz', () => ({
  fetchFloridaEntityDetailByDocumentNumber: fetchDetail,
}));
vi.mock('@/lib/utm-server', () => ({ getServerUtmAttribution: () => null }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
  headers: () => ({ get: headerGet }),
}));

import { POST } from '@/app/api/stripe/payment-intent/route';

const OCTOBER_15_NOON_ET = new Date('2026-10-15T16:00:00.000Z');

function post(body: unknown, purpose?: string) {
  const params = new URLSearchParams();
  if (purpose) params.set('purpose', purpose);
  return POST({
    nextUrl: { searchParams: params },
    json: async () => body,
  } as never);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(OCTOBER_15_NOON_ET);
  auth.mockReset();
  getGuestUser.mockReset();
  filingFindUnique.mockReset();
  paymentIntentsCreate.mockReset();
  paymentIntentsRetrieve.mockReset();
  paymentIntentsUpdate.mockReset();
  refundsCreate.mockReset();
  rateLimit.mockReset();
  auth.mockResolvedValue(null);
  getGuestUser.mockResolvedValue(null);
  rateLimit.mockReturnValue({ ok: true, remaining: 9, retryAfterSeconds: 0 });
  headerGet.mockReset();
  headerGet.mockReturnValue(null);
  fetchDetail.mockReset();
  fetchDetail.mockResolvedValue({
    corporation_number: 'L12345678901',
    corporation_name: 'Ada LLC',
    status: 'ACTIVE',
    filing_type: 'FLAL',
    filing_type_display: 'Florida Limited Liability Company',
    file_date: '2015-04-10',
    annual_reports: [{ year: 2025, filed_date: '04/30/2025' }],
  });
  paymentIntentsCreate.mockResolvedValue({
    id: 'pi_guest',
    client_secret: 'sec_guest',
    status: 'requires_payment_method',
    amount: 63_775,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guest annual report payment intent', () => {
  it('prices a logged-out checkout from the server year and ignores the client amount', async () => {
    const res = await post(
      {
        documentNumber: 'L12345678901',
        entityType: 'LLC',
        useOurRa: false,
        amountCents: 1,
        lateFeeCents: 0,
        reportYear: 2099,
        guestAttemptId: 'attempt-12345678',
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentIntentId).toBe('pi_guest');
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 63_775,
        metadata: expect.objectContaining({
          purpose: 'guest_annual_report',
          reportYear: '2026',
          entityType: 'LLC',
        }),
      }),
      { idempotencyKey: 'guest_ar_attempt-12345678_amt_63775' },
    );
    expect(filingFindUnique).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith('guest-annual-report:203.0.113.8', 10, 60_000);
  });

  it('prices a signed-in guest annual report without a filing', async () => {
    auth.mockResolvedValue({ user: { id: 'user_1' } });
    fetchDetail.mockResolvedValue({
      corporation_number: 'P12345678901',
      corporation_name: 'Ada Corp',
      status: 'A',
      filing_type: 'DOMP',
      filing_type_display: 'Florida Profit Corporation',
      file_date: '2018-01-15',
      annual_reports: [{ year: 2024 }],
    });
    const res = await post(
      {
        documentNumber: 'P12345678901',
        entityType: 'LLC',
        useOurRa: true,
        amountCents: 50,
        reportYear: 2030,
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 9_900 + 15_000 + 40_000 + 15_000,
        metadata: expect.objectContaining({
          purpose: 'guest_annual_report',
          entityType: 'CORP',
          useOurRa: 'true',
          userId: 'user_1',
          reportYear: '2026',
        }),
      }),
      undefined,
    );
    expect(filingFindUnique).not.toHaveBeenCalled();
  });

  it('does not block a formation guest cookie from the public annual report checkout', async () => {
    getGuestUser.mockResolvedValue({ id: 'guest_cookie' });
    const res = await post(
      { documentNumber: 'L12345678901', entityType: 'LLC', useOurRa: false },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 63_775 }),
      undefined,
    );
  });

  it('returns 400 and does not create a PaymentIntent for a bad entity type', async () => {
    const res = await post(
      { entityType: 'NONPROFIT', useOurRa: false, amountCents: 21_875 },
      'guest_annual_report',
    );
    expect(res.status).toBe(400);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('rate limits guest annual report creation per IP', async () => {
    rateLimit.mockImplementation((key: string) => {
      if (String(key).startsWith('guest-annual-report:')) {
        return { ok: false, remaining: 0, retryAfterSeconds: 30 };
      }
      return { ok: true, remaining: 9, retryAfterSeconds: 0 };
    });
    const res = await post(
      { entityType: 'LLC', useOurRa: false },
      'guest_annual_report',
    );
    expect(res.status).toBe(429);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('reuses an open guest PaymentIntent and updates the amount to the server quote', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_open',
      status: 'requires_payment_method',
      amount: 21_875,
      client_secret: 'sec_open',
      metadata: { purpose: 'guest_annual_report', documentNumber: 'L12345678901' },
    });
    paymentIntentsUpdate.mockResolvedValue({
      id: 'pi_open',
      client_secret: 'sec_open',
      amount: 63_775,
    });
    const res = await post(
      {
        documentNumber: 'L12345678901',
        entityType: 'LLC',
        useOurRa: false,
        paymentIntentId: 'pi_open',
        amountCents: 1,
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentIntentId).toBe('pi_open');
    expect(paymentIntentsUpdate).toHaveBeenCalledWith(
      'pi_open',
      expect.objectContaining({ amount: 63_775 }),
    );
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('returns a succeeded guest PaymentIntent without creating or refunding another', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_paid',
      status: 'succeeded',
      amount: 21_875,
      client_secret: 'sec_paid',
      metadata: { purpose: 'guest_annual_report', documentNumber: 'L12345678901' },
    });
    const res = await post(
      { documentNumber: 'L12345678901', entityType: 'LLC', useOurRa: false, paymentIntentId: 'pi_paid' },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ paymentIntentId: 'pi_paid', alreadySucceeded: true });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(paymentIntentsUpdate).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('does not charge a dissolved company', async () => {
    fetchDetail.mockResolvedValue({
      corporation_number: 'L12345678901',
      corporation_name: 'Closed LLC',
      status: 'INACT',
      filing_type: 'FLAL',
      annual_reports: [],
    });
    const res = await post(
      { documentNumber: 'L12345678901', entityType: 'LLC', useOurRa: false, amountCents: 63_775 },
      'guest_annual_report',
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('company_dissolved');
    expect(json.error).toMatch(/dissolved/i);
    expect(json.error).not.toMatch(/SUNBIZ|API_KEY|process\.env/i);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(paymentIntentsUpdate).not.toHaveBeenCalled();
  });

  it('charges the late 2026 report when the company is active and the year is unfiled', async () => {
    fetchDetail.mockResolvedValue({
      corporation_number: 'L12345678901',
      corporation_name: 'Open LLC',
      status: 'A',
      filing_type: 'FLAL',
      file_date: '04/10/2015',
      annual_reports: [{ year: 2024 }, { year: 2025 }],
    });
    const res = await post(
      {
        documentNumber: 'L12345678901',
        entityType: 'CORP',
        useOurRa: false,
        amountCents: 1,
        reportYear: 2027,
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 63_775,
        metadata: expect.objectContaining({ entityType: 'LLC', reportYear: '2026' }),
      }),
      undefined,
    );
  });

  it('does not charge when the 2026 annual report is already filed', async () => {
    fetchDetail.mockResolvedValue({
      corporation_number: 'L12345678901',
      corporation_name: 'Current LLC',
      status: 'ACTIVE',
      filing_type: 'FLAL',
      annual_reports: [{ year: 2025 }, { year: 2026 }],
    });
    const res = await post(
      { documentNumber: 'L12345678901', entityType: 'LLC', useOurRa: false, amountCents: 63_775 },
      'guest_annual_report',
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('annual_report_filed');
    expect(json.error).toBe('Nothing due until Jan 1, 2027.');
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('does not create a PaymentIntent when the lookup cannot confirm the report', async () => {
    fetchDetail.mockRejectedValue(
      new Error('sunbizdaily rejected the API key (401/403). Check SUNBIZDAILY_API_KEY.'),
    );
    const res = await post(
      {
        documentNumber: 'L12345678901',
        entityType: 'LLC',
        useOurRa: false,
        amountCents: 1,
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('annual_report_unconfirmed');
    expect(json.error).toBe("We couldn't confirm this company's annual report status online.");
    expect(JSON.stringify(json)).not.toMatch(/SUNBIZ|API_KEY/);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(paymentIntentsUpdate).not.toHaveBeenCalled();
  });

  it('translates a missing document number', async () => {
    const res = await post({ entityType: 'LLC', useOurRa: false }, 'guest_annual_report');
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      code: 'document_number_required',
      error: 'Enter the document number.',
    });
    expect(json.error).not.toBe('Required');
    expect(paymentIntentsCreate).not.toHaveBeenCalled();

    headerGet.mockImplementation((name: string) => {
      if (name === 'referer') return 'https://launchforma.com/es/contacto';
      if (name === 'host') return 'launchforma.com';
      return null;
    });
    const spanish = await post({ entityType: 'LLC', useOurRa: false }, 'guest_annual_report');
    expect(spanish.status).toBe(400);
    expect(await spanish.json()).toMatchObject({
      code: 'document_number_required',
      error: 'Escribe el número de documento.',
    });
  });

  it('creates a new PaymentIntent when the stored document or purpose does not match', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_other',
      status: 'succeeded',
      amount: 63_775,
      client_secret: 'sec_other',
      metadata: { purpose: 'guest_annual_report', documentNumber: 'L99999999999' },
    });
    const res = await post(
      {
        documentNumber: 'L12345678901',
        entityType: 'LLC',
        useOurRa: false,
        paymentIntentId: 'pi_other',
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentIntentId).toBe('pi_guest');
    expect(json.alreadySucceeded).toBeUndefined();
    expect(paymentIntentsUpdate).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);

    paymentIntentsCreate.mockClear();
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_purpose',
      status: 'requires_payment_method',
      amount: 63_775,
      client_secret: 'sec_purpose',
      metadata: { purpose: 'formation', documentNumber: 'L12345678901' },
    });
    const purpose = await post(
      {
        documentNumber: 'L12345678901',
        entityType: 'LLC',
        useOurRa: false,
        paymentIntentId: 'pi_purpose',
      },
      'guest_annual_report',
    );
    expect(purpose.status).toBe(200);
    expect(paymentIntentsUpdate).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when a PaymentIntent cannot be retrieved', async () => {
    paymentIntentsRetrieve.mockRejectedValue(new Error('missing'));
    const res = await post(
      {
        documentNumber: 'L12345678901',
        entityType: 'LLC',
        useOurRa: false,
        paymentIntentId: 'pi_gone',
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Could not reuse that payment.' });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('does not sell the keeper fixture companies unless the current report is known unfiled', async () => {
    const cases = [
      {
        name: 'filed 2026',
        detail: {
          corporation_number: 'L15000021030',
          corporation_name: 'SOUTHERN HOLDINGS 9 LLC',
          status: 'ACTIVE',
          filing_type: 'FLAL',
          filing_type_display: 'Florida Limited Liability Company',
          file_date: '2015-04-10',
          annual_reports: [{ year: 2026, filed_date: '04/30/2026' }],
        },
        code: 'annual_report_filed',
        error: 'Nothing due until Jan 1, 2027.',
      },
      {
        name: 'formed 2026',
        detail: {
          corporation_number: 'L26000537730',
          corporation_name: 'New LLC',
          status: 'ACTIVE',
          filing_type: 'FLAL',
          filing_type_display: 'Florida Limited Liability Company',
          file_date: '2026-10-19',
        },
        code: 'annual_report_not_due',
        error: 'Nothing due until Jan 1, 2027.',
      },
      {
        name: 'dissolved',
        detail: {
          corporation_number: 'L25000294800',
          corporation_name: 'Closed LLC',
          status: 'INACT',
          filing_type: 'FLAL',
          filing_type_display: 'Florida Limited Liability Company',
          file_date: '2025-02-01',
        },
        code: 'company_dissolved',
      },
    ];
    for (const item of cases) {
      paymentIntentsCreate.mockClear();
      fetchDetail.mockResolvedValue(item.detail);
      const res = await post(
        { documentNumber: item.detail.corporation_number, entityType: 'CORP', useOurRa: false },
        'guest_annual_report',
      );
      expect(res.status, item.name).toBe(400);
      const json = await res.json();
      expect(json.code, item.name).toBe(item.code);
      if (item.error) expect(json.error, item.name).toBe(item.error);
      expect(paymentIntentsCreate, item.name).not.toHaveBeenCalled();
    }

    fetchDetail.mockResolvedValue({
      corporation_number: 'L25000509630',
      corporation_name: 'Open 2025 LLC',
      status: 'ACTIVE',
      filing_type: 'FLAL',
      filing_type_display: 'Florida Limited Liability Company',
      file_date: '2025-04-02',
      annual_reports: [],
    });
    const sold = await post(
      { documentNumber: 'L25000509630', entityType: 'CORP', useOurRa: false },
      'guest_annual_report',
    );
    expect(sold.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 63_775,
        metadata: expect.objectContaining({ entityType: 'LLC', documentNumber: 'L25000509630' }),
      }),
      undefined,
    );
  });

  it('quotes a corporation prefix even when the client says LLC', async () => {
    fetchDetail.mockResolvedValue({
      corporation_number: 'P26QA000001',
      corporation_name: 'Ada Corp',
      status: 'ACTIVE',
      file_date: '2019-05-01',
      annual_reports: [],
    });
    const res = await post(
      { documentNumber: 'P26QA000001', entityType: 'LLC', useOurRa: false },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 64_900,
        metadata: expect.objectContaining({ entityType: 'CORP' }),
      }),
      undefined,
    );
  });

  it('still returns 401 before reading the body for a logged-out formation request', async () => {
    const json = vi.fn(async () => {
      throw new Error('body read');
    });
    const res = await POST({ json } as never);
    expect(res.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });
});
