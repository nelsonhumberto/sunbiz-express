import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { send, resendCalls, Resend } = vi.hoisted(() => {
  const send = vi.fn();
  const resendCalls: unknown[][] = [];
  class Resend {
    emails = { send };
    constructor(...args: unknown[]) {
      resendCalls.push(args);
    }
  }
  return { send, resendCalls, Resend };
});
const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({ Resend }));

vi.mock('@/lib/db', () => ({
  prisma: {
    emailNotification: { create, update },
    emailSuppression: { findUnique },
  },
}));

import { deliverEmailDirect, sendEmail, type NotificationType } from '@/lib/email';

const ENV_KEYS = ['RESEND_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ data: { id: 're_1' }, error: null });
  resendCalls.length = 0;
  create.mockReset();
  update.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue(null);
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ntf_1',
    ...data,
  }));
  update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      ...data,
    }),
  );
  process.env.RESEND_API_KEY = 're_test_key';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('test-address suppression', () => {
  it('skips qa+ and e2e+ on transactional, drip, and abandoned-cart sends', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cases: Array<{ type: NotificationType; to: string; logged: string }> = [
      { type: 'PAYMENT_CONFIRMATION', to: 'QA+buyer@example.com', logged: 'qa+buyer@example.com' },
      { type: 'RA_RENEWAL_30', to: 'e2e+renew@example.com', logged: 'e2e+renew@example.com' },
      { type: 'ABANDONED_7D', to: 'E2E+draft@example.com', logged: 'e2e+draft@example.com' },
    ];

    for (const args of cases) {
      send.mockClear();
      resendCalls.length = 0;
      log.mockClear();
      const result = await sendEmail({ type: args.type, to: args.to, filingId: 'fil_1' });
      expect(result.status).toBe('SKIPPED_TEST');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SKIPPED_TEST' }),
        }),
      );
      expect(update.mock.calls.at(-1)?.[0].data.sentAt).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
      expect(resendCalls).toEqual([]);
      expect(log).toHaveBeenCalledWith(`[email] skipped test recipient: ${args.logged}`);
    }

    log.mockRestore();
  });

  it('returns success for a test recipient when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await sendEmail({ type: 'WELCOME', to: 'qa+signup@example.com' });
    expect(result.status).toBe('SKIPPED_TEST');
    expect(send).not.toHaveBeenCalled();
    expect(resendCalls).toEqual([]);
    expect(log).toHaveBeenCalledWith('[email] skipped test recipient: qa+signup@example.com');
    log.mockRestore();
  });

  it('still delivers a normal recipient through Resend', async () => {
    const result = await sendEmail({ type: 'WELCOME', to: 'buyer@example.com' });
    expect(result.status).toBe('SENT');
    expect(resendCalls).toEqual([['re_test_key']]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'buyer@example.com' }));
  });

  it('skips a test recipient on the direct helper and still sends other local parts', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const skipped = await deliverEmailDirect('qa+direct@example.com', 'Subject', '<p>Hi</p>');
    expect(skipped).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[email] skipped test recipient: qa+direct@example.com');

    await deliverEmailDirect('qa.user@example.com', 'Subject', '<p>Hi</p>');
    await deliverEmailDirect('user+e2e+@example.com', 'Subject', '<p>Hi</p>');
    expect(send).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
