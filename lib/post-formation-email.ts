import { OA_PUBLIC_DIR, OA_TEMPLATE_ASSETS } from '@/lib/oa-template';
import { DRIP_MAILING_ADDRESS, type DripLocale } from '@/lib/drip-copy';
import type { PostFormationStepId } from '@/lib/post-formation';

/**
 * Certificate order pages use getLocale() and hrefForLocale, so
 * /es/dashboard/filings/{id}/certificates/{slug} stays in Spanish.
 */
export const LOCALE_PRESERVING_CERTIFICATE_LINKS = true;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function preheader(text: string): string {
  return `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(text)}</div>`;
}

function siteBase(siteUrl: string): string {
  return siteUrl.replace(/\/$/, '');
}

export function certificateCtaUrl(
  locale: DripLocale,
  filingId: string,
  slug: 'cert_status' | 'cert_copy',
  siteUrl: string,
): string {
  const base = siteBase(siteUrl);
  if (locale === 'es' && !LOCALE_PRESERVING_CERTIFICATE_LINKS) return `${base}/es/dashboard`;
  const prefix = locale === 'es' ? '/es' : '';
  return `${base}${prefix}/dashboard/filings/${encodeURIComponent(filingId)}/certificates/${slug}`;
}

function oaPdf(locale: DripLocale, variant: 'single' | 'multi', siteUrl: string): string {
  const asset = OA_TEMPLATE_ASSETS.find(
    (item) => item.locale === locale && item.variant === variant && item.format === 'pdf',
  );
  if (!asset) throw new Error(`Missing ${locale} ${variant} operating agreement PDF`);
  return `${siteBase(siteUrl)}/oa/${OA_PUBLIC_DIR}/${asset.filename}`;
}

function absolute(siteUrl: string, path: string): string {
  return `${siteBase(siteUrl)}${path}`;
}

const FOOTER = {
  en: {
    disclaimer:
      'This email is general information, not legal or tax advice. LaunchForma is a private filing service, not a law firm or government agency.',
    reason: 'You are receiving this because you formed a company with LaunchForma.',
    unsubscribe: 'Unsubscribe',
  },
  es: {
    disclaimer:
      'Este correo es información general, no asesoría legal ni fiscal. LaunchForma es un servicio privado de presentación, no un bufete de abogados ni una agencia del gobierno.',
    reason: 'Recibes este mensaje porque formaste una empresa con LaunchForma.',
    unsubscribe: 'Cancelar suscripción',
  },
} as const;

function footerHtml(locale: DripLocale, unsubscribeUrl: string): string {
  const copy = FOOTER[locale];
  const address = `LaunchForma, ${DRIP_MAILING_ADDRESS}`;
  return `<p class="muted"><em>${escapeHtml(copy.disclaimer)}</em></p>
<p class="muted">${escapeHtml(copy.reason)} <a href="${escapeHtml(unsubscribeUrl)}">${escapeHtml(copy.unsubscribe)}</a><br/>${escapeHtml(address)}</p>`;
}

function greeting(locale: DripLocale, firstName: string | null | undefined): string {
  const name = firstName?.trim();
  if (locale === 'es') return name ? `Hola ${name},` : 'Hola,';
  return `Hi ${name || 'there'},`;
}

function company(locale: DripLocale, businessName: string | null | undefined): string {
  const value = businessName?.trim();
  if (value) return value;
  return locale === 'es' ? 'tu empresa' : 'your company';
}

const COPY = {
  en: {
    DAY_3: {
      subject: 'A quick tip for opening your business bank account',
      preview: 'The three documents banks usually ask for, and where to find them.',
      thanks: 'Thanks,',
      team: 'The LaunchForma team',
    },
    DAY_14: {
      subject: 'One date every Florida company should know',
      preview: 'Florida annual reports are due between January 1 and May 1 each year.',
      thanks: 'Thanks,',
      team: 'The LaunchForma team',
    },
    DAY_30: {
      subject: 'A quick note about your registered agent',
      preview: 'Your first year of Registered Agent service is included. Here is what comes next.',
      thanks: 'Thanks,',
      team: 'The LaunchForma team',
    },
  },
  es: {
    DAY_3: {
      subject: 'Un consejo rápido para abrir la cuenta bancaria de tu empresa',
      preview: 'Los tres documentos que los bancos suelen pedir, y dónde encontrarlos.',
      thanks: 'Gracias,',
      team: 'El equipo de LaunchForma',
    },
    DAY_14: {
      subject: 'Una fecha que toda empresa de Florida debería conocer',
      preview: 'El reporte anual de Florida se presenta entre el 1 de enero y el 1 de mayo de cada año.',
      thanks: 'Gracias,',
      team: 'El equipo de LaunchForma',
    },
    DAY_30: {
      subject: 'Una nota rápida sobre tu agente registrado',
      preview: 'El primer año del servicio de agente registrado está incluido. Esto es lo que sigue.',
      thanks: 'Gracias,',
      team: 'El equipo de LaunchForma',
    },
  },
} as const;

