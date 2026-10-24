import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { OaTemplateConfirmed } from '@/components/marketing/OaTemplateConfirmed';
import { OaTemplateResend } from '@/components/marketing/OaTemplateResend';
import { localizedHref } from '@/lib/locale-paths';
import { logger } from '@/lib/logger';
import { OA_GUIDE_PATH } from '@/lib/oa-guide-copy';
import { confirmedOaLeadForSession } from '@/lib/oa-template-lead';
import { signOaTemplateLinks } from '@/lib/oa-template-storage';
import {
  OA_DOWNLOAD_COOKIE,
  OA_SAMPLE_HEADER,
  OA_TOKEN_PATTERN,
  oaTemplateDownloadEnabled,
  oaTemplateLocale,
  openOaDownloadSession,
  type OaTemplateLocale,
} from '@/lib/oa-template';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Florida LLC operating agreement sample',
  robots: { index: false, follow: false },
};

const COPY = {
  en: {
    readyTitle: 'Your sample is ready',
    ready: 'These links expire in 7 days. We also emailed them to you.',
    missing: 'Open the download links in your email, or request the sample again from the guide.',
    expiredTitle: 'This link expired',
    expired: 'Request a new confirmation email. It expires in 48 hours.',
    resend: 'Resend the email',
    resendPending: 'Sending...',
    resendDone: 'Check your inbox for a new email.',
    resendError: 'We could not send that. Try again in a few minutes.',
    unavailable: 'The download links are in your email. If they are missing, request the sample again from the guide.',
    back: 'Back to the guide',
    request: 'Request a new sample',
  },
  es: {
    readyTitle: 'Tu muestra está lista',
    ready: 'Estos enlaces vencen en 7 días. También te los enviamos por correo.',
    missing: 'Abre los enlaces de descarga de tu correo, o pide la muestra de nuevo desde la guía.',
    expiredTitle: 'Este enlace venció',
    expired: 'Pide un correo de confirmación nuevo. Vence en 48 horas.',
    resend: 'Reenviar el correo',
    resendPending: 'Enviando...',
    resendDone: 'Revisa tu correo. Te enviamos un mensaje nuevo.',
    resendError: 'No pudimos enviar eso. Inténtalo de nuevo en unos minutos.',
    unavailable: 'Los enlaces de descarga están en tu correo. Si no los ves, pide la muestra de nuevo desde la guía.',
    back: 'Volver a la guía',
    request: 'Pedir otra muestra',
  },
} as const;

export default async function OaTemplateDownloadPage({
  searchParams,
}: {
  searchParams?: { confirmed?: string; expired?: string; token?: string };
}) {
  if (!oaTemplateDownloadEnabled()) notFound();

  const locale = oaTemplateLocale(await getLocale());
  const copy = COPY[locale];
  const guideHref = localizedHref(OA_GUIDE_PATH, locale);
  const session = openOaDownloadSession(cookies().get(OA_DOWNLOAD_COOKIE)?.value);
  const lead = session ? await confirmedOaLeadForSession(session.id) : null;
  const showConfirmed = searchParams?.confirmed === '1' && Boolean(lead);
  const expired = searchParams?.expired === '1';
  const token = searchParams?.token ?? '';
  const canResend = expired && OA_TOKEN_PATTERN.test(token);

  let links: { label: string; url: string }[] | null = null;
  if (lead) {
    try {
      links = await signOaTemplateLinks(lead.locale);
    } catch (err) {
      logger.error('oa template download page sign failed', { area: 'marketing', tag: 'oa-template-sign' }, err);
    }
  }

  const linkLocale: OaTemplateLocale = lead?.locale ?? locale;

  return (
    <div className="container max-w-xl py-16">
      {showConfirmed ? <OaTemplateConfirmed locale={linkLocale} /> : null}
      <p className="text-sm font-medium text-ink">{OA_SAMPLE_HEADER[linkLocale]}</p>
      <h1 className="mt-3 font-display text-3xl font-medium text-ink">
        {links ? copy.readyTitle : expired ? copy.expiredTitle : 'LaunchForma'}
      </h1>
      {links ? (
        <>
          <p className="mt-4 text-ink-muted">{copy.ready}</p>
          <ul className="mt-6 space-y-3 font-semibold text-primary">
            {links.map((link) => (
              <li key={link.label}>
                <a href={link.url}>{link.label}</a>
              </li>
            ))}
          </ul>
        </>
      ) : expired ? (
        <>
          <p className="mt-4 text-ink-muted">{copy.expired}</p>
          {canResend ? (
            <OaTemplateResend
              token={token}
              label={copy.resend}
              pendingLabel={copy.resendPending}
              success={copy.resendDone}
              error={copy.resendError}
            />
          ) : (
            <p className="mt-6">
              <Link href={guideHref} className="font-semibold text-primary hover:underline">
                {copy.request}
              </Link>
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-ink-muted">{lead ? copy.unavailable : copy.missing}</p>
      )}
      <p className="mt-8">
        <Link href={guideHref} className="font-semibold text-primary hover:underline">
          {copy.back}
        </Link>
      </p>
    </div>
  );
}
