import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { OA_CONSENT_EN, OA_CONSENT_ES } from '@/lib/oa-guide-copy';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { submitOaTemplateLead } from '@/lib/oa-template-lead';
import { hashOaClientIp, hashOaToken, oaTemplateDownloadEnabled, oaTemplateLocale } from '@/lib/oa-template';
import { getServerUtmAttribution } from '@/lib/utm-server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;

const Input = z.object({
  email: z.string().trim().max(254),
  locale: z.enum(['en', 'es']),
  consent: z.boolean(),
  website: z.string().optional(),
});

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' };

function json(body: { ok: true } | { ok: false; error: 'invalid-email' | 'consent' | 'generic' }, status: number) {
  return NextResponse.json(body, { status, headers: NOINDEX });
}

export async function POST(request: Request) {
  if (!oaTemplateDownloadEnabled()) {
    return new NextResponse(null, { status: 404, headers: NOINDEX });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid-email' }, 400);
  }

  const parsed = Input.safeParse(payload);
  if (!parsed.success) return json({ ok: false, error: 'invalid-email' }, 400);
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return json({ ok: true }, 200);
  }
  if (!parsed.data.consent) return json({ ok: false, error: 'consent' }, 400);

  const email = normalizeEmail(parsed.data.email);
  if (!isDeliverableEmail(email)) return json({ ok: false, error: 'invalid-email' }, 400);

  const ipHash = hashOaClientIp(clientIp());
  const emailKey = hashOaToken(email);
  const ipLimited = rateLimit(`oa-template:ip:${ipHash}`, LIMIT, WINDOW_MS);
  const emailLimited = rateLimit(`oa-template:email:${emailKey}`, LIMIT, WINDOW_MS);
  if (!ipLimited.ok || !emailLimited.ok) return json({ ok: false, error: 'generic' }, 429);

  const locale = oaTemplateLocale(parsed.data.locale);
  const utm = getServerUtmAttribution();
  const userAgent = headers().get('user-agent')?.slice(0, 400) ?? null;

  try {
    const sent = await submitOaTemplateLead({
      email,
      locale,
      consentText: locale === 'es' ? OA_CONSENT_ES : OA_CONSENT_EN,
      ipHash,
      userAgent,
      utmSource: utm?.utm_source ?? null,
      utmMedium: utm?.utm_medium ?? null,
      utmCampaign: utm?.utm_campaign ?? null,
    });
    if (!sent) return json({ ok: false, error: 'generic' }, 502);
  } catch (err) {
    logger.error('oa template lead failed', { area: 'marketing', tag: 'oa-template' }, err);
    return json({ ok: false, error: 'generic' }, 502);
  }

  return json({ ok: true }, 200);
}
