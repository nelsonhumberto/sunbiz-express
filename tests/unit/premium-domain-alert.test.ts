import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique },
    emailNotification: { findFirst },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail,
}));

import {
  notifyPremiumDomainRegistration,
  readPreferredDomain,
  showsManualDomainBadge,
  withDomainRegisteredMark,
} from '@/lib/premium-domain';

function premiumFiling(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fil_1',
    isTest: false,
    serviceTier: 'PREMIUM',
    businessName: 'Acme LLC',
    optionalDetails: null,
    userId: 'usr_1',
    user: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
    ...overrides,
  };
}

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ id: 'ntf_1', status: 'SENT' });
  findFirst.mockResolvedValue(null);
  findUnique.mockResolvedValue(premiumFiling());
});

describe('premium domain alert', () => {
  it('sends once when a Premium order is paid', async () => {
    const result = await notifyPremiumDomainRegistration({
      filingId: 'fil_1',
      paymentIsTest: false,
    });

    expect(result).toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DOMAIN_REGISTER',
        to: 'admin@launchforma.com',
        filingId: 'fil_1',
        userId: 'usr_1',
        step: 'DOMAIN_REGISTER',
        context: expect.objectContaining({
          businessName: 'Acme LLC',
          domainCustomerName: 'Jane Doe',
          domainCustomerEmail: 'jane@example.com',
          domainFilingId: 'fil_1',
          domainAdminUrl: expect.stringContaining('/admin/filings/fil_1'),
        }),
      }),
    );
    expect(sendEmail.mock.calls[0][0].context.domainPreferred).toBeUndefined();
  });

  it('sends nothing for a non-Premium order', async () => {
    findUnique.mockResolvedValue(premiumFiling({ serviceTier: 'STANDARD' }));

    const result = await notifyPremiumDomainRegistration({
      filingId: 'fil_1',
      paymentIsTest: false,
    });

    expect(result).toBe('skipped');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('sends nothing new when the same paid order is seen again', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ntf_1' });

    const first = await notifyPremiumDomainRegistration({
      filingId: 'fil_1',
      paymentIsTest: false,
    });
    const retry = await notifyPremiumDomainRegistration({
      filingId: 'fil_1',
      paymentIsTest: false,
    });

    expect(first).toBe('sent');
    expect(retry).toBe('duplicate');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('skips test filings and test payments without writing an alert', async () => {
    findUnique.mockResolvedValue(premiumFiling({ isTest: true }));
    await notifyPremiumDomainRegistration({ filingId: 'fil_1', paymentIsTest: false });

    findUnique.mockResolvedValue(premiumFiling());
    await notifyPremiumDomainRegistration({ filingId: 'fil_1', paymentIsTest: true });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('includes a preferred domain when one is already stored', async () => {
    findUnique.mockResolvedValue(
      premiumFiling({
        optionalDetails: JSON.stringify({ preferredDomain: 'acme.com', processingOption: 'standard' }),
      }),
    );

    await notifyPremiumDomainRegistration({ filingId: 'fil_1', paymentIsTest: false });

    expect(sendEmail.mock.calls[0][0].context.domainPreferred).toBe('acme.com');
  });

  it('is called from checkout and from the payment webhook, including a retry', () => {
    const checkout = readFileSync('actions/payments.ts', 'utf8');
    const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8');
    const created = checkout.indexOf('prisma.payment.create');
    const alert = checkout.indexOf('await notifyPremiumDomainRegistrationSafely', created);
    expect(created).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(created);

    const reconcile = webhook.slice(webhook.indexOf('async function reconcilePaidFiling'));
    const calls = reconcile.split('notifyPremiumDomainRegistrationSafely').length - 1;
    expect(calls).toBeGreaterThanOrEqual(3);
    const existing = reconcile.indexOf('if (existing)');
    const existingAlert = reconcile.indexOf('notifyPremiumDomainRegistrationSafely');
    expect(existingAlert).toBeGreaterThan(existing);
  });
});

describe('manual domain badge and mark', () => {
  const realPayment = [{ status: 'SUCCEEDED', isTest: false }];

  it('shows only for a paid Premium filing that is not a test', () => {
    expect(
      showsManualDomainBadge({ serviceTier: 'PREMIUM', isTest: false, payments: realPayment }),
    ).toBe(true);
    expect(
      showsManualDomainBadge({ serviceTier: 'STANDARD', isTest: false, payments: realPayment }),
    ).toBe(false);
    expect(
      showsManualDomainBadge({ serviceTier: 'BASIC', isTest: false, payments: realPayment }),
    ).toBe(false);
    expect(
      showsManualDomainBadge({
        serviceTier: 'PREMIUM',
        isTest: false,
        payments: [{ status: 'SUCCEEDED', isTest: true }],
      }),
    ).toBe(false);
    expect(
      showsManualDomainBadge({ serviceTier: 'PREMIUM', isTest: true, payments: realPayment }),
    ).toBe(false);
    expect(
      showsManualDomainBadge({
        serviceTier: 'PREMIUM',
        isTest: false,
        payments: [{ status: 'PENDING', isTest: false }],
      }),
    ).toBe(false);
  });

  it('stores the registered mark in optionalDetails without dropping other keys', () => {
    const existing = JSON.stringify({
      processingOption: 'expedited',
      memberTaxInfo: [{ taxIdEncrypted: 'cipher', taxIdLast4: '6789' }],
    });
    const marked = withDomainRegisteredMark(existing, true, '2026-10-25T12:00:00.000Z');
    expect(marked.ok).toBe(true);
    if (!marked.ok) return;
    const parsed = JSON.parse(marked.json) as Record<string, unknown>;
    expect(parsed.domainRegisteredAt).toBe('2026-10-25T12:00:00.000Z');
    expect(parsed.processingOption).toBe('expedited');
    expect(parsed.memberTaxInfo).toEqual([{ taxIdEncrypted: 'cipher', taxIdLast4: '6789' }]);

    const cleared = withDomainRegisteredMark(marked.json, false, '2026-10-25T13:00:00.000Z');
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(JSON.parse(cleared.json).domainRegisteredAt).toBeUndefined();
    expect(JSON.parse(cleared.json).processingOption).toBe('expedited');
  });

  it('refuses to rewrite optionalDetails that is not a JSON object', () => {
    expect(withDomainRegisteredMark('not-json', true, '2026-10-25T12:00:00.000Z').ok).toBe(false);
    expect(withDomainRegisteredMark('[]', true, '2026-10-25T12:00:00.000Z').ok).toBe(false);
  });

  it('reads a stored hostname and ignores a missing one', () => {
    expect(readPreferredDomain(null)).toBeNull();
    expect(readPreferredDomain(JSON.stringify({ processingOption: 'standard' }))).toBeNull();
    expect(readPreferredDomain(JSON.stringify({ domainName: 'widgets.com' }))).toBe('widgets.com');
    expect(readPreferredDomain(JSON.stringify({ preferredDomain: 'not a domain' }))).toBeNull();
  });
});
