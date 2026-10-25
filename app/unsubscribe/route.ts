import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email-address';
import { readUnsubscribeToken } from '@/lib/unsubscribe';

export const dynamic = 'force-dynamic';

/**
 * Marketing unsubscribe. GET is the link in the email. POST is the
 * List-Unsubscribe one-click action and the confirm form. Both record the
 * same opt-out and are safe to repeat.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const email = readUnsubscribeToken(token);
  if (!email) return htmlResponse(page({ ok: false }), 400);
  await recordOptOut(email);
  return htmlResponse(page({ ok: true, email }), 200);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get('token') ?? '';
  if (!token) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    token = params.get('token') ?? '';
  }
  const email = readUnsubscribeToken(token);
  if (!email) return new NextResponse('Invalid link', { status: 400 });
  await recordOptOut(email);
  return new NextResponse('Unsubscribed', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function recordOptOut(email: string) {
  const normalized = normalizeEmail(email);
  await prisma.marketingOptOut.upsert({
    where: { email: normalized },
    create: { email: normalized, source: 'unsubscribe' },
    update: { source: 'unsubscribe' },
  });
}

function htmlResponse(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function page(args: { ok: boolean; email?: string }): string {
  const title = args.ok ? 'Unsubscribed' : 'Link not valid';
  const spanish = args.ok
    ? 'Listo. Ya no recibirás estos correos de LaunchForma.'
    : 'Este enlace no es válido. Si quieres darte de baja, usa el enlace del correo más reciente.';
  const english = args.ok
    ? 'You are unsubscribed. You will not get these LaunchForma emails.'
    : 'This link is not valid. To unsubscribe, use the link in the latest email.';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} · LaunchForma</title>
  <style>
    body{margin:0;background:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1F2B}
    main{max-width:32rem;margin:0 auto;padding:48px 20px}
    .card{background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 8px 24px rgba(16,24,40,.06)}
    h1{font-size:1.5rem;line-height:1.3;margin:0 0 12px}
    p{font-size:1rem;line-height:1.6;color:#475467;margin:0 0 12px}
    a{color:#1565FF}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>${title}</h1>
      <p>${spanish}</p>
      <p>${english}</p>
      <p><a href="https://launchforma.com">launchforma.com</a></p>
    </div>
  </main>
</body>
</html>`;
}