function day3Inner(locale: DripLocale, args: BuildArgs, safeCompany: string): string {
  const copy = COPY[locale].DAY_3;
  const single = oaPdf(locale, 'single', args.siteUrl);
  const multi = oaPdf(locale, 'multi', args.siteUrl);
  const statusUrl = certificateCtaUrl(locale, args.filingId, 'cert_status', args.siteUrl);
  const copyUrl = certificateCtaUrl(locale, args.filingId, 'cert_copy', args.siteUrl);
  if (locale === 'es') {
    return `${preheader(copy.preview)}
<p>${escapeHtml(greeting(locale, args.firstName))}</p>
<p>Felicidades de nuevo por formar ${escapeHtml(safeCompany)}. Un paso común es abrir una cuenta bancaria de empresa, así que aquí va un consejo corto para que esa visita sea más fácil.</p>
<p>Cada banco pone sus propias reglas, así que confirma con el tuyo primero. La mayoría suele pedir:</p>
<ul>
<li><strong>Tu EIN</strong> del IRS. Sacarlo es gratis en irs.gov.</li>
<li><strong>Tus artículos</strong> de organización o de incorporación, que te enviamos con los documentos presentados.</li>
<li><strong>Un acuerdo operativo</strong> que explique quién es dueño de la empresa y quién la administra.</li>
</ul>
<p>Si todavía no tienes un acuerdo operativo, preparamos una muestra gratis que puedes usar como punto de partida.</p>
<a class="cta" href="${escapeHtml(single)}">Descargar la muestra de un solo miembro</a>
<p>¿Hay más de un dueño? <a href="${escapeHtml(multi)}">Descarga la muestra de varios miembros</a>.</p>
<p>Algunos bancos también piden un documento oficial del estado que muestre que tu empresa está activa. Si el tuyo lo pide, puedes pedirlo desde tu panel:</p>
<ul>
<li><a href="${escapeHtml(statusUrl)}">Certificado de estatus</a></li>
<li><a href="${escapeHtml(copyUrl)}">Copia certificada</a></li>
</ul>
<p>El precio depende de tu estado y del tipo de empresa, y tu panel muestra el monto exacto antes de pedir. Si tu plan ya incluye uno, la página lo indica.</p>
<p>${escapeHtml(copy.thanks)}<br/>${escapeHtml(copy.team)}</p>
${footerHtml(locale, args.unsubscribeUrl)}`;
  }
  return `${preheader(copy.preview)}
<p>${escapeHtml(greeting(locale, args.firstName))}</p>
<p>Congratulations again on forming ${escapeHtml(safeCompany)}. A common next step is opening a business bank account, so here is a short tip to make that visit easier.</p>
<p>Banks set their own rules, so check with yours first. Most usually ask for:</p>
<ul>
<li><strong>Your EIN</strong> from the IRS. Getting one is free at irs.gov.</li>
<li><strong>Your Articles</strong> of Organization or Incorporation, which we sent with your filed documents.</li>
<li><strong>An operating agreement</strong> that explains who owns and runs the company.</li>
</ul>
<p>If you do not have an operating agreement yet, we put together a free sample you can use as a starting point.</p>
<a class="cta" href="${escapeHtml(single)}">Download the single-member sample</a>
<p>More than one owner? <a href="${escapeHtml(multi)}">Download the multi-member sample</a>.</p>
<p>Some banks also ask for an official state document showing your company is active. If yours does, you can order one from your dashboard:</p>
<ul>
<li><a href="${escapeHtml(statusUrl)}">Certificate of Status</a></li>
<li><a href="${escapeHtml(copyUrl)}">Certified Copy</a></li>
</ul>
<p>The price depends on your state and company type, and your dashboard shows the exact amount before you order. If your plan already includes one, the page will say "Already included".</p>
<p>${escapeHtml(copy.thanks)}<br/>${escapeHtml(copy.team)}</p>
${footerHtml(locale, args.unsubscribeUrl)}`;
}

