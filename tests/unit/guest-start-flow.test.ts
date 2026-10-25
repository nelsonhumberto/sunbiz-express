import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/email';
import { guestResumeUrl, isRecoverySkipAddress } from '@/lib/draft-recovery';
import {
  CHECKOUT_ACCOUNT_REQUIRED,
  checkoutAllowsPayment,
  guestResumeAllowed,
  isPlaceholderGuestEmail,
  loginLinkClaimPlan,
  placeholderGuestEmail,
  planGuestDraftAttach,
  planGuestEmailWrite,
  planStartGuestSession,
  readTypedGuestEmail,
  shouldAttachGuestDraft,
  wizardHrefForDraft,
} from '@/lib/guest-identity';
import { tierPackagePriceCents } from '@/lib/pricing';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(abs);
  }
}

const COPY_KEYS = [
  'guestEmailLabel',
  'guestEmailHint',
  'guestEmailRequired',
  'guestEmailInvalid',
  'guestEmailHasAccount',
  'accountGateTitle',
  'accountGateBody',
  'accountGateCreate',
  'accountGateMagic',
  'accountGateMagicSent',
  'accountGateSignIn',
  'accountGateRequired',
] as const;

describe('guest start flow', () => {
  it('creates a guest draft from /start without the sign-up form', () => {
    const page = source('app/start/page.tsx');
    const launch = source('app/start/guest-start-launch.tsx');
    const action = source('actions/guest-start.ts');
    expect(page).toContain('GuestStartLaunch');
    expect(page).not.toContain('GuestStartForm');
    expect(page).not.toContain('seededName ? 3');
    expect(launch).toContain('openGuestDraft');
    expect(launch).not.toContain('trackSignupStarted');
    expect(launch).not.toContain('firstName');
    expect(action).toContain('export async function openGuestDraft');
    expect(action).toContain("accountStatus: 'GUEST'");
    expect(action).toContain('placeholderGuestEmail');
    expect(action).toContain('setGuestCookie');
    expect(action).toContain('prisma.filing.create');
    expect(action).toContain('decideDraftNameResume');
    expect(page).not.toContain('prisma.filing.create');
    expect(page).not.toContain('prisma.user.create');
    expect(launch).not.toContain('useEffect');
    expect(launch).toContain("t('continue')");
    expect(launch).toContain('openGuestDraft');
    expect(action).not.toContain('seededName ? 3');
    expect(existsSync('app/start/guest-start-form.tsx')).toBe(false);
  });

  it('writes a real email onto the guest user and skips the placeholder in the drip', () => {
    const email = placeholderGuestEmail('abc123token');
    expect(isPlaceholderGuestEmail(email)).toBe(true);
    expect(isRecoverySkipAddress(email)).toBe(true);
    expect(isPlaceholderGuestEmail('ada@example.com')).toBe(false);
    expect(isRecoverySkipAddress('ada@example.com')).toBe(false);
    expect(planGuestEmailWrite('free')).toBe('write');
    expect(planGuestEmailWrite('self')).toBe('noop');
    expect(planGuestEmailWrite('guest')).toBe('keep_own');
    expect(planGuestEmailWrite('account')).toBe('hold_for_signin');
    expect(planStartGuestSession('free')).toBe('create');
    expect(planStartGuestSession('guest')).toBe('separate');
    expect(planStartGuestSession('account')).toBe('sign_in');
    expect(readTypedGuestEmail(JSON.stringify({ typedGuestEmail: 'Ada@Example.com' }))).toBe(
      'ada@example.com',
    );
    expect(readTypedGuestEmail(JSON.stringify({ typedGuestEmail: 'guest.a@guest.launchforma.invalid' }))).toBe(
      null,
    );

    const saver = source('actions/guest-email.ts');
    expect(saver).toContain('email: normalized');
    expect(saver).toContain('planGuestEmailWrite');
    expect(saver).toContain('typedGuestEmail');
    expect(saver).not.toContain('adopt_guest');
    expect(saver).not.toContain('setGuestCookie');
    const startAction = source('actions/guest-start.ts');
    expect(startAction).toContain('planStartGuestSession');
    expect(startAction).not.toContain('guestUser = existing');
    expect(startAction).not.toContain('already has a saved draft');
    expect(source('actions/annual-report.ts')).not.toContain("accountStatus !== 'GUEST'");
    const wizard = source('actions/wizard.ts');
    expect(wizard).toContain('persistGuestEmail');
    expect(wizard).toContain('contactEmail');
    expect(wizard).toContain('needsSignIn: true');
    expect(wizard).not.toContain('if (saved.needsSignIn) return { ok: true }');
    expect(source('components/wizard/steps/Step2Name.tsx')).toContain('GuestSignInPrompt');
    expect(source('components/wizard/steps/Step1Entity.tsx')).toContain('GuestSignInPrompt');
    expect(source('components/wizard/GuestSignInPrompt.tsx')).toContain("t('guestEmailHasAccount')");
    expect(source('components/wizard/steps/Step2Name.tsx')).toContain('setEmailError(null)');
    expect(source('components/wizard/steps/Step1Entity.tsx')).toContain('setEmailError(null)');
    expect(source('actions/guest-start.ts')).toContain("t('guestEmailHasAccount')");
    expect(source('actions/guest-start.ts')).not.toContain('That email already has an account');
    expect(source('app/wizard/[filingId]/[step]/page.tsx')).toContain('pendingAccountEmail={pendingAccountEmail}');
  });

  it('requires an account before checkout', () => {
    expect(checkoutAllowsPayment('guest')).toBe(false);
    expect(checkoutAllowsPayment('user')).toBe(true);
    expect(checkoutAllowsPayment(null)).toBe(false);
    expect(CHECKOUT_ACCOUNT_REQUIRED).toBe('Create an account before you pay.');
    expect(source('actions/payments.ts')).toContain('checkoutAllowsPayment');
    expect(source('actions/payments.ts')).toContain('CHECKOUT_ACCOUNT_REQUIRED');
    const paymentRoute = source('app/api/stripe/payment-intent/route.ts');
    expect(paymentRoute).toContain('CHECKOUT_ACCOUNT_REQUIRED');
    expect(paymentRoute).toContain('getGuestUser');
    expect(paymentRoute.indexOf('await auth()')).toBeLessThan(paymentRoute.indexOf('await request.json()'));
    expect(paymentRoute).not.toContain('amountCents >');
    const payment = source('components/wizard/steps/Step12Payment.tsx');
    expect(payment).toContain('GuestCheckoutAccount');
    expect(payment).toContain('nextDisabled={isGuest}');
    expect(payment).toContain('accountGateRequired');
  });

  it('attaches the guest draft when the visitor creates or enters an account', () => {
    expect(
      planGuestDraftAttach({
        guestUserId: 'guest_1',
        accountUserId: 'user_1',
        draftFilingIds: ['filing_1'],
      }),
    ).toEqual({
      action: 'move',
      filingIds: ['filing_1'],
      retireGuestUserId: 'guest_1',
    });
    expect(
      planGuestDraftAttach({
        guestUserId: 'user_1',
        accountUserId: 'user_1',
        draftFilingIds: ['filing_1'],
      }),
    ).toEqual({ action: 'already_attached', filingIds: ['filing_1'] });
    expect(planGuestDraftAttach({ guestUserId: null, accountUserId: 'user_1', draftFilingIds: [] })).toEqual({
      action: 'none',
      filingIds: [],
    });

    const placeholder = placeholderGuestEmail('tok');
    expect(shouldAttachGuestDraft({ guestEmail: placeholder, accountEmail: 'ada@example.com' })).toBe(true);
    expect(
      shouldAttachGuestDraft({
        guestEmail: placeholder,
        accountEmail: 'ada@example.com',
        typedEmails: ['ada@example.com'],
      }),
    ).toBe(true);
    expect(
      shouldAttachGuestDraft({
        guestEmail: placeholder,
        accountEmail: 'other@example.com',
        typedEmails: ['ada@example.com'],
      }),
    ).toBe(false);
    expect(shouldAttachGuestDraft({ guestEmail: 'ada@example.com', accountEmail: 'Ada@example.com' })).toBe(true);
    expect(shouldAttachGuestDraft({ guestEmail: 'other@example.com', accountEmail: 'ada@example.com' })).toBe(false);

    expect(loginLinkClaimPlan('GUEST', 'USER')).toBe('claim_guest');
    expect(loginLinkClaimPlan('ACTIVE', 'USER')).toBe('allow');
    expect(loginLinkClaimPlan('ACTIVE', 'ADMIN')).toBe('deny');
    expect(loginLinkClaimPlan('SUSPENDED', 'USER')).toBe('deny');

    expect(source('actions/auth.ts')).toContain('attachGuestDraftsToAccount');
    expect(source('actions/guest-email.ts')).toContain('planGuestDraftAttach');
    expect(source('lib/login-link.ts')).toContain('loginLinkClaimPlan');
    expect(source('lib/login-link.ts')).toContain("accountStatus: 'ACTIVE'");
    expect(wizardHrefForDraft('filing_1', 11)).toBe('/wizard/filing_1/11');
    expect(wizardHrefForDraft('filing_1', 0)).toBe('/wizard/filing_1/2');
  });

  it('keeps the guest resume link for a draft that still has a guest token', () => {
    expect(
      guestResumeAllowed({
        accountStatus: 'GUEST',
        guestToken: 'tok',
        token: 'tok',
        filingUserId: 'guest_1',
        guestUserId: 'guest_1',
        filingStatus: 'DRAFT',
      }),
    ).toBe(true);
    expect(
      guestResumeAllowed({
        accountStatus: 'ACTIVE',
        guestToken: null,
        token: 'tok',
        filingUserId: 'guest_1',
        guestUserId: 'guest_1',
        filingStatus: 'DRAFT',
      }),
    ).toBe(false);
    expect(
      guestResumeAllowed({
        accountStatus: 'GUEST',
        guestToken: 'tok',
        token: 'other',
        filingUserId: 'guest_1',
        guestUserId: 'guest_1',
        filingStatus: 'DRAFT',
      }),
    ).toBe(false);
    expect(
      guestResumeAllowed({
        accountStatus: 'GUEST',
        guestToken: 'tok_a',
        token: 'tok_a',
        filingUserId: 'guest_b',
        guestUserId: 'guest_a',
        filingStatus: 'DRAFT',
      }),
    ).toBe(false);
    expect(guestResumeUrl('https://launchforma.com', 'filing_1', 'tok')).toBe(
      'https://launchforma.com/resume?f=filing_1&t=tok',
    );
    const route = source('app/resume/route.ts');
    expect(route).toContain('guestResumeAllowed');
    expect(route).toContain('GUEST_COOKIE');
    expect(route).toContain('httpOnly: true');
  });

  it('keeps the public prices and avoids em dashes in the new copy', () => {
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(14900);
    expect(tierPackagePriceCents('STANDARD', 'LLC', 'FL')).toBe(27900);
    expect(tierPackagePriceCents('PREMIUM', 'LLC', 'FL')).toBe(44900);

    const wizardEn = en.wizard as Record<string, string>;
    const wizardEs = es.wizard as Record<string, string>;
    for (const key of COPY_KEYS) {
      expect(wizardEn[key], key).toBeTruthy();
      expect(wizardEs[key], key).toBeTruthy();
      expect(wizardEn[key], key).not.toContain('\u2014');
      expect(wizardEs[key], key).not.toContain('\u2014');
    }
    expect(en.start.subhead).not.toContain('\u2014');
    expect(es.start.subhead).not.toContain('\u2014');
    expect(es.start.opening).toContain('borrador');
    expect(es.wizard.accountGateBody).toContain('contraseña');
    expect(es.wizard.accountGateBody).not.toContain('vosotros');

    for (const locale of ['en', 'es'] as const) {
      const rendered = renderTemplate('CHECKOUT_LOGIN_LINK', {
        firstName: 'Ana',
        resumeUrl: 'https://launchforma.com/api/login-link?token=abc',
        locale,
        linkExpiresInDays: 3,
      });
      expect(rendered.subject).not.toContain('\u2014');
      expect(rendered.html).not.toContain('\u2014');
      expect(rendered.html).toContain('login-link');
    }
    expect(
      renderTemplate('CHECKOUT_LOGIN_LINK', { locale: 'es', resumeUrl: 'https://launchforma.com/x' }).html,
    ).toContain('enlace');
  });

  it('does not query app tables from the browser with the Supabase anon key', () => {
    const pkg = source('package.json');
    expect(pkg).not.toContain('@supabase/supabase-js');
    expect(pkg).not.toContain('@supabase/ssr');
    expect(pkg).not.toContain('NEXT_PUBLIC_SUPABASE');

    const files: string[] = [];
    for (const dir of ['app', 'components', 'lib', 'actions']) {
      walk(dir, files);
    }
    const hits = files.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /@supabase|supabase-js|createBrowserClient|NEXT_PUBLIC_SUPABASE_ANON_KEY|supabase\.from\(/.test(
        text,
      );
    });
    expect(hits).toEqual([]);
  });
});
