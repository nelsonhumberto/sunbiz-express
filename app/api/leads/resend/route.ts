import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resendOaTemplateFromToken } from '@/lib/oa-template-lead';
import { hashOaClientIp, hashOaToken, oaTemplateDownloadEnabled } from '@/lib/oa-template';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' };
const Input = z.object({ token: z.string().max(80) });

export async function POST(request: Request) {
  if (!oaTemplateDownloadEnabled()) {
    return new NextResponse(null, { status: 404, headers: NOINDEX });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: NOINDEX });
  }
  const parsed = Input.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400, headers: NOINDEX });

  const ipHash = hashOaClientIp(clientIp());
  const tokenHash = hashOaToken(parsed.data.token);
  const ipLimited = rateLimit(`oa-template-resend:ip:${ipHash}`, 5, 10 * 60 * 1000);
  const tokenLimited = rateLimit(`oa-template-resend:token:${tokenHash}`, 3, 10 * 60 * 1000);
  if (!ipLimited.ok || !tokenLimited.ok) {
    return NextResponse.json({ ok: false }, { status: 429, headers: NOINDEX });
  }

  try {
    const sent = await resendOaTemplateFromToken(parsed.data.token);
    if (!sent) return NextResponse.json({ ok: false }, { status: 400, headers: NOINDEX });
  } catch (err) {
    logger.error('oa template resend failed', { area: 'marketing', tag: 'oa-template-resend' }, err);
    return NextResponse.json({ ok: false }, { status: 502, headers: NOINDEX });
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: NOINDEX });
}
