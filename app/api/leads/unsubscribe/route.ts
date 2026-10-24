import { NextResponse } from 'next/server';
import { unsubscribeOaTemplateLead } from '@/lib/oa-template-lead';
import { oaTemplateDownloadEnabled } from '@/lib/oa-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' };

function page(title: string, body: string) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="robots" content="noindex,nofollow"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#1A1F2B">
  <h1>${title}</h1>
  <p>${body}</p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { ...NOINDEX, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: Request) {
  if (!oaTemplateDownloadEnabled()) {
    return new NextResponse(null, { status: 404, headers: NOINDEX });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  const lead = await unsubscribeOaTemplateLead(id, sig);
  if (!lead) {
    return page('Unsubscribe', 'This link is invalid.');
  }
  if (lead.locale === 'es') {
    return page(
      'Listo',
      'No te enviaremos más correos ocasionales de LaunchForma a esta dirección por esta solicitud.',
    );
  }
  return page(
    'Unsubscribed',
    'We will not send further occasional LaunchForma emails to this address for this request.',
  );
}
