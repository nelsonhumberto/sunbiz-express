import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTemplate } from '@/lib/email';
import {
  authorizeGuestFormationPayment,
  filingCheckoutEmailDetails,
  filingNeedsSetPasswordPrompt,
  guestSetPasswordSiteUrl,
  maySignInClaimedGuest,
  planGuestAccountClaim,
  planGuestClaimFollowUp,
  planRecoveredGuestClaim,
  planWebhookPaidReplay,
  submittedFilingHref,
  withGuestSetPasswordPending,
  withoutGuestSetPasswordPending,
} from '@/lib/guest-checkout';
import { hrefForLocale } from '@/lib/app-href';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const userFindUnique = vi.hoisted(() => vi.fn());
const userUpdateMany = vi.hoisted(() => vi.fn());
const tokenCreate = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: () => ({ get: () => null }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique, updateMany: userUpdateMany },
    passwordResetToken: { create: tokenCreate },
  },
}));
vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>('@/lib/email');
  return { ...actual, sendEmail };
});
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { claimPaidGuestAccount } from '@/lib/guest-checkout-claim';

const owner = { guestUserId: 'guest_1', filingUserId: 'guest_1', filingStatus: 'DRAFT', alreadyPaid: false };

describe('guest PaymentIntent authorization', () => {
  it('allows the guest who owns the draft', () => {
    expect(
      authorizeGuestFormationPayment({
        ...owner,
        email: 'Buyer@Example.com',
        emailOwner: null,
      }),
    ).toEqual({ ok: true, email: 'buyer@example.com' });
    expect(
      authorizeGuestFormationPayment({
        ...owner,
        email: 'buyer@example.com',
        emailOwner: { id: 'guest_1', accountStatus: 'GUEST' },
      }).ok,
    ).toBe(true);
  });

  it('denies a different guest', () => {
    expect(
      authorizeGuestFormationPayment({
        ...owner,
        guestUserId: 'guest_2',
        email: 'buyer@example.com',
        emailOwner: null,
      }),
    ).toEqual({ ok: false, reason: 'not_owner' });
  });

  it('denies an email that already belongs to a non-guest account', () => {
    expect(
      authorizeGuestFormationPayment({
        ...owner,
        email: 'buyer@example.com',
        emailOwner: { id: 'victim', accountStatus: 'ACTIVE' },
      }),
    ).toEqual({ ok: false, reason: 'existing_account' });
    expect(
      authorizeGuestFormationPayment({
        ...owner,
        email: 'buyer@example.com',
        emailOwner: { id: 'victim', accountStatus: 'SUSPENDED' },
      }).ok,
    ).toBe(false);
  });

  it('stores the real email on the filing details and drops a pending sign-in flag', () => {
    expect(
      filingCheckoutEmailDetails(
        { processingOption: 'standard', pendingAccountEmail: 'old@example.com' },
        'buyer@example.com',
      ),
    ).toEqual({
      processingOption: 'standard',
      checkoutEmail: 'buyer@example.com',
      typedGuestEmail: 'buyer@example.com',
    });
  });
});

