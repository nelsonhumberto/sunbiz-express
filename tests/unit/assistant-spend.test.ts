import { beforeEach, describe, expect, it, vi } from 'vitest';

const deliverEmailDirect = vi.hoisted(() =>
  vi.fn(async (_to: string, _subject: string, _html: string) => ({ ok: true })),
);
const spendDb = vi.hoisted(() => ({
  rows: new Map<string, bigint>(),
  upserts: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/email', () => ({ deliverEmailDirect }));
vi.mock('@/lib/db', () => ({
  prisma: {
    assistantSpendDay: {
      findUnique: async ({ where }: { where: { day: Date } }) => {
        const key = where.day.toISOString().slice(0, 10);
        if (!spendDb.rows.has(key)) return null;
        return { day: where.day, costMicroUsd: spendDb.rows.get(key) };
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(' ');
      if (!sql.includes('AssistantSpendDay')) return [];
      spendDb.upserts += 1;
      const day = values[0] as Date;
      const delta = BigInt(values[1] as bigint);
      const key = day.toISOString().slice(0, 10);
      const next = (spendDb.rows.get(key) ?? 0n) + delta;
      spendDb.rows.set(key, next);
      return [{ costMicroUsd: next }];
    },
  },
}));

import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';
import { assistantUsageCostMicroUsd, isDeepSeekPeakUtc } from '@/lib/assistant/pricing';
import {
  assistantDailyCapMicroUsd,
  assistantDailyRestResponse,
  assistantSpendDayDate,
  recordAssistantUsage,
} from '@/lib/assistant/spend-day';

const MILLION_OUTPUT = {
  inputTokens: 0,
  outputTokens: 1_000_000,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0 },
};

beforeEach(() => {
  spendDb.rows.clear();
  spendDb.upserts = 0;
  deliverEmailDirect.mockClear();
  delete process.env.ASSISTANT_DAILY_CAP_USD;
});

describe('assistant DeepSeek prices', () => {
  const offPeakSunday = new Date('2026-10-25T02:00:00.000Z');
  const peakMonday = new Date('2026-10-26T02:00:00.000Z');

  it('prices pro output at the peak and off-peak rows', () => {
    expect(isDeepSeekPeakUtc(offPeakSunday)).toBe(false);
    expect(isDeepSeekPeakUtc(peakMonday)).toBe(true);
    expect(
      assistantUsageCostMicroUsd(MILLION_OUTPUT, {
        modelId: 'deepseek-v4-pro',
        at: peakMonday,
      }).costMicroUsd,
    ).toBe(3_960_000n);
    expect(
      assistantUsageCostMicroUsd(MILLION_OUTPUT, {
        modelId: 'deepseek-v4-pro',
        at: offPeakSunday,
      }).costMicroUsd,
    ).toBe(1_980_000n);
    expect(isDeepSeekPeakUtc(new Date('2026-10-26T05:00:00.000Z'))).toBe(false);
    expect(isDeepSeekPeakUtc(new Date('2026-10-26T09:00:00.000Z'))).toBe(true);
    expect(isDeepSeekPeakUtc(new Date('2026-10-26T10:00:00.000Z'))).toBe(false);
  });

  it('prices cache hit, cache miss, and flash output apart from pro output', () => {
    const at = offPeakSunday;
    expect(
      assistantUsageCostMicroUsd(
        { inputTokens: 1_000_000, inputTokenDetails: { cacheReadTokens: 1_000_000, noCacheTokens: 0 } },
        { modelId: 'deepseek-v4-pro', at },
      ).costMicroUsd,
    ).toBe(22_000n);
    expect(
      assistantUsageCostMicroUsd(
        { inputTokens: 1_000_000, inputTokenDetails: { cacheReadTokens: 0, noCacheTokens: 1_000_000 } },
        { modelId: 'deepseek-v4-pro', at },
      ).costMicroUsd,
    ).toBe(660_000n);
    expect(
      assistantUsageCostMicroUsd(MILLION_OUTPUT, { modelId: 'deepseek-v4-flash', at }).costMicroUsd,
    ).toBe(600_000n);
  });
});

describe('assistant spend day', () => {
  it('rolls the ledger date at midnight in New York', () => {
    expect(assistantSpendDayDate(new Date('2026-10-26T03:30:00.000Z')).toISOString()).toBe(
      '2026-10-25T00:00:00.000Z',
    );
    expect(assistantSpendDayDate(new Date('2026-10-26T04:30:00.000Z')).toISOString()).toBe(
      '2026-10-26T00:00:00.000Z',
    );
    expect(assistantSpendDayDate(new Date('2026-01-15T04:30:00.000Z')).toISOString()).toBe(
      '2026-01-14T00:00:00.000Z',
    );
    expect(assistantSpendDayDate(new Date('2026-01-15T05:30:00.000Z')).toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    );
  });

  it('treats an unset or invalid cap as no cap and zero as a real cap', () => {
    expect(assistantDailyCapMicroUsd(undefined)).toBeNull();
    expect(assistantDailyCapMicroUsd('')).toBeNull();
    expect(assistantDailyCapMicroUsd('nope')).toBeNull();
    expect(assistantDailyCapMicroUsd('0')).toBe(0n);
    expect(assistantDailyCapMicroUsd('1.25')).toBe(1_250_000n);
  });

  it('blocks before the model once today is already at the cap', async () => {
    process.env.ASSISTANT_DAILY_CAP_USD = '1';
    const now = new Date('2026-10-25T15:00:00.000Z');
    const day = assistantSpendDayDate(now);
    spendDb.rows.set(day.toISOString().slice(0, 10), 1_000_000n);
    const blocked = await assistantDailyRestResponse('en', now);
    expect(blocked).toBeTruthy();
    expect(blocked?.status).toBe(200);
    spendDb.rows.set(day.toISOString().slice(0, 10), 999_999n);
    expect(await assistantDailyRestResponse('en', now)).toBeNull();
  });

  it('increments the same New York day once for the alert, then rolls to the next day', async () => {
    process.env.ASSISTANT_DAILY_CAP_USD = '1';
    const sunday = new Date('2026-10-25T15:00:00.000Z');
    const monday = new Date('2026-10-26T15:00:00.000Z');
    await recordAssistantUsage(MILLION_OUTPUT, { now: sunday, modelId: 'deepseek-v4-pro' });
    await recordAssistantUsage(MILLION_OUTPUT, { now: sunday, modelId: 'deepseek-v4-pro' });
    expect(spendDb.rows.get('2026-10-25')).toBe(3_960_000n);
    expect(deliverEmailDirect).toHaveBeenCalledTimes(1);
    expect(deliverEmailDirect.mock.calls[0]?.[0]).toBe(INQUIRY_NOTIFY_EMAIL);

    await recordAssistantUsage(MILLION_OUTPUT, { now: monday, modelId: 'deepseek-v4-pro' });
    expect(spendDb.rows.get('2026-10-25')).toBe(3_960_000n);
    expect(spendDb.rows.get('2026-10-26')).toBe(1_980_000n);
    expect(deliverEmailDirect).toHaveBeenCalledTimes(2);
  });

  it('still records usage when the cap is unset and skips a zero-cost turn', async () => {
    const sunday = new Date('2026-10-25T15:00:00.000Z');
    await recordAssistantUsage(MILLION_OUTPUT, { now: sunday, modelId: 'deepseek-v4-pro' });
    expect(spendDb.rows.get('2026-10-25')).toBe(1_980_000n);
    expect(deliverEmailDirect).not.toHaveBeenCalled();

    const before = spendDb.upserts;
    await recordAssistantUsage(
      { inputTokens: 0, outputTokens: 0 },
      { now: sunday, modelId: 'deepseek-v4-pro' },
    );
    expect(spendDb.upserts).toBe(before);
  });
});
