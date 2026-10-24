import { NextResponse } from 'next/server';
import { confirmOaTemplateLead } from '@/lib/oa-template-lead';
import {
  OA_DOWNLOAD_COOKIE,
  OA_DOWNLOAD_COOKIE_TTL_SECONDS,
  oaDownloadPagePath,
  oaTemplateDownloadEnabled,
  sealOaDownloadSession,
} from '@/lib/oa-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' };

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com').replace(/\/$/, '');
}

function redirectTo(path: string, cookie?: { leadId: string; locale: 'en' | 'es' }) {
  const response = NextResponse.redirect(`${siteOrigin()}${path}`, 303);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'private, no-store');
  if (cookie) {
    response.cookies.set(OA_DOWNLOAD_COOKIE, sealOaDownloadSession(cookie.leadId, cookie.locale), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: OA_DOWNLOAD_COOKIE_TTL_SECONDS,
    });
  }
  return response;
}

export async function GET(request: Request) {
  if (!oaTemplateDownloadEnabled()) {
    return new NextResponse(null, { status: 404, headers: NOINDEX });
  }
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const result = await confirmOaTemplateLead(token);
  if (result.status === 'confirmed') {
    const path = `${oaDownloadPagePath(result.locale)}?confirmed=1`;
    return redirectTo(path, { leadId: result.leadId, locale: result.locale });
  }
  const locale = result.status === 'expired' ? result.locale : 'en';
  const expired = new URLSearchParams({ expired: '1' });
  if (result.status === 'expired' && token) expired.set('token', token);
  return redirectTo(`${oaDownloadPagePath(locale)}?${expired.toString()}`);
}
