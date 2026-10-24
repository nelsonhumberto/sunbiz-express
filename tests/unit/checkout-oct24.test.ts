import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkoutPaymentIntentIdempotencyKey,
  isReusablePaymentIntentStatus,
  planCheckoutPaymentIntent,
} from '@/lib/checkout-payment-intent';
import { memberTitleLabel, reviewMemberText } from '@/lib/member-title';
import { RA_AUTORENEW_CHECKED_BY_DEFAULT, RA_RENEWAL_PRICE_CENTS } from '@/lib/pricing';
import { formatStripeWebhookLog } from '@/lib/stripe-webhook-log';
import {
  filingShowsOperatingAgreement,
  visibleSuccessDocuments,
} from '@/lib/success-documents';
import { displayStepNumber, resumeWizardPath, TOTAL_STEPS } from '@/lib/wizard-constants';

const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as {
  wizard: Record<string, string>;
  checkoutSuccess: Record<string, string>;
};
const es = JSON.parse(readFileSync('messages/es.json', 'utf8')) as {
  wizard: Record<string, string>;
  checkoutSuccess: Record<string, string>;
};

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('checkout PaymentIntent reuse', () => {
  it('reuses a confirmable intent and only reprices when the amount changed', () => {
    expect(
      planCheckoutPaymentIntent({
        filingId: 'filing_1',
        amountCents: 14900,
        storedPaymentIntentId: 'pi_open',
        storedStatus: 'requires_payment_method',
        storedAmount: 14900,
      }),
    ).toEqual({ action: 'reuse', paymentIntentId: 'pi_open', updateAmount: false });

    expect(
      planCheckoutPaymentIntent({
        filingId: 'filing_1',
        amountCents: 14900,
        storedPaymentIntentId: 'pi_open',
        storedStatus: 'requires_action',
        storedAmount: 9900,
      }),
    ).toEqual({ action: 'reuse', paymentIntentId: 'pi_open', updateAmount: true });
  });

  it('creates with a filing and amount key, and a new key after a dead intent', () => {
    expect(checkoutPaymentIntentIdempotencyKey('filing_1', 14900)).toBe(
      'filing_filing_1_amt_14900',
    );
    expect(
      planCheckoutPaymentIntent({
        filingId: 'filing_1',
        amountCents: 14900,
        storedPaymentIntentId: 'pi_dead',
        storedStatus: 'canceled',
        storedAmount: 14900,
      }),
    ).toEqual({
      action: 'create',
      idempotencyKey: 'filing_filing_1_amt_14900_after_pi_dead',
    });
    expect(isReusablePaymentIntentStatus('succeeded')).toBe(false);
    expect(isReusablePaymentIntentStatus('processing')).toBe(false);
    expect(isReusablePaymentIntentStatus('requires_confirmation')).toBe(true);

    const route = source('app/api/stripe/payment-intent/route.ts');
    expect(route).toContain('planCheckoutPaymentIntent');
    expect(route).toContain('idempotencyKey');
    expect(route).toContain('checkoutPaymentIntentId');
    const migration = source(
      'prisma/migrations/20261024190000_add_checkout_payment_intent/migration.sql',
    );
    expect(migration).toContain('checkoutPaymentIntentId');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS');
  });
});

describe('registered agent auto-renew default', () => {
  it('stays unchecked and keeps the $150 renewal price', () => {
    expect(RA_AUTORENEW_CHECKED_BY_DEFAULT).toBe(false);
    expect(RA_RENEWAL_PRICE_CENTS).toBe(15000);
    expect(source('prisma/schema.prisma')).toMatch(/autoRenew\s+Boolean\s+@default\(false\)/);
    const payments = source('actions/payments.ts');
    expect(payments).toContain('RA_AUTORENEW_CHECKED_BY_DEFAULT');
    expect(payments).toContain('typeof input.autoRenewRa === \'boolean\'');
    const step = source('components/wizard/steps/Step12Payment.tsx');
    expect(step).toContain('useState(RA_AUTORENEW_CHECKED_BY_DEFAULT)');
    expect(step).not.toMatch(/useState\(\s*true\s*\)/);
  });
});

