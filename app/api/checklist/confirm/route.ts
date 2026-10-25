import { NextResponse } from 'next/server';
import { confirmChecklistToken } from '@/lib/checklist-lead';
import { checklistPageUrl, type DripLocale } from '@/lib/drip-copy';
import { checkActionRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

/**
 * One click on the signed confirm link. Repeating a link that already
 * delivered the checklist does not send it again.
 */
export async function GET(request: Request) {
  const limited = checkActionRateLimit('checklist-confirm', 20, 10 * 60 * 1000);
  if (limited) {
    return new NextResponse('Too many attempts. Please wait and try again.', {
      status: 429,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const token = new URL(request.url).searchParams.get('token') ?? '';
  const result = await confirmChecklistToken(token);
  const locale: DripLocale = result.locale === 'en' ? 'en' : 'es';
  const checklistHref = checklistPageUrl(locale, SITE_URL);

  if (result.status === 'confirmed' || result.status === 'already') {
    return html(page({
      lang: locale,
      title: result.locale === 'en' ? 'You are confirmed' : 'Listo, confirmado',
      primary:
        result.locale === 'en'
          ? 'Your checklist is on its way. If you do not see it in a few minutes, check spam or promotions.'
          : 'Tu lista va en camino. Si no la ves en unos minutos, revisa spam o promociones.',
      secondary:
        result.locale === 'en'
          ? 'You can also open it here.'
          : 'También puedes abrirla aquí.',
      href: checklistHref,
      link: result.locale === 'en' ? 'Open the checklist' : 'Abrir la lista',
    }));
  }

  if (result.status === 'unsubscribed') {
    return html(
      page({
        title: 'Unsubscribed',
        primary: 'You unsubscribed, so we did not send the checklist.',
        secondary: 'Te diste de baja, así que no enviamos la lista.',
        href: SITE_URL,
        link: 'launchforma.com',
      }),
      200,
    );
  }

  if (result.status === 'expired') {
    const again = checklistPageUrl(locale, SITE_URL);
    return html(
      page({
        lang: locale,
        title: result.locale === 'en' ? 'Link expired' : 'El enlace venció',
        primary:
          result.locale === 'en'
            ? 'This confirm link expired. Request the checklist again and we will send a new one.'
            : 'Este enlace de confirmación venció. Pide la lista otra vez y te enviamos uno nuevo.',
        secondary:
          result.locale === 'en'
            ? 'The new link also expires in 48 hours.'
            : 'El enlace nuevo también vence en 48 horas.',
        href: again,
        link: result.locale === 'en' ? 'Request the checklist' : 'Pedir la lista',
      }),
      400,
    );
  }

  return html(
    page({
      title: 'Link not valid',
      primary: 'This link is not valid. Request the checklist again from the site.',
      secondary: 'Este enlace no es válido. Pide la lista otra vez desde el sitio.',
      href: `${SITE_URL}/checklist`,
      link: 'launchforma.com/checklist',
    }),
    400,
  );
}

function html(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function page(args: {
  title: string;
  primary: string;
  secondary: string;
  href: string;
  link: string;
  lang?: DripLocale;
}): string {
  const href = args.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const text = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="${args.lang === 'es' ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${text(args.title)} · LaunchForma</title>
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
      <h1>${text(args.title)}</h1>
      <p>${text(args.primary)}</p>
      <p>${text(args.secondary)}</p>
      <p><a href="${href}">${text(args.link)}</a></p>
    </div>
  </main>
</body>
</html>`;
}
