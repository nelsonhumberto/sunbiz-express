/**
 * Loose phone check for the optional wizard contact number.
 * Empty is valid. Otherwise allow common formatting and require 7–15 digits
 * so international numbers pass without a strict country pattern.
 */
export function parseOptionalPhone(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 40) return { ok: false };
  if (!/^[0-9+().\-\s]+$/.test(trimmed)) return { ok: false };
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return { ok: false };
  return { ok: true, value: trimmed };
}
