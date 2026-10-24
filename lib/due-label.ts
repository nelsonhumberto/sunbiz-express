const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * "May 1, 2028" built from calendar parts. Avoids ICU date placeholders
 * named `{date}`, which next-intl can escape as "May \\ 1, 2028".
 */
export function formatLongDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '-';
  const month = MONTHS[d.getMonth()];
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Due May 1, 2028" with a single normal space and no stray backslash. */
export function formatDueLabel(dueWord: string, date: Date | string | null | undefined): string {
  const word = dueWord.replace(/\\/g, '').trim();
  const formatted = formatLongDate(date);
  if (formatted === '-') return word || '-';
  return `${word} ${formatted}`.replace(/\\/g, '');
}

/**
 * Fill a message like "Due {when}" / "Vence {when}". The value is inserted
 * as text. A placeholder named `{date}` is intentionally not used.
 */
export function fillDueMessage(
  template: string,
  date: Date | string | null | undefined,
): string {
  return template.replaceAll('{when}', formatLongDate(date)).replace(/\\/g, '');
}