function day14Inner(locale: DripLocale, args: BuildArgs, safeCompany: string): string {
  const copy = COPY[locale].DAY_14;
  const path = locale === 'es' ? '/es/file-annual-report' : '/file-annual-report';
  const href = absolute(args.siteUrl, path);
  if (locale === 'es') {
    return `${preheader(copy.preview)}
<p>${escapeHtml(greeting(locale, args.firstName))}</p>
<p>Ahora que ${escapeHtml(safeCompany)} ya está formada, aquí hay una fecha para guardar. Las empresas de Florida presentan un reporte anual cada año entre el 1 de enero y el 1 de mayo. Después del 1 de mayo, el estado suma una multa de $400 por presentación tardía.</p>
<p>Cuando se abre el plazo, puedes presentarlo con nosotros. No hace falta una cuenta. Escribe tu número de documento, revisa tus datos y lo presentamos ante la Florida Division of Corporations en 1 día hábil.</p>
<a class="cta" href="${escapeHtml(href)}">Presenta tu reporte anual con LaunchForma</a>
<p>${escapeHtml(copy.thanks)}<br/>${escapeHtml(copy.team)}</p>
${footerHtml(locale, args.unsubscribeUrl)}`;
  }
  return `${preheader(copy.preview)}
<p>${escapeHtml(greeting(locale, args.firstName))}</p>
<p>Now that ${escapeHtml(safeCompany)} is set up, here is a date to save. Florida companies file an annual report each year between January 1 and May 1. After May 1, the state adds a $400 late fee.</p>
<p>When the window opens, you can file with us. No account is needed. Enter your document number, review your info, and we file with the Florida Division of Corporations within 1 business day.</p>
<a class="cta" href="${escapeHtml(href)}">File your annual report with LaunchForma</a>
<p>${escapeHtml(copy.thanks)}<br/>${escapeHtml(copy.team)}</p>
${footerHtml(locale, args.unsubscribeUrl)}`;
}

function day30Inner(locale: DripLocale, args: BuildArgs, safeCompany: string): string {
  const copy = COPY[locale].DAY_30;
  const signIn = absolute(args.siteUrl, locale === 'es' ? '/es/sign-in' : '/sign-in');
  const guide = absolute(
    args.siteUrl,
    locale === 'es' ? '/es/guides/florida-registered-agent' : '/guides/florida-registered-agent',
  );
  if (locale === 'es') {
    return `${preheader(copy.preview)}
<p>${escapeHtml(greeting(locale, args.firstName))}</p>
<p>Tu paquete de LaunchForma incluye el primer año gratis del servicio de agente registrado para ${escapeHtml(safeCompany)}. Eso significa que recibimos la correspondencia oficial de tu empresa en una dirección física de Florida, lo que también ayuda a que tu dirección de casa no aparezca en el registro público.</p>
<p>Después del primer año, puedes mantener el servicio por $150 al año o cambiar a tu propio agente. Hoy no tienes que hacer nada. Para ver o cambiar la configuración de tu agente registrado en cualquier momento, inicia sesión y abre tu empresa.</p>
<a class="cta" href="${escapeHtml(signIn)}">Inicia sesión para administrar tu agente registrado</a>
<p>¿Quieres leer más primero? Lee nuestra guía: <a href="${escapeHtml(guide)}">Lo básico del agente registrado en Florida</a>.</p>
<p>${escapeHtml(copy.thanks)}<br/>${escapeHtml(copy.team)}</p>
${footerHtml(locale, args.unsubscribeUrl)}`;
  }
  return `${preheader(copy.preview)}
<p>${escapeHtml(greeting(locale, args.firstName))}</p>
<p>Your LaunchForma package includes a free first year of Registered Agent service for ${escapeHtml(safeCompany)}. That means we receive official mail for your company at a Florida street address, which also helps keep your home address off the public record.</p>
<p>After the first year, you can keep the service for $150 a year or switch to your own agent. There is nothing to do today. To see or change your Registered Agent settings any time, sign in and open your company.</p>
<a class="cta" href="${escapeHtml(signIn)}">Sign in to manage your Registered Agent</a>
<p>Want to learn more first? Read our guide: <a href="${escapeHtml(guide)}">Florida registered agent basics</a>.</p>
<p>${escapeHtml(copy.thanks)}<br/>${escapeHtml(copy.team)}</p>
${footerHtml(locale, args.unsubscribeUrl)}`;
}

interface BuildArgs {
  step: PostFormationStepId;
  locale: DripLocale;
  firstName?: string | null;
  businessName?: string | null;
  filingId: string;
  siteUrl: string;
  unsubscribeUrl: string;
}

export function buildPostFormationEmail(args: BuildArgs): { subject: string; inner: string } {
  const copy = COPY[args.locale][args.step];
  const safeCompany = company(args.locale, args.businessName);
  const inner =
    args.step === 'DAY_3'
      ? day3Inner(args.locale, args, safeCompany)
      : args.step === 'DAY_14'
        ? day14Inner(args.locale, args, safeCompany)
        : day30Inner(args.locale, args, safeCompany);
  return { subject: copy.subject, inner };
}

export function allPostFormationCopyText(): string {
  const chunks: string[] = [DRIP_MAILING_ADDRESS];
  for (const locale of ['en', 'es'] as const) {
    for (const step of ['DAY_3', 'DAY_14', 'DAY_30'] as const) {
      const built = buildPostFormationEmail({
        step,
        locale,
        firstName: 'Ana',
        businessName: 'Northwind LLC',
        filingId: 'fil_1',
        siteUrl: 'https://launchforma.com',
        unsubscribeUrl: 'https://launchforma.com/unsubscribe?token=abc',
      });
      chunks.push(built.subject, built.inner);
    }
    chunks.push(FOOTER[locale].disclaimer, FOOTER[locale].reason, FOOTER[locale].unsubscribe);
  }
  return chunks.join('\n');
}
