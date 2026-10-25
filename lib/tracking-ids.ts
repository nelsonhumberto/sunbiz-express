/**
 * Public tracking IDs.
 *
 * An unset env var uses the known production ID. An empty string disables
 * the tag so a preview can turn it off without deleting the fallback.
 * Conversion IDs have no fallback — those events stay no-ops until set.
 */

export const OPENAI_PIXEL_ID_FALLBACK = 'HLuEiBiKzL32aoTo43Z5BV';

export function publicEnvOrFallback(value: string | undefined, fallback: string): string | null {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** OpenAI Ads Measurement Pixel ID. */
export function openAiPixelId(): string | null {
  const id = publicEnvOrFallback(
    process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID,
    OPENAI_PIXEL_ID_FALLBACK,
  );
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  return id;
}
