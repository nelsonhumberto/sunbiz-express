import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Feature flag `oa_template_download`.
 * Server env OA_TEMPLATE_DOWNLOAD_ENABLED. Unset, empty, and any value
 * other than true/1/yes/on stay off. Default is off.
 */
export function oaTemplateDownloadEnabled(): boolean {
  const raw = process.env['OA_TEMPLATE_DOWNLOAD_ENABLED'];
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export const OA_TEMPLATE_SOURCE = 'oa-template';
/**
 * Unguessable folder under public/oa. The samples are static files.
 * Do not print this value in robots.txt; disallow /oa/ and send noindex.
 */
export const OA_PUBLIC_DIR = '00b55f865c09bd021c4d3248a27f39ef';
/** Confirm link lifetime. */
export const OA_CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;
/** How long the confirmed download page remembers the lead. The files themselves stay put. */
export const OA_DOWNLOAD_COOKIE = 'oa_dl';
export const OA_DOWNLOAD_COOKIE_TTL_SECONDS = 7 * 24 * 60 * 60;
/** 32 random bytes in base64url: 43 chars, no padding. */
export const OA_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LEAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OaTemplateLocale = 'en' | 'es';
export type OaTemplateVariant = 'single' | 'multi';
export type OaTemplateFormat = 'pdf' | 'docx';

export interface OaTemplateAsset {
  locale: OaTemplateLocale;
  variant: OaTemplateVariant;
  format: OaTemplateFormat;
  /** File name inside public/oa/<OA_PUBLIC_DIR>/. */
  filename: string;
  label: string;
}

/** Built samples committed under public/oa/<OA_PUBLIC_DIR>/. */
export const OA_TEMPLATE_ASSETS: OaTemplateAsset[] = [
  {
    locale: 'en',
    variant: 'single',
    format: 'pdf',
    filename: 'launchforma-florida-llc-operating-agreement-sample-single-member.pdf',
    label: 'Single-member PDF',
  },
  {
    locale: 'en',
    variant: 'single',
    format: 'docx',
    filename: 'launchforma-florida-llc-operating-agreement-sample-single-member.docx',
    label: 'Single-member Word',
  },
  {
    locale: 'en',
    variant: 'multi',
    format: 'pdf',
    filename: 'launchforma-florida-llc-operating-agreement-sample-multi-member.pdf',
    label: 'Multi-member PDF',
  },
  {
    locale: 'en',
    variant: 'multi',
    format: 'docx',
    filename: 'launchforma-florida-llc-operating-agreement-sample-multi-member.docx',
    label: 'Multi-member Word',
  },
  {
    locale: 'es',
    variant: 'single',
    format: 'pdf',
    filename: 'launchforma-acuerdo-operativo-llc-florida-muestra-un-miembro.pdf',
    label: 'PDF de un miembro',
  },
  {
    locale: 'es',
    variant: 'single',
    format: 'docx',
    filename: 'launchforma-acuerdo-operativo-llc-florida-muestra-un-miembro.docx',
    label: 'Word de un miembro',
  },
  {
    locale: 'es',
    variant: 'multi',
    format: 'pdf',
    filename: 'launchforma-acuerdo-operativo-llc-florida-muestra-varios-miembros.pdf',
    label: 'PDF de varios miembros',
  },
  {
    locale: 'es',
    variant: 'multi',
    format: 'docx',
    filename: 'launchforma-acuerdo-operativo-llc-florida-muestra-varios-miembros.docx',
    label: 'Word de varios miembros',
  },
];

export const OA_SAMPLE_HEADER: Record<OaTemplateLocale, string> = {
  en: 'SAMPLE for general information only, not legal advice; have an attorney review before use.',
  es: 'MUESTRA solo con fines de información general, no es asesoría legal; pide a un abogado que la revise antes de usarla.',
};

export const OA_COMING_SOON: Record<OaTemplateLocale, string> = {
  en: 'Free sample template coming soon.',
  es: 'Plantilla de muestra gratis muy pronto.',
};

export function oaTemplateAssets(locale: OaTemplateLocale): OaTemplateAsset[] {
  return OA_TEMPLATE_ASSETS.filter((item) => item.locale === locale);
}

export interface OaDownloadLink {
  filename: string;
  label: string;
  url: string;
  format: OaTemplateFormat;
  variant: OaTemplateVariant;
}

/** Public path of one sample. No storage client and no signed URL. */
export function oaAssetPath(filename: string): string {
  return `/oa/${OA_PUBLIC_DIR}/${filename}`;
}

/** Four links for the locale: single and multi member, PDF and Word. */
export function oaTemplateLinks(locale: OaTemplateLocale): OaDownloadLink[] {
  return oaTemplateAssets(locale).map((asset) => ({
    filename: asset.filename,
    label: asset.label,
    format: asset.format,
    variant: asset.variant,
    url: `${siteUrl()}${oaAssetPath(asset.filename)}`,
  }));
}

export function oaTemplateLocale(value: unknown): OaTemplateLocale {
  return value === 'es' ? 'es' : 'en';
}

export function mintOaToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOaToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** One-way hash of the client IP. The raw address is not stored. */
export function hashOaClientIp(ip: string): string {
  return createHash('sha256').update(`oa-template|${ip}`).digest('hex');
}

export function oaConfirmExpiry(fromMs = Date.now()): Date {
  return new Date(fromMs + OA_CONFIRM_TTL_MS);
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com').replace(/\/$/, '');
}

export function oaConfirmUrl(token: string): string {
  return `${siteUrl()}/api/leads/confirm?token=${encodeURIComponent(token)}`;
}

export function oaDownloadPagePath(locale: OaTemplateLocale): string {
  const path = '/guides/florida-llc-operating-agreement/download';
  return locale === 'es' ? `/es${path}` : path;
}

export function oaDownloadPageUrl(locale: OaTemplateLocale): string {
  return `${siteUrl()}${oaDownloadPagePath(locale)}`;
}

function oaLinkSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required to sign operating agreement links');
  }
  return 'dev-oa-link-secret';
}

