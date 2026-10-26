import 'server-only';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { deliverEmailDirect } from '@/lib/email';
import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';
import { assistantRestResponse } from '@/lib/assistant/limit-reply';
import {
  assistantUsageCostMicroUsd,
  type AssistantUsageCounts,
} from '@/lib/assistant/pricing';
import { ASSISTANT_MODEL_ID } from '@/lib/assistant/provider';

const MICRO_PER_USD = 1_000_000n;

/**
 * Calendar day in America/New_York, stored as a DATE at UTC midnight
 * of that calendar date. The instant is not a UTC day boundary.
 */
export function assistantSpendDayDate(now = new Date()): Date {
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Daily cap in micro-USD, or null when the env is unset or not a USD amount.
 * Unset means there is no cap. Zero is a real cap and blocks the model.
 */
export function assistantDailyCapMicroUsd(
  raw = process.env.ASSISTANT_DAILY_CAP_USD,
): bigint | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    logger.warn('assistant daily cap ignored', { area: 'assistant', tag: 'cap' });
    return null;
  }
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = `${frac}000000`.slice(0, 6);
  return BigInt(whole ?? '0') * MICRO_PER_USD + BigInt(fracPadded);
}

function formatUsd(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / MICRO_PER_USD;
  const frac = (abs % MICRO_PER_USD).toString().padStart(6, '0').replace(/0+$/, '');
  const body = frac ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${body}` : body;
}

async function readSpend(day: Date): Promise<bigint> {
  const row = await prisma.assistantSpendDay.findUnique({
    where: { day },
    select: { costMicroUsd: true },
  });
  return row?.costMicroUsd ?? 0n;
}

async function addSpend(day: Date, delta: bigint): Promise<bigint> {
  const rows = await prisma.$queryRaw<Array<{ costMicroUsd: bigint }>>`
    INSERT INTO "AssistantSpendDay" ("day", "costMicroUsd", "updatedAt")
    VALUES (CAST(${day} AS DATE), ${delta}, CURRENT_TIMESTAMP)
    ON CONFLICT ("day") DO UPDATE
    SET "costMicroUsd" = "AssistantSpendDay"."costMicroUsd" + EXCLUDED."costMicroUsd",
        "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "costMicroUsd"
  `;
  const total = rows[0]?.costMicroUsd;
  if (total == null) throw new Error('assistant spend upsert returned no row');
  return BigInt(total);
}

/**
 * Resting reply when today's recorded spend is already at the cap.
 * Null when the cap is unset or the day is still under it.
 * Does not call the model.
 */
export async function assistantDailyRestResponse(
  locale: string,
  now = new Date(),
): Promise<Response | null> {
  const cap = assistantDailyCapMicroUsd();
  if (cap == null) return null;
  const day = assistantSpendDayDate(now);
  const total = await readSpend(day);
  if (total < cap) return null;
  logger.info('assistant daily cap', {
    area: 'assistant',
    tag: 'cap',
    day: day.toISOString().slice(0, 10),
  });
  return assistantRestResponse(locale);
}

async function alertDailyCap(day: Date, total: bigint, cap: bigint): Promise<void> {
  const label = day.toISOString().slice(0, 10);
  const subject = `Assistant spend cap reached for ${label}`;
  const html = `<p>The assistant spend for ${label} (America/New_York) is $${formatUsd(total)}.</p><p>The daily cap is $${formatUsd(cap)}. Further chats get the resting reply until the next day in New York.</p>`;
  await deliverEmailDirect(INQUIRY_NOTIFY_EMAIL, subject, html);
}

/**
 * Price this turn and add it to today's row. The upsert is one statement,
 * so two finishes cannot lose an increment. The alert email goes out only
 * when this add is the one that crosses the cap.
 */
export async function recordAssistantUsage(
  usage: AssistantUsageCounts | undefined,
  opts?: { now?: Date; modelId?: string },
): Promise<void> {
  const now = opts?.now ?? new Date();
  const modelId = opts?.modelId ?? ASSISTANT_MODEL_ID;
  const { costMicroUsd, peak } = assistantUsageCostMicroUsd(usage, { modelId, at: now });
  logger.info('assistant usage', {
    area: 'assistant',
    tag: 'usage',
    model: modelId,
    peak,
    inputTokens: usage?.inputTokens ?? 0,
    cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    costMicroUsd: costMicroUsd.toString(),
  });
  if (costMicroUsd <= 0n) return;

  const day = assistantSpendDayDate(now);
  const total = await addSpend(day, costMicroUsd);
  const cap = assistantDailyCapMicroUsd();
  if (cap == null) return;
  const previous = total > costMicroUsd ? total - costMicroUsd : 0n;
  if (previous < cap && total >= cap) {
    try {
      await alertDailyCap(day, total, cap);
    } catch (err) {
      logger.error('assistant daily cap alert failed', { area: 'assistant', tag: 'cap' }, err);
    }
  }
}
