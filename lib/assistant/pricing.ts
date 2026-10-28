/**
 * DeepSeek list prices for the assistant spend cap.
 *
 * Source: DeepSeek API docs, model prices per 1M tokens.
 * deepseek-v4-pro: cache hit 0.022 / 0.044, cache miss 0.66 / 1.32,
 * output 1.98 / 3.96 (off-peak / peak). deepseek-flash is the cheaper row.
 * Unknown model ids use the pro row so the cap does not undercount.
 *
 * Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday through Friday.
 * Weekends are off-peak all day. DeepSeek also treats Chinese public
 * holidays as off-peak all day. Those dates change by official notice, so
 * this table does not hardcode them. A holiday that falls inside the UTC
 * windows is priced as peak, which overestimates and keeps the cap safe.
 *
 * Output tokens are the full completion, including reasoning. Cache-hit
 * input is priced apart from cache-miss input. Amounts are micro-USD
 * (millionths of a dollar) and rounded up.
 */

const MILLION = 1_000_000n;

type PriceRow = {
  cacheHit: bigint;
  cacheMiss: bigint;
  output: bigint;
};

const PRO_OFF_PEAK: PriceRow = { cacheHit: 22_000n, cacheMiss: 660_000n, output: 1_980_000n };
const PRO_PEAK: PriceRow = { cacheHit: 44_000n, cacheMiss: 1_320_000n, output: 3_960_000n };
const FLASH_OFF_PEAK: PriceRow = { cacheHit: 3_000n, cacheMiss: 150_000n, output: 600_000n };
const FLASH_PEAK: PriceRow = { cacheHit: 6_000n, cacheMiss: 300_000n, output: 1_200_000n };

export type AssistantUsageCounts = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputTokenDetails?: {
    noCacheTokens?: number | null;
    cacheReadTokens?: number | null;
  } | null;
};

export function isDeepSeekPeakUtc(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  const morning = minutes >= 60 && minutes < 240;
  const evening = minutes >= 360 && minutes < 600;
  return morning || evening;
}

function priceRow(modelId: string, peak: boolean): PriceRow {
  const flash = modelId.toLowerCase().includes('flash');
  if (flash) return peak ? FLASH_PEAK : FLASH_OFF_PEAK;
  return peak ? PRO_PEAK : PRO_OFF_PEAK;
}

function wholeTokens(value: number | null | undefined): bigint {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0n;
  return BigInt(Math.floor(value));
}

function tokensToMicro(tokens: bigint, microPerMillion: bigint): bigint {
  if (tokens <= 0n) return 0n;
  return (tokens * microPerMillion + MILLION - 1n) / MILLION;
}

export function assistantUsageCostMicroUsd(
  usage: AssistantUsageCounts | undefined,
  opts: { modelId: string; at: Date },
): { costMicroUsd: bigint; peak: boolean } {
  const peak = isDeepSeekPeakUtc(opts.at);
  const prices = priceRow(opts.modelId, peak);
  const cacheRead = wholeTokens(usage?.inputTokenDetails?.cacheReadTokens);
  const noCache = usage?.inputTokenDetails?.noCacheTokens;
  const cacheMiss =
    noCache == null
      ? wholeTokens(usage?.inputTokens) > cacheRead
        ? wholeTokens(usage?.inputTokens) - cacheRead
        : 0n
      : wholeTokens(noCache);
  const output = wholeTokens(usage?.outputTokens);
  const costMicroUsd =
    tokensToMicro(cacheRead, prices.cacheHit) +
    tokensToMicro(cacheMiss, prices.cacheMiss) +
    tokensToMicro(output, prices.output);
  return { costMicroUsd, peak };
}
