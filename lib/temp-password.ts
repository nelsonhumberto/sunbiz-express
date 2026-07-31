import crypto from 'crypto';

/**
 * Short, readable temp password for guest→account conversion and welcome
 * resends. 14 chars across 4 character classes (above OWASP minimums);
 * avoids ambiguous glyphs (0/O/1/l/I).
 */
export function generateReadableTempPassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 10 }, () => pick(all));
  return [...required, ...rest]
    .sort(() => crypto.randomInt(0, 2) - 0.5)
    .join('');
}