describe('guest account claim after payment', () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    userUpdateMany.mockReset();
    tokenCreate.mockReset();
    sendEmail.mockReset();
    tokenCreate.mockResolvedValue({});
    sendEmail.mockResolvedValue({ id: 'mail_1' });
  });

  it('creates the account from the guest row and emails a set-password link once', async () => {
    userFindUnique.mockImplementation(async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.id) {
        return {
          id: 'guest_1',
          email: 'buyer@example.com',
          accountStatus: 'GUEST',
          firstName: 'Ana',
        };
      }
      return { id: 'guest_1', accountStatus: 'GUEST' };
    });
    userUpdateMany.mockResolvedValue({ count: 1 });

    const first = await claimPaidGuestAccount({ userId: 'guest_1', filingId: 'filing_1', locale: 'es' });
    expect(first.claimed).toBe(true);
    expect(first.email).toBe('buyer@example.com');
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: 'guest_1', accountStatus: 'GUEST' },
      data: expect.objectContaining({ accountStatus: 'ACTIVE', guestToken: null }),
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GUEST_SET_PASSWORD',
        to: 'buyer@example.com',
        userId: 'guest_1',
        filingId: 'filing_1',
      }),
    );

    userFindUnique.mockImplementation(async () => ({
      id: 'guest_1',
      email: 'buyer@example.com',
      accountStatus: 'ACTIVE',
      firstName: 'Ana',
    }));
    const second = await claimPaidGuestAccount({ userId: 'guest_1', filingId: 'filing_1' });
    expect(second).toEqual({
      claimed: false,
      alreadyClaimed: true,
      email: 'buyer@example.com',
      userId: 'guest_1',
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('treats a lost claim race for this same user as already claimed, without a second email', async () => {
    let status = 'GUEST';
    userFindUnique.mockImplementation(async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.email) return { id: 'guest_1', accountStatus: status };
      return {
        id: 'guest_1',
        email: 'buyer@example.com',
        accountStatus: status,
        firstName: 'Ana',
      };
    });
    userUpdateMany.mockImplementation(async () => {
      status = 'ACTIVE';
      return { count: 0 };
    });

    const result = await claimPaidGuestAccount({ userId: 'guest_1', filingId: 'filing_1' });
    expect(result).toEqual({
      claimed: false,
      alreadyClaimed: true,
      email: 'buyer@example.com',
      userId: 'guest_1',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not claim or email when the address belongs to another account', async () => {
    userFindUnique.mockImplementation(async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.id) {
        return {
          id: 'guest_1',
          email: 'buyer@example.com',
          accountStatus: 'GUEST',
          firstName: 'Ana',
        };
      }
      return { id: 'victim', accountStatus: 'ACTIVE' };
    });
    const result = await claimPaidGuestAccount({ userId: 'guest_1', filingId: 'filing_1' });
    expect(result).toEqual({ claimed: false });
    expect(planGuestAccountClaim({
      userId: 'guest_1',
      accountStatus: 'GUEST',
      email: 'buyer@example.com',
      emailOwner: { id: 'victim', accountStatus: 'ACTIVE' },
    })).toEqual({ action: 'skip', reason: 'existing_account' });
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not open a session for a different account that shares the email', () => {
    expect(
      maySignInClaimedGuest({
        claimedUserId: 'guest_1',
        claimedEmail: 'buyer@example.com',
        loadedUserId: 'victim',
        loadedEmail: 'buyer@example.com',
        loadedStatus: 'ACTIVE',
      }),
    ).toBe(false);
    expect(
      maySignInClaimedGuest({
        claimedUserId: 'guest_1',
        claimedEmail: 'buyer@example.com',
        loadedUserId: 'guest_1',
        loadedEmail: 'buyer@example.com',
        loadedStatus: 'ACTIVE',
      }),
    ).toBe(true);
  });
});

describe('already claimed by this PaymentIntent', () => {
  const pi = {
    actorId: 'guest_1',
    filingId: 'filing_1',
    paymentIntentUserId: 'guest_1',
    paymentIntentFilingId: 'filing_1',
  };

  it('opens a session on the first claim and uses claimed sign-in when the webhook won', () => {
    expect(
      planGuestClaimFollowUp({
        ...pi,
        claim: { claimed: true, email: 'buyer@example.com', password: 'secret', userId: 'guest_1' },
      }),
    ).toBe('open_session');
    expect(
      planGuestClaimFollowUp({
        ...pi,
        claim: { claimed: false, alreadyClaimed: true, email: 'buyer@example.com', userId: 'guest_1' },
      }),
    ).toBe('claimed_sign_in');
    expect(
      planGuestClaimFollowUp({
        ...pi,
        paymentIntentUserId: 'other_user',
        claim: { claimed: false, alreadyClaimed: true, email: 'buyer@example.com', userId: 'guest_1' },
      }),
    ).toBe('leave');
    expect(
      planRecoveredGuestClaim({
        filingId: 'filing_1',
        filingUserId: 'guest_1',
        paymentIntentId: 'pi_1',
        paymentIntentStatus: 'succeeded',
        paymentIntentUserId: 'guest_1',
        paymentIntentFilingId: 'filing_1',
        recordedPaymentIntentId: 'pi_1',
        recordedFilingId: 'filing_1',
        recordedUserId: 'guest_1',
        accountStatus: 'ACTIVE',
        accountEmail: 'buyer@example.com',
      }),
    ).toEqual({ followUp: 'claimed_sign_in', email: 'buyer@example.com' });
    expect(
      planRecoveredGuestClaim({
        filingId: 'filing_1',
        filingUserId: 'guest_1',
        paymentIntentId: 'pi_1',
        paymentIntentStatus: 'succeeded',
        paymentIntentUserId: 'guest_1',
        paymentIntentFilingId: 'filing_other',
        recordedPaymentIntentId: 'pi_1',
        recordedFilingId: 'filing_1',
        recordedUserId: 'guest_1',
        accountStatus: 'ACTIVE',
        accountEmail: 'buyer@example.com',
      }).followUp,
    ).toBe('leave');
    expect(sourceOf('actions/payments.ts')).toContain('planGuestClaimFollowUp');
    expect(sourceOf('actions/payments.ts')).toContain('claimed=1');
    expect(sourceOf('actions/payments.ts')).toContain('setPassword=1');
  });
});

