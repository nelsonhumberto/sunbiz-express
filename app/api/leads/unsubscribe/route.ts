import { NextResponse } from 'next/server';
import { peekOaUnsubscribeLead, unsubscribeOaTemplateLead } from '@/lib/oa-template-lead';
import { oaTemplateDownloadEnabled, type OaTemplateLocale } from '@/lib/oa-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function page(lang: 'en' | 'es', title: string, body: string) {
  const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <meta name="robots" content="noindex,nofollow"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#1A1F2B">
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { ...NOINDEX, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function invalidPage() {
  return page('en', 'Unsubscribe', '<p>This link is invalid.</p>');
}

function confirmPage(id: string, sig: string, locale: OaTemplateLocale) {
  const action = `/api/leads/unsubscribe?id=${encodeURIComponent(id)}&amp;sig=${encodeURIComponent(sig)}`;
  const hidden = `<input type="hidden" name="id" value="${escapeHtml(id)}"/><input type="hidden" name="sig" value="${escapeHtml(sig)}"/>`;
  if (locale === 'es') {
    return page(
      'es',
      'Darme de baja',
      `<p>Esto detiene los correos ocasionales de LaunchForma por esta solicitud.</p>
      <form method="post" action="${action}">${hidden}
        <button type="submit" style="background:#1565FF;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer">Darme de baja</button>
      </form>`,
    );
  }
  return page(
    'en',
    'Unsubscribe',
    `<p>This stops occasional LaunchForma emails for this request.</p>
    <form method="post" action="${action}">${hidden}
      <button type="submit" style="background:#1565FF;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer">Unsubscribe</button>
    </form>`,
  );
}

function donePage(locale: OaTemplateLocale) {
  if (locale === 'es') {
    return page(
      'es',
      'Listo',
      '<p>No te enviaremos más correos ocasionales de LaunchForma a esta dirección por esta solicitud.</p>',
    );
  }
  return page(
    'en',
    'Unsubscribed',
    '<p>We will not send further occasional LaunchForma emails to this address for this request.</p>',
  );
}

function disabled() {
  return new NextResponse(null, { status: 404, headers: NOINDEX });
}

async function idsFrom(request: Request): Promise<{ id: string; sig: string }> {
  const url = new URL(request.url);
  let id = url.searchParams.get('id') ?? '';
  let sig = url.searchParams.get('sig') ?? '';
  if (id && sig) return { id, sig };
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    try {
      const form = await request.formData();
      id = id || String(form.get('id') ?? '');
      sig = sig || String(form.get('sig') ?? '');
    } catch {
      // One-click clients may post a body this route does not need.
    }
  }
  return { id, sig };
}

/** Link scanners follow GET. Show a button. Do not opt the lead out here. */
export async function GET(request: Request) {
  if (!oaTemplateDownloadEnabled()) return disabled();
  const { id, sig } = await idsFrom(request);
  const lead = await peekOaUnsubscribeLead(id, sig);
  if (!lead) return invalidPage();
  return confirmPage(id, sig, lead.locale);
}

/**
 * Confirm-button POST and the List-Unsubscribe-Post one-click both land here.
 * The signed id stays in the query string, which is what mail clients POST to.
 */
export async function POST(request: Request) {
  if (!oaTemplateDownloadEnabled()) return disabled();
  const { id, sig } = await idsFrom(request);
  const lead = await unsubscribeOaTemplateLead(id, sig);
  if (!lead) return invalidPage();
  return donePage(lead.locale);
}