function signPayload(payload: string): string {
  return createHmac('sha256', oaLinkSecret()).update(payload).digest('base64url');
}

function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Durable unsubscribe link. Survives clearing the confirm token. */
export function oaUnsubscribeUrl(leadId: string): string {
  const sig = signPayload(`oa-unsub:${leadId}`);
  return `${siteUrl()}/api/leads/unsubscribe?id=${encodeURIComponent(leadId)}&sig=${encodeURIComponent(sig)}`;
}

export function oaUnsubscribeSignatureValid(leadId: string, sig: string): boolean {
  if (!LEAD_ID_PATTERN.test(leadId) || !sig) return false;
  return signaturesMatch(signPayload(`oa-unsub:${leadId}`), sig);
}

export function sealOaDownloadSession(leadId: string, locale: OaTemplateLocale, nowMs = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ id: leadId, locale, exp: nowMs + OA_DOWNLOAD_COOKIE_TTL_SECONDS * 1000 }),
  ).toString('base64url');
  return `${payload}.${signPayload(`oa-dl:${payload}`)}`;
}

export function openOaDownloadSession(
  value: string | undefined | null,
  nowMs = Date.now(),
): { id: string; locale: OaTemplateLocale } | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!signaturesMatch(signPayload(`oa-dl:${payload}`), sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      id?: unknown;
      locale?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.id !== 'string' || !LEAD_ID_PATTERN.test(parsed.id)) return null;
    if (parsed.locale !== 'en' && parsed.locale !== 'es') return null;
    if (typeof parsed.exp !== 'number' || parsed.exp <= nowMs) return null;
    return { id: parsed.id, locale: parsed.locale };
  } catch {
    return null;
  }
}

