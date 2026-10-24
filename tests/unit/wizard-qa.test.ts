import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ActionTimeoutError,
  redirectHrefFromError,
  withActionTimeout,
} from '@/lib/action-timeout';
import { isCheckoutTestMode } from '@/lib/checkout-test-mode';
import { fillDueMessage, formatDueLabel, formatLongDate } from '@/lib/due-label';
import { memberTitleLabel } from '@/lib/member-title';
import { parseOptionalPhone } from '@/lib/phone';
import { RA_AUTORENEW_CHECKED_BY_DEFAULT, RA_RENEWAL_PRICE_CENTS } from '@/lib/pricing';
import { serviceTierDisplayName } from '@/lib/tier-display';

const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as {
  wizard: Record<string, string>;
  filingDetail: Record<string, string>;
  start: Record<string, string>;
};
const es = JSON.parse(readFileSync('messages/es.json', 'utf8')) as {
  wizard: Record<string, string>;
  filingDetail: Record<string, string>;
  start: Record<string, string>;
};

describe('wizard action timeout', () => {
  it('rejects when the action never settles', async () => {
    await expect(
      withActionTimeout(new Promise(() => {}), 15),
    ).rejects.toBeInstanceOf(ActionTimeoutError);
  });

  it('reads a same-origin path from a Next redirect digest', () => {
    const err = { digest: 'NEXT_REDIRECT;replace;/wizard/abc/3;307;' };
    expect(redirectHrefFromError(err)).toBe('/wizard/abc/3');
  });
});

describe('optional contact phone', () => {
  it('accepts a blank value and common formatting', () => {
    expect(parseOptionalPhone('')).toEqual({ ok: true, value: null });
    expect(parseOptionalPhone('  (305) 555-0199 ')).toEqual({
      ok: true,
      value: '(305) 555-0199',
    });
    expect(parseOptionalPhone('+1 305 555 0199').ok).toBe(true);
  });

  it('rejects too few digits and unexpected characters', () => {
    expect(parseOptionalPhone('123').ok).toBe(false);
    expect(parseOptionalPhone('call me').ok).toBe(false);
  });
});

describe('due labels', () => {
  const may = new Date(2028, 4, 1);

  it('formats May 1, 2028 with a normal space and no backslash', () => {
    expect(formatLongDate(may)).toBe('May 1, 2028');
    expect(formatDueLabel('Due', may)).toBe('Due May 1, 2028');
    expect(formatDueLabel('Due', may)).not.toContain('\\');
    expect(fillDueMessage('Due {when}', may)).toBe('Due May 1, 2028');
  });

  it('keeps the date placeholder out of both locales', () => {
    for (const messages of [en, es]) {
      expect(messages.filingDetail.dueDateOn).toContain('{when}');
      expect(messages.filingDetail.dueDateOn).not.toContain('{date}');
      expect(messages.filingDetail.dueDateOn).not.toContain('\\');
      expect(fillDueMessage(messages.filingDetail.dueDateOn, may)).not.toContain('\\');
    }
  });
});

describe('checkout test mode', () => {
  it('is on outside production or when the publishable key is a test key', () => {
    expect(isCheckoutTestMode({ vercelEnv: 'preview', publishableKey: 'pk_live_x' })).toBe(true);
    expect(isCheckoutTestMode({ vercelEnv: undefined, publishableKey: 'pk_live_x' })).toBe(true);
    expect(isCheckoutTestMode({ vercelEnv: 'production', publishableKey: 'pk_test_x' })).toBe(true);
    expect(isCheckoutTestMode({ vercelEnv: 'production', publishableKey: 'pk_live_x' })).toBe(false);
  });
});

describe('review labels', () => {
  it('prints the Essential display name instead of the BASIC slug', () => {
    expect(serviceTierDisplayName('BASIC')).toBe('Essential');
    expect(serviceTierDisplayName('BASIC', (key) => (key === 'tier_BASIC' ? 'Esencial' : key))).toBe(
      'Esencial',
    );
  });

  it('keeps the member title separate from the name', () => {
    const label = memberTitleLabel('AMBR', (key) =>
      key === 'titleAuthorizedMember' ? 'Authorized Member' : key,
    );
    expect(label).toBe('Authorized Member');
    expect(`${label}Qa Tester`).not.toBe('AMBRQa Tester');
    expect(label.startsWith('AMBR')).toBe(false);
  });
});

describe('registered agent renewal copy', () => {
  it('stays $150 and starts unchecked', () => {
    expect(RA_RENEWAL_PRICE_CENTS).toBe(15_000);
    expect(RA_AUTORENEW_CHECKED_BY_DEFAULT).toBe(false);
  });

  it('shows the price, the renewal date, and that it can be cancelled', () => {
    for (const messages of [en, es]) {
      const text = messages.wizard.raAutoRenewMandate;
      expect(text).toContain('{price}');
      expect(text).toContain('{renewalDate}');
      expect(text).not.toContain('{date}');
      expect(text.toLowerCase()).toMatch(/cancel/);
      expect(messages.wizard.testModeBadge.length).toBeGreaterThan(0);
      expect(messages.wizard.phoneInvalid.length).toBeGreaterThan(0);
      expect(messages.wizard.packageNotChosen.length).toBeGreaterThan(0);
    }
    expect(en.wizard.testModeBadge).toBe('Test mode — no real charge');
    expect(es.wizard.testModeBadge).toBe('Modo de prueba — sin cargo real');
  });
});

describe('contact phone migration', () => {
  it('adds the column idempotently', () => {
    const sql = readFileSync(
      'prisma/migrations/20261023233000_add_contact_phone/migration.sql',
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "contactPhone"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "phone"');
  });
});

describe('start form strings', () => {
  it('has a field-required message in both locales', () => {
    expect(en.start.fieldRequired.length).toBeGreaterThan(0);
    expect(es.start.fieldRequired.length).toBeGreaterThan(0);
    expect(en.start.errorTimeout.length).toBeGreaterThan(0);
    expect(es.start.errorTimeout.length).toBeGreaterThan(0);
  });
});
