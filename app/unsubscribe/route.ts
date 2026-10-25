import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email-address';
import { readUnsubscribeToken } from '@/lib/unsubscribe';

export const dynamic = 'force-dynamic';

type PageLocale = 'en' | 'es';

/**
 * Marketing unsubscribe.
 * GET only shows a confirm page. Mail-scanner prefetch must not opt anyone out.
 * POST from that button, and the List-Unsubscribe one-click POST (RFC 8058),
 * record the same opt-out and are safe to repeat.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const locale = pageLocale(request);
  const email = readUnsubscribeToken(token);
  if (!email) return htmlResponse(invalidPage(locale), 400);
  return htmlResponse(confirmPage({ locale, token }), 200);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.text();
  const params = new URLSearchParams(body);
  const oneClick = params.get('List-Unsubscribe') === 'One-Click';
  const token = url.searchParams.get('token') || params.get('token') || '';
  const locale = pageLocale(request);
  const email = readUnsubscribeToken(token);
  if (!email) {
    if (oneClick) {
      return new NextResponse('Invalid link', {
        status: 400,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return htmlResponse(invalidPage(locale), 400);
  }
  await recordOptOut(email);
  if (oneClick) {
    return new NextResponse('Unsubscribed', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return htmlResponse(donePage(locale), 200);
}

async function recordOptOut(email: string) {
  const normalized = normalizeEmail(email);
  await prisma.marketingOptOut.upsert({
    where: { email: normalized },
    create: { email: normalized, source: 'unsubscribe' },
    update: { source: 'unsubscribe' },
  });
}

function pageLocale(request: Request): PageLocale {
  const explicit = new URL(request.url).searchParams.get('locale')?.toLowerCase();
  if (explicit === 'es' || explicit === 'en') return explicit;
  const first = (request.headers.get('accept-language') ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('es') ? 'es' : 'en';
}

function htmlResponse(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const COPY = {
  en: {
    confirmTitle: 'Confirm unsubscribe',
    confirmBody: 'Click the button to stop these LaunchForma emails.',
    button: 'Unsubscribe',
    doneTitle: 'Unsubscribed',
    doneBody: 'You are unsubscribed. You will not get these LaunchForma emails.',
    invalidTitle: 'Link not valid',
    invalidBody: 'This link is not valid. To unsubscribe, use the link in the latest email.',
  },
  es: {
    confirmTitle: 'Confirma tu baja',
    confirmBody: 'Toca el botón para dejar de recibir estos correos de LaunchForma.',
    button: 'Cancelar suscripción',
    doneTitle: 'Listo',
    doneBody: 'Ya no recibirás estos correos de LaunchForma.',
    invalidTitle: 'Enlace no válido',
    invalidBody: 'Este enlace no es válido. Si quieres darte de baja, usa el enlace del correo más reciente.',
  },
} as const;

function shell(locale: PageLocale, title: string, body: string, extra = ''): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)} · LaunchForma</title>
  <style>
    body{margin:0;background:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1F2B}
    main{max-width:32rem;margin:0 auto;padding:48px 20px}
    .card{background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 8px 24px rgba(16,24,40,.06)}
    h1{font-size:1.5rem;line-height:1.3;margin:0 0 12px}
    p{font-size:1rem;line-height:1.6;color:#475467;margin:0 0 16px}
    button{appearance:none;border:0;border-radius:10px;background:#1565FF;color:#fff;font:inherit;font-weight:600;padding:12px 18px;cursor:pointer}
    a{color:#1565FF}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      ${extra}
      <p><a href="https://launchforma.com">launchforma.com</a></p>
    </div>
  </main>
</body>
</html>`;
}

function confirmPage(args: { locale: PageLocale; token: string }): string {
  const copy = COPY[args.locale];
  const action = `/unsubscribe?token=${encodeURIComponent(args.token)}&locale=${args.locale}`;
  const form = `<form method="post" action="${escapeHtml(action)}"><button type="submit">${escapeHtml(copy.button)}</button></form>`;
  return shell(args.locale, copy.confirmTitle, copy.confirmBody, form);
}

function donePage(locale: PageLocale): string {
  const copy = COPY[locale];
  return shell(locale, copy.doneTitle, copy.doneBody);
}

function invalidPage(locale: PageLocale): string {
  const copy = COPY[locale];
  return shell(locale, copy.invalidTitle, copy.invalidBody);
}
