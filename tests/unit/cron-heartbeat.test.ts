import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRecoveryCronFailure,
  buildRecoveryCronRun,
  sanitizeCronError,
  writeCronRun,
} from '@/lib/cron-heartbeat';

const create = vi.hoisted(() => vi.fn());
const runDrafts = vi.hoisted(() => vi.fn());
const runRa = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
});

vi.mock('@/lib/db', () => ({
  prisma: {
    cronRun: { create },
  },
}));

vi.mock('@/lib/draft-recovery', () => ({
  runScheduledDraftRecovery: (...args: unknown[]) => runDrafts(...args),
  runRaRenewalReminders: (...args: unknown[]) => runRa(...args),
}));

import { GET } from '@/app/api/cron/recovery/route';

const startedAt = new Date('2026-10-25T13:00:00.000Z');

function authorizedRequest() {
  return new Request('https://launchforma.com/api/cron/recovery', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('cron heartbeat row', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('records a disabled drip as skipped and still counts registered-agent sends', () => {
    const row = buildRecoveryCronRun({
      startedAt,
      finishedAt: new Date('2026-10-25T13:00:02.000Z'),
      drafts: { scanned: 0, sent: 0, skipped: 1, failed: 0, disabled: true },
      ra: { scanned: 4, sent: 1 },
    });
    expect(row.job).toBe('recovery');
    expect(row.error).toBe('disabled');
    expect(row.skippedCount).toBeGreaterThanOrEqual(1);
    expect(row.eligibleCount).toBe(4);
    expect(row.sentCount).toBe(1);
    expect(row.failedCount).toBe(0);
    expect(row.finishedAt).toBeInstanceOf(Date);
  });

  it('sums eligible, sent, skipped, and failed counts for a live run', () => {
    const row = buildRecoveryCronRun({
      startedAt,
      finishedAt: startedAt,
      drafts: { scanned: 10, sent: 3, skipped: 6, failed: 1, disabled: false },
      ra: { scanned: 2, sent: 2 },
    });
    expect(row.error).toBeNull();
    expect(row.eligibleCount).toBe(12);
    expect(row.sentCount).toBe(5);
    expect(row.skippedCount).toBe(6);
    expect(row.failedCount).toBe(1);
  });

  it('stores a thrown error without secrets and counts the invocation as failed', () => {
    const secret = 'super-secret-token';
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = secret;
    try {
      const row = buildRecoveryCronFailure({
        startedAt,
        finishedAt: startedAt,
        drafts: { scanned: 2, sent: 1, skipped: 1, failed: 0 },
        error: new Error(`connect failed ${secret} postgresql://user:pw@db/app Bearer ${secret}`),
      });
      const sanitized = sanitizeCronError(
        new Error(`connect failed ${secret} postgresql://user:pw@db/app Bearer ${secret}`),
      );
      expect(sanitized).not.toContain(secret);
      expect(sanitized).not.toContain('user:pw');
      expect(sanitized).toContain('[redacted]');
      expect(row.failedCount).toBe(1);
      expect(row.error).not.toContain(secret);
      expect(row.error).not.toContain('user:pw');
      expect(row.sentCount).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it('still finishes the cron when the heartbeat insert throws', async () => {
    create.mockRejectedValue(new Error('database unavailable'));
    await expect(
      writeCronRun({
        job: 'recovery',
        startedAt,
        finishedAt: startedAt,
        eligibleCount: 0,
        sentCount: 0,
        skippedCount: 1,
        failedCount: 0,
        error: 'disabled',
      }),
    ).resolves.toBeUndefined();
  });

  it('writes one disabled row from the recovery route and returns ok', async () => {
    create.mockResolvedValue({ id: 'run_1' });
    runDrafts.mockResolvedValue({ scanned: 0, sent: 0, skipped: 1, failed: 0, disabled: true });
    runRa.mockResolvedValue({ scanned: 3, sent: 2 });
    const response = await GET(authorizedRequest());
    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.job).toBe('recovery');
    expect(data.error).toBe('disabled');
    expect(data.skippedCount).toBeGreaterThanOrEqual(1);
    expect(data.sentCount).toBe(2);
    expect(data.startedAt).toBeInstanceOf(Date);
    expect(data.finishedAt).toBeInstanceOf(Date);
  });

  it('records a thrown job and still rejects the request', async () => {
    create.mockResolvedValue({ id: 'run_2' });
    process.env.CRON_SECRET = 'test-cron-secret';
    runDrafts.mockRejectedValue(new Error('boom test-cron-secret postgresql://a:b@db/x'));
    runRa.mockResolvedValue({ scanned: 0, sent: 0 });
    await expect(GET(authorizedRequest())).rejects.toThrow(/boom/);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.failedCount).toBeGreaterThanOrEqual(1);
    expect(data.error).not.toContain('test-cron-secret');
    expect(data.error).not.toContain('a:b');
    expect(data.finishedAt).toBeInstanceOf(Date);
  });

  it('returns ok when the heartbeat insert fails', async () => {
    create.mockRejectedValue(new Error('insert failed'));
    runDrafts.mockResolvedValue({ scanned: 1, sent: 1, skipped: 0, failed: 0, disabled: false });
    runRa.mockResolvedValue({ scanned: 0, sent: 0 });
    const response = await GET(authorizedRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it('adds CronRun with row level security and no row deletes', () => {
    const sql = readFileSync('prisma/migrations/20261025140000_cron_run/migration.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE "CronRun"');
    expect(sql).toContain('ALTER TABLE "CronRun" ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('DELETE FROM');
    expect(sql).not.toContain('CREATE POLICY');
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('model CronRun');
    expect(schema).toContain('eligibleCount');
    expect(schema).toContain('error');
  });
});