function sourceOf(rel: string): string {
  return readFileSync(rel, 'utf8');
}

describe('set-password link host', () => {
  it('uses the preview deployment outside production and ignores a foreign origin in production', () => {
    expect(
      guestSetPasswordSiteUrl({
        vercelEnv: 'production',
        canonicalUrl: 'https://launchforma.com',
        vercelUrl: 'launchforma-abc.vercel.app',
        branchUrl: 'launchforma-git-branch.vercel.app',
        requestOrigin: 'https://evil.example',
      }),
    ).toBe('https://launchforma.com');
    expect(
      guestSetPasswordSiteUrl({
        vercelEnv: 'preview',
        canonicalUrl: 'https://launchforma.com',
        vercelUrl: 'launchforma-abc.vercel.app',
        requestOrigin: 'https://evil.example',
      }),
    ).toBe('https://launchforma-abc.vercel.app');
    expect(
      guestSetPasswordSiteUrl({
        vercelEnv: 'preview',
        canonicalUrl: 'https://launchforma.com/',
        vercelUrl: 'launchforma-abc.vercel.app',
        branchUrl: 'launchforma-git-branch-team.vercel.app',
        requestOrigin: 'https://launchforma-git-branch-team.vercel.app',
      }),
    ).toBe('https://launchforma-git-branch-team.vercel.app');
    expect(
      guestSetPasswordSiteUrl({
        vercelEnv: 'development',
        canonicalUrl: 'https://launchforma.com',
        requestOrigin: 'http://localhost:3000',
      }),
    ).toBe('http://localhost:3000');
    const claim = sourceOf('lib/guest-checkout-claim.ts');
    expect(claim).toContain('guestSetPasswordSiteUrl');
    expect(claim).not.toContain("headers().get('host')");
    expect(claim).not.toContain("headers().get('x-forwarded-host')");
  });
});

describe('repeated payment webhook', () => {
  it('does not record a second payment or send another set-password email', () => {
    expect(
      planWebhookPaidReplay({ paymentAlreadyRecorded: true, accountStatus: 'ACTIVE' }),
    ).toEqual({ recordPayment: false, claimAccount: false });
    expect(
      planWebhookPaidReplay({ paymentAlreadyRecorded: true, accountStatus: 'GUEST' }),
    ).toEqual({ recordPayment: false, claimAccount: true });
    expect(
      planWebhookPaidReplay({ paymentAlreadyRecorded: false, accountStatus: 'GUEST' }),
    ).toEqual({ recordPayment: true, claimAccount: true });
    expect(
      planWebhookPaidReplay({ paymentAlreadyRecorded: false, accountStatus: 'ACTIVE' }),
    ).toEqual({ recordPayment: true, claimAccount: false });
  });
});

