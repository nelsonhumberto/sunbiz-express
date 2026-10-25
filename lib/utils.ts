import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number, opts?: { showZero?: boolean; locale?: 'en' | 'es' }) {
  if (cents === 0 && !opts?.showZero) return opts?.locale === 'es' ? 'Gratis' : 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(
  date: Date | string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
  locale: 'en' | 'es' = 'en',
) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale === 'es' ? 'es-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  });
}

export function formatDateLong(
  date: Date | string | null | undefined,
  locale: 'en' | 'es' = 'en',
) {
  return formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' }, locale);
}

export function formatRelative(date: Date | string, locale: 'en' | 'es' = 'en') {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const spanish = locale === 'es';
  if (seconds < 60) return spanish ? 'ahora mismo' : 'just now';
  if (minutes < 60) return spanish ? `hace ${minutes} min` : `${minutes}m ago`;
  if (hours < 24) return spanish ? `hace ${hours} h` : `${hours}h ago`;
  if (days < 7) return spanish ? `hace ${days} d` : `${days}d ago`;
  return d.toLocaleDateString(spanish ? 'es' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Same-origin path for post-sign-in redirects, or null. Browsers strip tabs
 * and newlines from URLs, so "/\t/evil.com" would become "//evil.com"; any
 * whitespace, control character, or backslash is rejected for that reason.
 */
function unsafeRedirectPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return true;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

export function safeRedirectPath(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (unsafeRedirectPath(value)) return null;
  // Reject absolute and protocol-relative URLs hidden behind one or two encodings.
  let decoded = value;
  for (let i = 0; i < 2 && decoded.includes('%'); i++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (next === decoded) break;
    if (unsafeRedirectPath(next)) return null;
    decoded = next;
  }
  return value;
}

export function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function generateTrackingNumber(): string {
  // Mimics Sunbiz tracking format (12 chars)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function generateSunbizFilingNumber(entityType: 'LLC' | 'CORP'): string {
  // LLC: L + 11 chars; Corp: 6-7 digits
  if (entityType === 'LLC') {
    const year = new Date().getFullYear().toString();
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `L${year}${rand}`;
  }
  return String(Math.floor(100_000 + Math.random() * 900_000));
}
