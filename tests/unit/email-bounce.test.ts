import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { isDeliverableEmail, isQaOrE2eRecipient, normalizeEmail } from '@/lib/email-address';
import { shouldSkipDraftRecovery } from '@/lib/draft-recovery';
import { parseEmailBounce, shouldSuppressBounce } from '@/lib/resend-bounce';
import { verifySvixSignature } from '@/lib/svix';

const SECRET_BYTES = Buffer.from('launchforma-resend-secret');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function sign(payload: string, id: string, timestamp: string): string {
  const digest = crypto
    .createHmac('sha256', SECRET_BYTES)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${digest}`;
}

describe('recipient validation', () => {
  it('accepts a normal mailbox and rejects junk', () => {
    expect(isDeliverableEmail('Laura@LaunchForma.com')).toBe(true);
    expect(normalizeEmail('  Laura@LaunchForma.com ')).toBe('laura@launchforma.com');
    expect(isDeliverableEmail('not-an-email')).toBe(false);
    expect(isDeliverableEmail('a@b')).toBe(false);
    expect(isDeliverableEmail('bad yuki.t@example.com')).toBe(false);
    expect(isDeliverableEmail('')).toBe(false);
    expect(isDeliverableEmail('user@bar.invalid')).toBe(false);
    expect(isDeliverableEmail('guest.abc@guest.launchforma.invalid')).toBe(false);
    expect(isDeliverableEmail('qa+buyer@example.com')).toBe(true);
  });
});

describe('qa and e2e recipient prefixes', () => {
  it('matches qa+ and e2e+ at the start of the local part, in any case', () => {
    expect(isQaOrE2eRecipient('qa+buyer@example.com')).toBe(true);
    expect(isQaOrE2eRecipient('QA+Buyer@Example.com')).toBe(true);
    expect(isQaOrE2eRecipient('  e2e+cart@example.com ')).toBe(true);
    expect(isQaOrE2eRecipient('E2E+Cart@Example.COM')).toBe(true);
    expect(isQaOrE2eRecipient('qa+@example.com')).toBe(true);
  });

  it('leaves ordinary addresses and other plus-addresses alone', () => {
    expect(isQaOrE2eRecipient('buyer@example.com')).toBe(false);
    expect(isQaOrE2eRecipient('qa.buyer@example.com')).toBe(false);
    expect(isQaOrE2eRecipient('notqa+buyer@example.com')).toBe(false);
    expect(isQaOrE2eRecipient('user+e2e+@example.com')).toBe(false);
    expect(isQaOrE2eRecipient('e2e@example.com')).toBe(false);
    expect(isQaOrE2eRecipient('buyer@qa+example.com')).toBe(false);
  });
});

describe('draft recovery skips', () => {
  const customer = {
    isTest: false,
    adminArchivedAt: null,
    userArchivedAt: null,
    user: { role: 'USER', email: 'buyer@example.com' },
  };

  it('mails a normal customer draft', () => {
    expect(shouldSkipDraftRecovery(customer)).toBe(false);
  });

  it('skips admins, launchforma addresses, and test or archived drafts', () => {
    expect(shouldSkipDraftRecovery({ ...customer, user: { role: 'ADMIN', email: 'buyer@example.com' } })).toBe(
      true,
    );
    expect(
      shouldSkipDraftRecovery({ ...customer, user: { role: 'USER', email: 'Laura@LaunchForma.com' } }),
    ).toBe(true);
    expect(shouldSkipDraftRecovery({ ...customer, isTest: true })).toBe(true);
    expect(shouldSkipDraftRecovery({ ...customer, adminArchivedAt: new Date() })).toBe(true);
    expect(shouldSkipDraftRecovery({ ...customer, userArchivedAt: new Date() })).toBe(true);
    expect(
      shouldSkipDraftRecovery({ ...customer, user: { role: 'USER', email: 'qa+draft@gmail.com' } }),
    ).toBe(true);
    expect(
      shouldSkipDraftRecovery({ ...customer, user: { role: 'USER', email: 'e2e+signup@example.com' } }),
    ).toBe(true);
  });
});

describe('Resend bounce webhook', () => {
  const now = 1_700_000_000;

  it('verifies a Svix signature and rejects a bad one', () => {
    const payload = JSON.stringify({ type: 'email.bounced' });
    const id = 'msg_1';
    const timestamp = String(now);
    expect(
      verifySvixSignature({
        payload,
        id,
        timestamp,
        signature: sign(payload, id, timestamp),
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(true);
    expect(
      verifySvixSignature({
        payload,
        id,
        timestamp,
        signature: 'v1,aaaa',
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      verifySvixSignature({
        payload,
        id,
        timestamp: String(now - 3600),
        signature: sign(payload, id, String(now - 3600)),
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it('parses permanent bounces onto the suppression list and ignores other events', () => {
    expect(shouldSuppressBounce('Permanent')).toBe(true);
    expect(shouldSuppressBounce('Transient')).toBe(false);
    expect(
      parseEmailBounce({
        type: 'email.bounced',
        data: {
          to: ['Laura@LaunchForma.com'],
          bounce: { type: 'Permanent', message: 'User unknown' },
        },
      }),
    ).toEqual({
      emails: ['laura@launchforma.com'],
      suppress: true,
      detail: 'User unknown',
    });
    expect(parseEmailBounce({ type: 'email.delivered', data: { to: ['a@b.co'] } })).toBeNull();
  });
});
