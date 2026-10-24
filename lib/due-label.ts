/**
 * Locale for a long calendar date. Bare `es` uses es-US so the result is
 * "24 de octubre de 2027". Bare `en` stays "October 24, 2027".
 */
export function longDateLocale(locale: string | null | undefined): string {
  const value = (locale ?? '').trim();
  if (!value || value === 'en') return 'en-US';
  if (value === 'es') return 'es-US';
  return value;
}

/**
 * Long date in the active locale. Built with Intl so Spanish is
 * "24 de octubre de 2027", not an English month name inside Spanish copy.
 */
export function formatLongDate(
  date: Date | string | null | undefined,
  locale: string = 'en-US',
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat(longDateLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
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