describe('submitted filing redirect', () => {
  it('keeps setPassword=1 on the success page and sends everyone else to the filing', () => {
    const pending = withGuestSetPasswordPending({ checkoutEmail: 'ana@example.com' });
    expect(filingNeedsSetPasswordPrompt(pending)).toBe(true);
    expect(submittedFilingHref('fil_1', pending)).toBe(
      '/checkout/success?filing=fil_1&setPassword=1',
    );
    expect(submittedFilingHref('fil_1', pending)).not.toContain('/dashboard/filings/');
    expect(hrefForLocale(submittedFilingHref('fil_1', pending), 'es')).toBe(
      '/es/checkout/success?filing=fil_1&setPassword=1',
    );

    expect(submittedFilingHref('fil_1', withoutGuestSetPasswordPending(pending))).toBe(
      '/dashboard/filings/fil_1',
    );
    expect(submittedFilingHref('fil_1', { checkoutEmail: 'ana@example.com' })).toBe(
      '/dashboard/filings/fil_1',
    );
    expect(submittedFilingHref('fil_1', null)).toBe('/dashboard/filings/fil_1');
    expect(hrefForLocale(submittedFilingHref('fil_1', null), 'es')).toBe(
      '/es/dashboard/filings/fil_1',
    );

    const wizard = sourceOf('app/wizard/[filingId]/[step]/page.tsx');
    expect(wizard).toContain('submittedFilingHref');
    expect(wizard).not.toContain('`/dashboard/filings/${filing.id}`');
    const payments = sourceOf('actions/payments.ts');
    expect(payments).toContain('withGuestSetPasswordPending');
    const step = sourceOf('components/wizard/steps/Step12Payment.tsx');
    expect(step).toContain('if (!res) return { ok: true }');
    const success = sourceOf('app/(app)/checkout/success/page.tsx');
    expect(success).toContain("t('setPasswordTitle')");
    expect(success).toContain("t('setPasswordEmailed')");
    expect(success).not.toContain('redirectLocalized(`/dashboard/filings/');
    expect(success).not.toContain('router.push');
  });
});

describe('guest checkout copy', () => {
  it('says to check email for a password, in English and Spanish, without em dashes', () => {
    expect(en.wizard.guestDraftEmailMismatch).toBe(
      'This order was started with a different email. Continue as guest or sign in with that email.',
    );
    expect(es.wizard.guestDraftEmailMismatch).toMatch(/otro correo/);
    expect(es.wizard.guestDraftContinue).toMatch(/invitado/);
    expect(en.checkoutSuccess.setPasswordTitle).toBe('Check your email to set your password');
    expect(en.checkoutSuccess.setPasswordEmailed).toBe('We also emailed you a link.');
    expect(es.checkoutSuccess.setPasswordTitle).toMatch(/correo/);
    expect(es.checkoutSuccess.setPasswordTitle).toMatch(/contraseña/);
    expect(es.checkoutSuccess.setPasswordEmailed).toMatch(/enlace/);
    expect(es.checkoutSuccess.setPasswordEmailed).toMatch(/correo/);
    for (const copy of [
      en.wizard.guestPayEmailHint,
      es.wizard.guestPayEmailHint,
      en.wizard.guestCheckoutEmailUnavailable,
      es.wizard.guestCheckoutEmailUnavailable,
      en.wizard.guestDraftEmailMismatch,
      es.wizard.guestDraftEmailMismatch,
      en.wizard.guestDraftContinue,
      es.wizard.guestDraftContinue,
      en.wizard.guestDraftSignInEmail,
      es.wizard.guestDraftSignInEmail,
      en.checkoutSuccess.setPasswordTitle,
      en.checkoutSuccess.setPasswordBody,
      en.checkoutSuccess.setPasswordEmailed,
      es.checkoutSuccess.setPasswordTitle,
      es.checkoutSuccess.setPasswordBody,
      es.checkoutSuccess.setPasswordEmailed,
    ]) {
      expect(copy).not.toMatch(/\u2014|\u2013/);
      expect(copy).not.toMatch(/Bienvenid/);
    }
    const spanish = renderTemplate('GUEST_SET_PASSWORD', {
      locale: 'es',
      resetUrl: 'https://launchforma.com/reset-password?token=abc',
      loginEmail: 'ana@example.com',
    });
    expect(spanish.subject).not.toMatch(/\u2014|\u2013|Bienvenid/);
    expect(spanish.html).toContain('Crear contraseña');
    expect(spanish.html).not.toMatch(/\u2014|\u2013|Bienvenid/);
    const english = renderTemplate('GUEST_SET_PASSWORD', {
      resetUrl: 'https://launchforma.com/reset-password?token=abc',
    });
    expect(english.subject).toMatch(/password/i);
    expect(english.html).toContain('reset-password?token=abc');
  });
});