describe('success page operating agreement', () => {
  const docs = [
    { documentType: 'OPERATING_AGREEMENT', pendingState: false },
    { documentType: 'COVER_LETTER', pendingState: false },
    { documentType: 'SUNBIZ_COVER_PAGE', pendingState: false },
    { documentType: 'FILE_PACKAGE', pendingState: false },
    { documentType: 'ARTICLES_ORG', pendingState: false },
    { documentType: 'RECEIPT', pendingState: true },
  ];

  it('lists an agreement only when the LLC tier or add-on includes one', () => {
    expect(
      filingShowsOperatingAgreement({
        entityType: 'LLC',
        tier: 'BASIC',
        addOnSlugs: [],
      }),
    ).toBe(false);
    expect(
      filingShowsOperatingAgreement({
        entityType: 'LLC',
        tier: 'STANDARD',
        addOnSlugs: [],
      }),
    ).toBe(true);
    expect(
      filingShowsOperatingAgreement({
        entityType: 'LLC',
        tier: 'BASIC',
        addOnSlugs: ['operating_agreement_single'],
      }),
    ).toBe(true);
    expect(
      filingShowsOperatingAgreement({
        entityType: 'CORP',
        tier: 'PREMIUM',
        addOnSlugs: ['operating_agreement_multi'],
      }),
    ).toBe(false);

    expect(visibleSuccessDocuments(docs, false).map((doc) => doc.documentType)).toEqual([
      'ARTICLES_ORG',
    ]);
    expect(visibleSuccessDocuments(docs, true).map((doc) => doc.documentType)).toEqual([
      'OPERATING_AGREEMENT',
      'ARTICLES_ORG',
    ]);

    expect(en.checkoutSuccess.documentsReadyBody).not.toContain('Operating Agreement');
    expect(en.checkoutSuccess.documentsReadyBodyWithAgreement).toContain('Operating Agreement');
    expect(es.checkoutSuccess.documentsReadyBody).not.toContain('Acuerdo Operativo');
    expect(es.checkoutSuccess.documentsReadyBodyWithAgreement).toContain('Acuerdo Operativo');
    expect(source('app/(app)/checkout/success/page.tsx')).toContain(
      'filingShowsOperatingAgreement',
    );
  });
});

describe('cardholder placeholder', () => {
  it('uses the exact English and Spanish placeholders', () => {
    expect(en.wizard.cardholderPlaceholder).toBe('Name on card');
    expect(es.wizard.cardholderPlaceholder).toBe('Nombre en la tarjeta');
    const step = source('components/wizard/steps/Step12Payment.tsx');
    expect(step).toContain("t('cardholderPlaceholder')");
    expect(step).not.toContain('tier?.name');
  });
});

describe('review member title', () => {
  it('keeps a space between the title and the name', () => {
    const label = memberTitleLabel('AMBR', (key) => en.wizard[key] ?? key);
    expect(reviewMemberText('E2E TestOct24', label)).toBe('Authorized Member E2E TestOct24');
    expect(reviewMemberText('E2E TestOct24', 'AMBR')).toBe('AMBR E2E TestOct24');
    expect(reviewMemberText('E2E TestOct24', 'AMBR')).not.toBe('AMBRE2E TestOct24');
    expect(source('components/wizard/steps/Step10Review.tsx')).toContain('reviewMemberText');
  });
});

describe('payment sticky footer', () => {
  it('pads the payment fields on every width, including 390px', () => {
    const step = source('components/wizard/steps/Step12Payment.tsx');
    expect(step).toContain('pb-[calc(8rem+env(safe-area-inset-bottom))]');
    expect(step).not.toMatch(
      /(sm|md|lg|xl):pb-\[calc\(8rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
  });
});

describe('wizard step number matches the URL', () => {
  it('prints the route step and keeps resume links on currentStep', () => {
    for (let step = 1; step <= TOTAL_STEPS; step += 1) {
      expect(displayStepNumber(step)).toBe(step);
    }
    expect(displayStepNumber(0)).toBe(1);
    expect(displayStepNumber(99)).toBe(TOTAL_STEPS);
    expect(resumeWizardPath('cmv', 7)).toBe('/wizard/cmv/7');
    expect(resumeWizardPath('cmv', null)).toBe('/wizard/cmv/2');
    expect(resumeWizardPath('cmv', 12)).toBe('/wizard/cmv/12');
    expect(source('app/resume/route.ts')).toContain('resumeWizardPath');
    const shell = source('components/wizard/WizardShell.tsx');
    expect(shell).toContain('total: TOTAL_STEPS');
    expect(shell).not.toContain('bonusStepCounter');
  });
});

describe('stripe webhook log line', () => {
  it('records type, id, and outcome, and redacts secrets', () => {
    expect(
      formatStripeWebhookLog({
        type: 'payment_intent.succeeded',
        id: 'evt_123',
        outcome: 'reconciled',
      }),
    ).toBe('stripe webhook type=payment_intent.succeeded id=evt_123 outcome=reconciled');
    expect(
      formatStripeWebhookLog({
        type: 'payment_intent.succeeded',
        id: 'user@example.com',
        outcome: 'error',
      }),
    ).toContain('id=redacted');
    expect(
      formatStripeWebhookLog({
        type: 'payment_intent.succeeded',
        id: 'sk_live_abc',
        outcome: 'error',
      }),
    ).toContain('id=redacted');
    const route = source('app/api/stripe/webhook/route.ts');
    expect(route).toContain('formatStripeWebhookLog');
    expect(route).toContain("logStripeWebhook(event.type, event.id, 'error')");
    expect(route).not.toContain('stripe webhook signature verification failed');
  });
});
