/**
 * Public tracking IDs.
 *
 * An unset env var uses the known production ID. An empty string disables
 * the tag so a preview can turn it off without deleting the fallback.
 * Conversion IDs have no fallback — those events stay no-ops until set.
 */

export const LINKEDIN_PARTNER_ID_FALLBACK = '9874554';
export const OPENAI_PIXEL_ID_FALLBACK = 'RGTsQvtsZwqyMxRX2Lr4Zj';

export function publicEnvOrFallback(value: string | undefined, fallback: string): string | null {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** LinkedIn Insight Tag partner ID. Digits only, so it is safe to inline. */
export function linkedInPartnerId(): string | null {
  const id = publicEnvOrFallback(
    process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
    LINKEDIN_PARTNER_ID_FALLBACK,
  );
  if (!id || !/^\d{1,12}$/.test(id)) return null;
  return id;
}

/** OpenAI Ads Measurement Pixel ID. */
export function openAiPixelId(): string | null {
  const id = publicEnvOrFallback(
    process.env.NEXT_PUBLIC_OPENAI_PIXEL_ID,
    OPENAI_PIXEL_ID_FALLBACK,
  );
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  return id;
}
