/**
 * Email service - uses Resend when RESEND_API_KEY is set, otherwise logs
 * to console (development / test). Records every send in EmailNotification.
 *
 * Google Workspace setup:
 *  1. Verify launchforma.com in Resend → Domains → Add Domain.
 *  2. Add the SPF / DKIM / DMARC DNS records Resend provides.
 *  3. Set RESEND_API_KEY in Vercel env vars.
 *  4. Set EMAIL_FROM to "LaunchForma <no-reply@launchforma.com>".
 *  5. In Google Workspace Admin → Apps → Gmail → Routing, add a routing
 *     rule that delivers mail addressed to help@launchforma.com (or any
 *     alias) to your admin@launchforma.com inbox.
 */

import { prisma } from './db';
import { isDeliverableEmail, isQaOrE2eRecipient, normalizeEmail } from './email-address';
import { EMAIL_STATUS_SKIPPED_TEST } from './email-status';
import { RA_RENEWAL_PRICE_CENTS } from './pricing';
import { formatCurrency, formatDateLong } from './utils';
import { TOTAL_DISPLAYED_STEPS } from './wizard-constants';
import { BUSINESS_ADDRESS, BUSINESS_LEGAL_NAME } from './constants';
import { buildChecklistConfirmEmail, buildChecklistEmail, buildResumeEmail } from './drip-email';
import { buildNewsletterEmail } from './newsletter-email';
import { buildPostFormationEmail } from './post-formation-email';
import { newsletterDeliveryLocale, normalizeNewsletterIssue } from './newsletter';
import type { PostFormationStepId } from './post-formation';
import { emailShellCopy, type DripLocale, type ResumeStepId } from './drip-copy';
import { decorateResumeEmailHtml } from './resume-utm';
import { isResumeDripType, RESUME_DRIP_MAX_ATTEMPTS } from './resume-drip-claim';
import { hrefForLocale } from './app-href';
import { listUnsubscribeHeaders } from './unsubscribe';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'WELCOME'
  | 'FILING_STARTED'
  | 'ABANDONED_24H'
  | 'ABANDONED_72H'
  | 'ABANDONED_7D'
  | 'RESUME_1H'
  | 'RESUME_1D'
  | 'RESUME_3D'
  | 'CHECKLIST_CONFIRM'
  | 'CHECKLIST_DELIVERY'
  | 'POST_FORMATION_DAY_3'
  | 'POST_FORMATION_DAY_14'
  | 'POST_FORMATION_DAY_30'
  | 'WEEKLY_NEWSLETTER'
  | 'DRAFT_REENGAGE'
  | 'RA_RENEWAL_60'
  | 'RA_RENEWAL_30'
  | 'RA_RENEWAL_7'
  | 'RA_RENEWED'
  | 'EIN_ORDERED'
  | 'CERTIFICATE_ORDERED'
  | 'PAYMENT_CONFIRMATION'
  | 'ADMIN_PAID_ORDER'
  | 'ADMIN_FILING_OVERDUE'
  | 'FILING_SUBMITTED'
  | 'FILING_APPROVED'
  | 'FILING_REJECTED'
  | 'ANNUAL_REPORT_60'
  | 'ANNUAL_REPORT_30'
  | 'ANNUAL_REPORT_FINAL'
  | 'COMPLIANCE_ALERT'
  | 'PASSWORD_RESET'
  | 'GUEST_SET_PASSWORD'
  | 'CHECKOUT_LOGIN_LINK'
  | 'SERVICE_INQUIRY'
  | 'OA_TEMPLATE_CONFIRM'
  | 'OA_TEMPLATE_DOWNLOAD'
  | 'ANNUAL_REPORT_UNSAVED';

interface EmailContext {
  firstName?: string;
  businessName?: string;
  entityType?: 'LLC' | 'CORP';
  totalCents?: number;
  /** True for isTest payments and tester accounts. Prefixes the admin subject. */
  testOrder?: boolean;
  customerName?: string;
  customerEmail?: string;
  orderState?: string;
  orderEntity?: string;
  orderPlan?: string;
  paidAtLabel?: string;
  deadlineLabel?: string;
  adminFilingUrl?: string;
  /** overdue_soon at 20h, overdue at 24h. */
  overdueKind?: 'overdue_soon' | 'overdue';
  filingNumber?: string;
  trackingNumber?: string;
  pin?: string;
  rejectionReason?: string;
  dueDate?: Date;
  daysUntilDue?: number;
  resetUrl?: string;
  /** Temporary password emailed to a guest who just claimed their account. */
  tempPassword?: string;
  /** Account email shown next to the temporary password in the welcome mail. */
  loginEmail?: string;
  /**
   * Deep link back into the filing. For guests this is a tokenized /resume URL
   * that re-authorizes them; for account holders it's their dashboard. Used by
   * the abandoned-draft recovery emails so the CTA isn't a dead-end.
   */
  resumeUrl?: string;
  /** en or es. Resume and checklist mail use English when this is missing. */
  locale?: string;
  /** Signed unsubscribe URL for marketing mail. */
  unsubscribeUrl?: string;
  /** Signed confirm link for the checklist double opt-in. */
  checklistConfirmUrl?: string;
  /** Weekly issue. Defaults to 001 when missing. */
  newsletterIssue?: string;
  /** Filing id used in post-formation certificate links. */
  linkFilingId?: string;
  // ── Manual draft re-engagement ──
  /** State name shown next to the entity type (e.g. "Florida"). */
  stateName?: string;
  /** Customer-facing steps completed, out of TOTAL_DISPLAYED_STEPS. */
  stepsCompleted?: number;
  /** True when the draft is parked on the payment step. */
  readyForCheckout?: boolean;
  /** Set when resumeUrl is a one-time sign-in link; its lifetime in days. */
  linkExpiresInDays?: number;
  // ── Registered Agent renewal reminders ──
  /** Whether the customer enrolled in automatic renewal at checkout. */
  raAutoRenew?: boolean;
  /** Price snapshotted on the service (grandfathered per customer). */
  raRenewalPriceCents?: number;
  /** The upcoming renewal date. */
  raRenewalDate?: Date;
  /** Last 4 of the card we'd charge (auto-renew) - for reassurance. */
  raCardLast4?: string;
  /** Deep link to the RA renewal page for this filing. */
  raRenewUrl?: string;
  // ── Dashboard certificate order ──
  certificateSlug?: 'cert_status' | 'cert_copy';
  /** LaunchForma service fee, in cents. */
  serviceCents?: number;
  /** State certificate fee, in cents. */
  stateFeeCents?: number;
  // ── Business-services inquiry (internal notify) ──
  inquiryName?: string;
  inquiryEmail?: string;
  inquiryPhone?: string;
  inquiryService?: string;
  /** `[Reinstatement]` or `[Late annual report]` for those contact inquiries. */
  inquirySubjectPrefix?: string;
  /** Optional Sunbiz document number collected with reinstatement or a late report. */
  inquirySunbizDocumentNumber?: string;
  /** Optional company name collected with reinstatement or a late report. */
  inquiryCompanyName?: string;
  inquiryMessage?: string;
  inquiryLocale?: string;
  inquiryUtmSource?: string;
  inquiryUtmMedium?: string;
  inquiryUtmCampaign?: string;
  inquiryUtmContent?: string;
  inquiryUtmTerm?: string;
  inquiryGclid?: string;
  // ── Operating agreement sample (double opt-in) ──
  oaLocale?: 'en' | 'es';
  oaConfirmUrl?: string;
  oaSinglePdfUrl?: string;
  oaSingleDocxUrl?: string;
  oaMultiPdfUrl?: string;
  oaMultiDocxUrl?: string;
  oaUnsubscribeUrl?: string;
  /** Admin-only detail when an annual-report charge did not finish saving. */
  unsavedChargeDetail?: string;
  /**
   * Set only on the admin paid-order email for a paid annual report.
   * Empty means there is no document number to link. Absent means this is not that email.
   */
  annualReportDocumentNumber?: string;
}

export interface SendEmailArgs {
  type: NotificationType;
  to: string;
  filingId?: string;
  userId?: string;
  context?: EmailContext;
  /** Set on the resume sequence. Other mail leaves Reply-To unset. */
  replyTo?: string;
  /** HTTPS unsubscribe URL. Adds List-Unsubscribe and the one-click POST header. */
  listUnsubscribeUrl?: string;
  /**
   * Update this EmailNotification instead of inserting another row.
   * The resume drip claims the row (PENDING) before delivery.
   */
  notificationId?: string;
  /** Stored on EmailNotification.step. The weekly issue number uses this. */
  step?: string;
}

// ─── Templates ───────────────────────────────────────────────────────────────

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

function localeUrl(locale: string | null | undefined, path: string): string {
  return `${siteUrl}${hrefForLocale(path, locale === 'es' ? 'es' : 'en')}`;
}

/**
 * Registered Agent renewal reminder body, shared by the 60/30/7-day cascade.
 *
 * Branches on whether the customer enrolled in automatic renewal:
 *  - autoRenew ON  → reassurance: states the exact amount, date, and card, and
 *    tells them how to change or cancel. No "pay now" pressure.
 *  - autoRenew OFF → a genuine call to action driving to the renewal page. The
 *    7-day note never promises we'll charge them (we won't without consent).
 */
function raRenewalEmail(
  daysOut: 60 | 30 | 7,
  ctx: EmailContext,
): { subject: string; body: string } {
  const business = ctx.businessName ?? 'your business';
  const price = formatCurrency(ctx.raRenewalPriceCents ?? RA_RENEWAL_PRICE_CENTS);
  const dateStr = ctx.raRenewalDate ? formatDateLong(ctx.raRenewalDate) : null;
  const renewUrl = ctx.raRenewUrl ?? `${siteUrl}/dashboard/billing`;
  const last4 = ctx.raCardLast4;

  if (ctx.raAutoRenew) {
    const when = dateStr ? `on ${dateStr}` : `in ${daysOut} days`;
    const cardPhrase = last4 ? ` to your card ending ${last4}` : '';
    return {
      subject:
        daysOut === 7
          ? `Your Registered Agent for ${business} renews in 7 days`
          : `Registered Agent auto-renewal for ${business} - ${daysOut} days`,
      body: html`
        <h1>Your Registered Agent renews automatically ${when}</h1>
        <p>No action needed. We'll renew Registered Agent service for <strong>${business}</strong> ${when} and charge <strong>${price}</strong>${cardPhrase}, keeping your in-state address active and your home address off the public record.</p>
        <p class="muted">Want to change your card or cancel? You can do that anytime before the renewal date.</p>
        <a class="cta" href="${renewUrl}">Manage renewal</a>
      `,
    };
  }

  const urgency =
    daysOut === 7
      ? `<p>This is your final reminder. Renew now to avoid a lapse in coverage - a missed legal notice can lead to a default judgment or administrative dissolution.</p>`
      : `<p>Your free Year-1 Registered Agent service for <strong>${business}</strong> is approaching its anniversary${dateStr ? ` on ${dateStr}` : ''}.</p>`;
  return {
    subject:
      daysOut === 7
        ? `Final reminder: renew your Registered Agent for ${business}`
        : `Your Registered Agent for ${business} renews in ${daysOut} days`,
    body: html`
      <h1>Registered Agent renewal ${dateStr ? ` - ${dateStr}` : `in ${daysOut} days`}</h1>
      ${urgency}
      <p>Renew for <strong>${price}/year</strong> to keep your in-state address active and your home address off the public record. Cancel anytime.</p>
      <a class="cta" href="${renewUrl}">Renew now</a>
    `,
  };
}

function certificateOrderedEmail(ctx: EmailContext): { subject: string; body: string } {
  const spanish = ctx.locale === 'es';
  const rawCompany = ctx.businessName?.trim() || (spanish ? 'tu empresa' : 'your company');
  const company = escapeHtml(rawCompany);
  const isCopy = ctx.certificateSlug === 'cert_copy';
  const label = spanish
    ? isCopy
      ? 'copia certificada'
      : 'certificado de estado'
    : isCopy
      ? 'certified copy'
      : 'certificate of status';
  const serviceLabel = spanish ? 'Tarifa de servicio' : 'Service fee';
  const stateLabel = spanish ? 'Tarifa estatal' : 'State fee';
  const totalLabel = spanish ? 'Total' : 'Total';
  const subject = spanish
    ? `Pedido de ${label} recibido para ${rawCompany}`
    : `${label.charAt(0).toUpperCase()}${label.slice(1)} order received for ${rawCompany}`;
  const greetingName = escapeHtml(ctx.firstName?.trim() || (spanish ? '' : 'there'));
  const chargedFor = spanish
    ? isCopy
      ? `la copia certificada de <strong>${company}</strong>`
      : `el certificado de estado de <strong>${company}</strong>`
    : `the ${label} on <strong>${company}</strong>`;
  const inner = `
    <h1>${spanish ? 'Recibimos tu pedido' : 'We received your order'}</h1>
    <p>${
      spanish
        ? `Hola${greetingName ? ` ${greetingName}` : ''}, gracias. Cobramos <strong>${formatCurrency(ctx.totalCents ?? 0)}</strong> por ${chargedFor}.`
        : `Hi ${greetingName}, thank you. We charged <strong>${formatCurrency(ctx.totalCents ?? 0)}</strong> for ${chargedFor}.`
    }</p>
    <table class="meta">
      <tr><td>${serviceLabel}</td><td>${formatCurrency(ctx.serviceCents ?? 0)}</td></tr>
      <tr><td>${stateLabel}</td><td>${formatCurrency(ctx.stateFeeCents ?? 0)}</td></tr>
      <tr><td>${totalLabel}</td><td>${formatCurrency(ctx.totalCents ?? 0)}</td></tr>
    </table>
    <p>${
      spanish
        ? 'Solicitaremos el documento al estado y te escribiremos cuando esté listo. También aparecerá en los documentos de tu panel.'
        : 'We will request the document from the state and email you when it is ready. It will also appear in your dashboard documents.'
    }</p>
    <a class="cta" href="${escapeHtml(ctx.resumeUrl ?? `${siteUrl}/dashboard`)}">${
      spanish ? 'Ver mi empresa' : 'View my company'
    }</a>
    <p class="muted">${
      spanish
        ? '¿Preguntas? Responde a este correo o escribe a <a href="mailto:help@launchforma.com">help@launchforma.com</a>.'
        : 'Questions? Reply to this email or write <a href="mailto:help@launchforma.com">help@launchforma.com</a>.'
    }</p>
  `;
  return {
    subject: subject.replace(/[\r\n]+/g, ' '),
    body: wrap(inner, { locale: spanish ? 'es' : 'en' }),
  };
}

const TEMPLATES: Record<
  NotificationType,
  (ctx: EmailContext) => { subject: string; body: string }
> = {
  WELCOME: ({ firstName, tempPassword, loginEmail, locale }) => {
    const spanish = locale === 'es';
    const signInUrl = localeUrl(locale, '/sign-in');
    const dashboardUrl = localeUrl(locale, '/dashboard');
    const name = firstName?.trim() || '';
    if (spanish) {
      return {
        subject: tempPassword ? 'Tu cuenta de LaunchForma está lista' : 'Tu cuenta de LaunchForma',
        body: tempPassword
          ? html`
              <h1>Tu cuenta está lista</h1>
              <p>${name ? `Hola ${name}.` : 'Hola.'} Usa estos datos para entrar cuando quieras y seguir con tu trámite. Por seguridad, cambia esta contraseña después de entrar.</p>
              <div class="panel mono">
                <div style="margin-bottom:6px"><span style="color:#667085">Correo</span><br/><strong>${loginEmail ?? ''}</strong></div>
                <div><span style="color:#667085">Contraseña temporal</span><br/><strong>${tempPassword}</strong></div>
              </div>
              <a class="cta" href="${signInUrl}">Entrar a mi panel</a>
              <p class="muted">¿Necesitas ayuda? Responde a este correo o escribe a <a href="mailto:help@launchforma.com">help@launchforma.com</a>.</p>
            `
          : html`
              <h1>Tu cuenta está lista</h1>
              <p>${name ? `Hola ${name}.` : 'Hola.'} Cuando quieras, tu panel está listo para seguir con el trámite.</p>
              <a class="cta" href="${dashboardUrl}">Ir al panel</a>
              <p class="muted">¿Preguntas? Responde cuando quieras o escribe a <a href="mailto:help@launchforma.com">help@launchforma.com</a>.</p>
            `,
      };
    }
    return {
      subject: tempPassword
        ? 'Your LaunchForma account is ready'
        : 'Welcome to LaunchForma',
      body: tempPassword
        ? html`
            <h1>Welcome, ${firstName ?? 'there'} - your account is ready</h1>
            <p>Use the credentials below to sign in anytime and pick up your filing. For security, change this password after your first sign-in.</p>
            <div class="panel mono">
              <div style="margin-bottom:6px"><span style="color:#667085">Email</span><br/><strong>${loginEmail ?? ''}</strong></div>
              <div><span style="color:#667085">Temporary password</span><br/><strong>${tempPassword}</strong></div>
            </div>
            <a class="cta" href="${signInUrl}">Sign in to my dashboard</a>
            <p class="muted">Need a hand? Reply to this email or write <a href="mailto:help@launchforma.com">help@launchforma.com</a> - a real person will help.</p>
          `
        : html`
            <h1>Welcome aboard, ${firstName ?? 'there'}</h1>
            <p>You're moments away from forming your business. When you're ready, your dashboard is waiting - no busywork, one clear price.</p>
            <a class="cta" href="${dashboardUrl}">Go to dashboard</a>
            <p class="muted">Questions? Reply anytime or email <a href="mailto:help@launchforma.com">help@launchforma.com</a>.</p>
          `,
    };
  },
  FILING_STARTED: ({ firstName, businessName, resumeUrl, locale }) => {
    if (locale === 'es') {
      const company = businessName ?? 'tu empresa';
      const name = firstName?.trim();
      const href = resumeUrl ?? localeUrl('es', '/dashboard');
      return {
        subject: `Tu trámite para ${company} ya empezó`,
        body: wrap(
          `
      <h1>Tu trámite empezó</h1>
      <p>${name ? `Hola ${name}.` : 'Hola.'} Guardamos tu avance. Sigues justo donde lo dejaste.</p>
      <a class="cta" href="${href}">Seguir con el trámite</a>
    `,
          { locale: 'es', preferencesUrl: localeUrl('es', '/dashboard/settings') },
        ),
      };
    }
    return {
      subject: `Your filing for ${businessName ?? 'your business'} is started`,
      body: html`
      <h1>Filing started</h1>
      <p>Hi ${firstName ?? 'there'} - we've saved your progress. Pick up exactly where you left off.</p>
      <a class="cta" href="${resumeUrl ?? `${siteUrl}/dashboard`}">Resume Filing</a>
    `,
    };
  },
  ABANDONED_24H: ({ firstName, businessName, resumeUrl }) => ({
    subject: `Continue forming ${businessName ?? 'your business'} - pick up where you left off`,
    body: html`
      <h1>Almost there, ${firstName ?? 'there'}</h1>
      <p>Your draft for <strong>${businessName ?? 'your business'}</strong> is saved. Finish today and we submit to the state within 1 business day.</p>
      <a class="cta" href="${resumeUrl ?? `${siteUrl}/dashboard`}">Resume Filing</a>
      <p class="muted">Most owners finish in 5 minutes from where you left off.</p>
    `,
  }),
  ABANDONED_72H: ({ firstName, businessName, resumeUrl }) => ({
    subject: `Your business name isn't reserved until you file`,
    body: html`
      <h1>Your name isn't locked in yet</h1>
      <p>${firstName ?? 'Hi'} - states only reserve a business name once your formation is filed. Anyone else can claim it in the meantime.</p>
      <a class="cta" href="${resumeUrl ?? `${siteUrl}/dashboard`}">Finish my filing</a>
      <p class="muted">We'll prepare and submit your Articles to the state within 1 business day of checkout.</p>
    `,
  }),
  ABANDONED_7D: ({ firstName, businessName, resumeUrl }) => ({
    subject: `Need a hand finishing ${businessName ?? 'your business'}?`,
    body: html`
      <h1>Stuck on a step?</h1>
      <p>${firstName ?? 'Hi'} - your draft is still saved. If something is unclear, reply to this email and a specialist will walk you through the rest. No charge.</p>
      <a class="cta" href="${resumeUrl ?? `${siteUrl}/dashboard`}">Resume Filing</a>
    `,
  }),
  RESUME_1H: (ctx) => resumeDripTemplate('RESUME_1H', ctx),
  RESUME_1D: (ctx) => resumeDripTemplate('RESUME_1D', ctx),
  RESUME_3D: (ctx) => resumeDripTemplate('RESUME_3D', ctx),
  CHECKLIST_CONFIRM: (ctx) => {
    const built = buildChecklistConfirmEmail({
      locale: ctx.locale,
      firstName: ctx.firstName,
      confirmUrl: ctx.checklistConfirmUrl ?? `${siteUrl}/checklist`,
      unsubscribeUrl: ctx.unsubscribeUrl,
    });
    return {
      subject: built.subject,
      body: wrap(built.inner, {
        locale: dripShellLocale(ctx.locale),
        preferencesUrl: ctx.unsubscribeUrl,
      }),
    };
  },
  CHECKLIST_DELIVERY: (ctx) => {
    const built = buildChecklistEmail({
      locale: ctx.locale,
      firstName: ctx.firstName,
      siteUrl,
      unsubscribeUrl: ctx.unsubscribeUrl,
    });
    return {
      subject: built.subject,
      body: wrap(built.inner, {
        locale: dripShellLocale(ctx.locale),
        preferencesUrl: ctx.unsubscribeUrl,
      }),
    };
  },
  POST_FORMATION_DAY_3: (ctx) => postFormationTemplate('DAY_3', ctx),
  POST_FORMATION_DAY_14: (ctx) => postFormationTemplate('DAY_14', ctx),
  POST_FORMATION_DAY_30: (ctx) => postFormationTemplate('DAY_30', ctx),
  WEEKLY_NEWSLETTER: (ctx) => {
    const issue = normalizeNewsletterIssue(ctx.newsletterIssue);
    const locale = newsletterDeliveryLocale(issue, dripShellLocale(ctx.locale));
    const built = buildNewsletterEmail({
      issue,
      locale,
      siteUrl,
      unsubscribeUrl: ctx.unsubscribeUrl ?? `${siteUrl}/unsubscribe`,
    });
    return {
      subject: built.subject,
      body: wrap(built.inner, { locale, preferencesUrl: ctx.unsubscribeUrl }),
    };
  },
  DRAFT_REENGAGE: ({
    firstName,
    businessName,
    entityType,
    stateName,
    stepsCompleted,
    readyForCheckout,
    resumeUrl,
    linkExpiresInDays,
  }) => {
    const rawCompany = businessName?.trim();
    const company = escapeHtml(rawCompany || 'Your new company');
    const entityLabel = entityType === 'CORP' ? 'Corporation' : 'LLC';
    const typeLabel = stateName ? `${escapeHtml(stateName)} ${entityLabel}` : entityLabel;
    const done = Math.min(stepsCompleted ?? 0, TOTAL_DISPLAYED_STEPS);
    return {
      subject: `${rawCompany ? `Your company ${rawCompany}` : 'Your new company'} is waiting for you`.replace(/[\r\n]+/g, ' '),
      body: html`
        <h1>${company} is waiting for you</h1>
        <p>Hi ${escapeHtml(firstName?.trim() || 'there')}, new adventures await. ${
          readyForCheckout
            ? "You've already done the hard part: every detail of your new company is filled in and saved. All that's left is checkout."
            : `Your progress is saved, with ${done} of ${TOTAL_DISPLAYED_STEPS} steps done. Pick up right where you left off.`
        }</p>
        <table class="meta">
          <tr><td>Company</td><td>${company}</td></tr>
          <tr><td>Type</td><td>${typeLabel}</td></tr>
          <tr><td>Progress</td><td>${
            readyForCheckout
              ? `${TOTAL_DISPLAYED_STEPS} of ${TOTAL_DISPLAYED_STEPS} steps · ready for checkout`
              : `${done} of ${TOTAL_DISPLAYED_STEPS} steps complete`
          }</td></tr>
        </table>
        <p>The time is now. Finish creating your new company today and we'll prepare and submit your filing to the state within 1 business day.</p>
        <a class="cta" href="${escapeHtml(resumeUrl ?? `${siteUrl}/dashboard`)}">Finish creating my company</a>
        <p class="muted">${
          linkExpiresInDays
            ? `This button signs you in automatically, no password needed. For your security it works once and expires in ${linkExpiresInDays} days. `
            : ''
        }Everything is saved exactly as you left it. Questions? Reply to this email or write <a href="mailto:help@launchforma.com">help@launchforma.com</a> and a real person will help.</p>
      `,
    };
  },
  RA_RENEWAL_60: (ctx) => raRenewalEmail(60, ctx),
  RA_RENEWAL_30: (ctx) => raRenewalEmail(30, ctx),
  RA_RENEWAL_7: (ctx) => raRenewalEmail(7, ctx),
  RA_RENEWED: ({ firstName, businessName, totalCents, dueDate }) => ({
    subject: `Registered Agent renewed for ${businessName ?? 'your business'}`,
    body: html`
      <h1>Registered Agent renewed - thank you</h1>
      <p>${firstName ?? 'Hi'} - we've renewed Registered Agent service for <strong>${businessName ?? 'your business'}</strong>${
        totalCents != null ? ` and charged <strong>${formatCurrency(totalCents)}</strong>` : ''
      }. Your in-state address stays active and your home address stays off the public record.</p>
      ${dueDate ? `<p class="muted">Your next renewal date is ${formatDateLong(dueDate)}.</p>` : ''}
      <a class="cta" href="${siteUrl}/dashboard/billing">View billing</a>
    `,
  }),
  EIN_ORDERED: ({ firstName, businessName, totalCents, resumeUrl }) => {
    const company = escapeHtml(businessName?.trim() || 'your company');
    return {
      subject: `EIN order received for ${businessName?.trim() || 'your company'}`.replace(/[\r\n]+/g, ' '),
      body: html`
        <h1>We received your EIN order</h1>
        <p>Hi ${escapeHtml(firstName?.trim() || 'there')}, thank you. We charged <strong>${formatCurrency(totalCents ?? 0)}</strong> to prepare and file IRS Form SS-4 for <strong>${company}</strong>.</p>
        <p>Next step: add the responsible-party details in your dashboard if you haven't yet. We file as soon as they're in and upload your EIN confirmation letter to your dashboard when the IRS issues it.</p>
        <a class="cta" href="${escapeHtml(resumeUrl ?? `${siteUrl}/dashboard`)}">Open my EIN order</a>
        <p class="muted">Questions? Reply to this email or write <a href="mailto:help@launchforma.com">help@launchforma.com</a>.</p>
      `,
    };
  },
  CERTIFICATE_ORDERED: (ctx) => certificateOrderedEmail(ctx),
  PAYMENT_CONFIRMATION: ({ businessName, totalCents, locale }) => {
    const spanish = locale === 'es';
    const dashboardUrl = localeUrl(locale, '/dashboard');
    const company = businessName?.trim() || (spanish ? 'tu empresa' : 'your business');
    const amount = totalCents != null ? formatCurrency(totalCents) : spanish ? 'tu tarjeta' : 'your card';
    if (spanish) {
      return {
        subject: `Pago confirmado para ${company}`,
        body: html`
          <h1>Recibimos tu pago. Gracias.</h1>
          <p>Recibimos tu pedido y estamos preparando tu registro. Cobramos <strong>${amount}</strong> por <strong>${company}</strong>.</p>
          <a class="cta" href="${dashboardUrl}">Ver el estado del trámite</a>
          <p class="muted">El recibo también queda en tu panel cuando termine el proceso.</p>
        `,
      };
    }
    return {
      subject: `Payment confirmed for ${company}`,
      body: html`
        <h1>Payment received - thank you</h1>
        <p>We received your order and are preparing your filing. We charged <strong>${amount}</strong> for <strong>${company}</strong>.</p>
        <a class="cta" href="${dashboardUrl}">View filing status</a>
        <p class="muted">A receipt is also available from your dashboard once processing finishes.</p>
      `,
    };
  },
  FILING_SUBMITTED: ({ businessName, trackingNumber, pin, resumeUrl, locale }) => {
    const spanish = locale === 'es';
    const statusUrl = resumeUrl ?? localeUrl(locale, '/dashboard');
    if (spanish) {
      const company = businessName ?? 'Tu empresa';
      return {
        subject: `Recibimos tu pedido para ${company}`,
        body: wrap(
          `
      <h1>Recibimos tu pedido</h1>
      <p>Recibimos tu pedido y estamos preparando tu registro.</p>
      <table class="meta">
        <tr><td>Referencia</td><td><code>${trackingNumber ?? '-'}</code></td></tr>
        <tr><td>PIN</td><td><code>${pin ?? '-'}</code></td></tr>
      </table>
      <p class="muted">Tu referencia y tu PIN identifican este trámite en tu panel de LaunchForma y cuando escribes a soporte. Las actualizaciones están en tu panel. No hay una página pública de seguimiento.</p>
      <a class="cta" href="${statusUrl}">Ver el estado del trámite</a>
    `,
          { locale: 'es', preferencesUrl: localeUrl('es', '/dashboard/settings') },
        ),
      };
    }
    return {
      subject: `We received your order for ${businessName ?? 'your business'}`,
      body: html`
      <h1>We received your order</h1>
      <p>We received your order and are preparing your filing.</p>
      <table class="meta">
        <tr><td>Reference #</td><td><code>${trackingNumber ?? '-'}</code></td></tr>
        <tr><td>PIN</td><td><code>${pin ?? '-'}</code></td></tr>
      </table>
      <p class="muted">Your reference # and PIN identify this filing in your LaunchForma dashboard (and on support requests). Status updates live in your dashboard - there isn't a separate public tracking page.</p>
      <a class="cta" href="${statusUrl}">View filing status</a>
    `,
    };
  },
  FILING_APPROVED: ({ businessName, filingNumber, locale }) => {
    if (locale === 'es') {
      const company = businessName ?? 'Tu empresa';
      const dashboardUrl = localeUrl('es', '/dashboard');
      return {
        subject: `${company} ya es oficial`,
        body: wrap(
          `
      <h1>Tu empresa ya es oficial</h1>
      <p>El estado aprobó <strong>${company}</strong>. Ya puedes descargar los documentos de formación.</p>
      <table class="meta">
        <tr><td>Número de trámite</td><td><code>${filingNumber ?? '-'}</code></td></tr>
      </table>
      <p>Revisa tu panel para ver qué sigue, abre una cuenta de banco para la empresa y guarda la fecha del informe anual. Te avisamos cuando se acerque.</p>
      <a class="cta" href="${dashboardUrl}">Descargar documentos</a>
    `,
          { locale: 'es', preferencesUrl: localeUrl('es', '/dashboard/settings') },
        ),
      };
    }
    return {
      subject: `${businessName ?? 'Your business'} is officially formed`,
      body: html`
      <h1>You're official - congrats!</h1>
      <p>The state has approved <strong>${businessName ?? 'your business'}</strong>. Your formation documents are ready to download.</p>
      <table class="meta">
        <tr><td>Filing #</td><td><code>${filingNumber ?? '-'}</code></td></tr>
      </table>
      <p>Next up: check your dashboard for next steps, open a business bank account, and keep your annual report deadline on the calendar - we'll remind you.</p>
      <a class="cta" href="${siteUrl}/dashboard">Download documents</a>
    `,
    };
  },
  FILING_REJECTED: ({ businessName, rejectionReason, locale }) => {
    if (locale === 'es') {
      const company = businessName ?? 'tu empresa';
      const dashboardUrl = localeUrl('es', '/dashboard');
      return {
        subject: `Acción necesaria: el trámite de ${company}`,
        body: wrap(
          `
      <h1>El estado pidió cambios</h1>
      <p>El estado pidió cambios en tu trámite.</p>
      <blockquote>${rejectionReason ?? 'Revisa tu panel para ver el detalle.'}</blockquote>
      <p>Lo volvemos a enviar. No hay una tarifa estatal extra.</p>
      <a class="cta" href="${dashboardUrl}">Ver el detalle</a>
    `,
          { locale: 'es', preferencesUrl: localeUrl('es', '/dashboard/settings') },
        ),
      };
    }
    return {
      subject: `Action needed: ${businessName ?? 'your business'} filing`,
      body: html`
      <h1>State requested changes</h1>
      <p>The state has requested changes to your filing.</p>
      <blockquote>${rejectionReason ?? 'See dashboard for details.'}</blockquote>
      <p>We'll handle the resubmission - no extra state fee.</p>
      <a class="cta" href="${siteUrl}/dashboard">View details</a>
    `,
    };
  },
  ANNUAL_REPORT_60: ({ businessName, dueDate }) => ({
    subject: `${businessName ?? 'Your business'}'s annual report is due ${dueDate ? formatDateLong(dueDate) : 'soon'}`,
    body: html`
      <h1>Annual report - 60 day reminder</h1>
      <p>Filing on time avoids non-waivable late fees. Have us file it for you in one click - your data is already on file.</p>
      <a class="cta" href="${siteUrl}/dashboard">File annual report</a>
    `,
  }),
  ANNUAL_REPORT_30: ({ businessName }) => ({
    subject: `${businessName ?? 'Your business'} annual report due in 30 days`,
    body: html`
      <h1>30 days until your annual report</h1>
      <p>Have us file it for you in one click - your data is already on file.</p>
      <a class="cta" href="${siteUrl}/dashboard">File annual report</a>
    `,
  }),
  ANNUAL_REPORT_FINAL: ({ businessName, daysUntilDue }) => ({
    subject: `URGENT: ${businessName ?? 'Your business'} annual report due in ${daysUntilDue ?? 3} days`,
    body: html`
      <h1>Final reminder</h1>
      <p>The late fee is non-waivable. Tap below and we'll file in 60 seconds.</p>
      <a class="cta" href="${siteUrl}/dashboard">File now</a>
    `,
  }),
  COMPLIANCE_ALERT: ({ businessName }) => ({
    subject: `Compliance update for ${businessName ?? 'your business'}`,
    body: html`
      <h1>Compliance alert</h1>
      <p>We noticed something that needs your attention - sign in to review.</p>
      <a class="cta" href="${siteUrl}/dashboard">Review now</a>
    `,
  }),
  GUEST_SET_PASSWORD: ({ firstName, resetUrl, locale, loginEmail }) => {
    const spanish = locale === 'es';
    const href = escapeHtml(resetUrl ?? '#');
    const name = escapeHtml(firstName?.trim() || '');
    const mailbox = escapeHtml(loginEmail?.trim() || '');
    if (spanish) {
      return {
        subject: 'Crea tu contraseña de LaunchForma',
        body: html`
          <h1>Crea tu contraseña</h1>
          <p>${name ? `Hola ${name}.` : 'Hola.'} Tu pago ya se completó. Este enlace crea la contraseña de tu cuenta${mailbox ? ` (${mailbox})` : ''} y abre tu trámite.</p>
          <a class="cta" href="${href}">Crear contraseña</a>
          <p class="muted">El enlace vence en 3 días y funciona una sola vez. Si no pagaste un trámite, ignora este correo.</p>
        `,
      };
    }
    const hello = name ? `Hi ${name}.` : 'Hi there.';
    return {
      subject: 'Set your LaunchForma password',
      body: html`
        <h1>Set your password</h1>
        <p>${hello} Your payment went through. This link sets a password for your account${mailbox ? ` (${mailbox})` : ''} and opens your filing.</p>
        <a class="cta" href="${href}">Set your password</a>
        <p class="muted">The link expires in 3 days and works once. If you did not pay for a filing, you can ignore this email.</p>
      `,
    };
  },
  CHECKOUT_LOGIN_LINK: ({ firstName, resumeUrl, locale, linkExpiresInDays }) => {
    const spanish = locale === 'es';
    const days = linkExpiresInDays ?? 3;
    const href = escapeHtml(resumeUrl ?? '#');
    const name = escapeHtml(firstName?.trim() || '');
    if (spanish) {
      return {
        subject: 'Tu enlace para entrar a LaunchForma',
        body: html`
          <h1>Tu enlace para pagar</h1>
          <p>${name ? `Hola ${name}.` : 'Hola.'} Tu trámite está guardado. Este enlace abre tu cuenta y te lleva al pago.</p>
          <a class="cta" href="${href}">Ir al pago</a>
          <p class="muted">El enlace vence en ${days} días y solo funciona una vez. Si no lo pediste, ignora este correo.</p>
        `,
      };
    }
    const hello = name ? `Hi ${name}.` : 'Hi there.';
    return {
      subject: 'Your LaunchForma sign-in link',
      body: html`
        <h1>Your link to checkout</h1>
        <p>${hello} Your filing is saved. This link signs you in and brings you back to payment.</p>
        <a class="cta" href="${href}">Continue to payment</a>
        <p class="muted">The link expires in ${days} days and works once. If you did not ask for it, you can ignore this email.</p>
      `,
    };
  },
  PASSWORD_RESET: ({ firstName, resetUrl }) => ({
    subject: 'Reset your LaunchForma password',
    body: html`
      <h1>Password reset request</h1>
      <p>Hi ${firstName ?? 'there'} - we received a request to reset the password for your LaunchForma account.</p>
      <a class="cta" href="${resetUrl ?? '#'}">Reset my password</a>
      <p class="muted">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email - your password won't change.</p>
    `,
  }),
  SERVICE_INQUIRY: (ctx) => {
    const cell = (value?: string) => escapeHtml(value?.trim() || 'Not provided');
    const message = ctx.inquiryMessage?.trim();
    const label = (ctx.inquiryService ?? 'business services').replace(/[\r\n]/g, ' ').slice(0, 80);
    const prefix = (ctx.inquirySubjectPrefix ?? '').replace(/[\r\n]/g, ' ').trim();
    const knownPrefix = prefix === '[Reinstatement]' || prefix === '[Late annual report]';
    const companyRows = knownPrefix
      ? `<tr><td>Sunbiz document number</td><td>${cell(ctx.inquirySunbizDocumentNumber)}</td></tr><tr><td>Company name</td><td>${cell(ctx.inquiryCompanyName)}</td></tr>`
      : '';
    return {
      subject: knownPrefix ? `${prefix} Service request: ${label}` : `Service request: ${label}`,
      body: html`
        <h1>New business-services request</h1>
        <p>Someone asked for a service from the ad landing page. Reply by phone or WhatsApp. Use email only when one is listed.</p>
        <table class="meta">
          <tr><td>Name</td><td>${cell(ctx.inquiryName)}</td></tr>
          <tr><td>Email</td><td>${cell(ctx.inquiryEmail)}</td></tr>
          <tr><td>Phone</td><td>${cell(ctx.inquiryPhone)}</td></tr>
          <tr><td>Service</td><td>${cell(ctx.inquiryService)}</td></tr>
          ${companyRows}
          <tr><td>Language</td><td>${cell(ctx.inquiryLocale)}</td></tr>
          <tr><td>utm_source</td><td>${cell(ctx.inquiryUtmSource)}</td></tr>
          <tr><td>utm_medium</td><td>${cell(ctx.inquiryUtmMedium)}</td></tr>
          <tr><td>utm_campaign</td><td>${cell(ctx.inquiryUtmCampaign)}</td></tr>
          <tr><td>utm_content</td><td>${cell(ctx.inquiryUtmContent)}</td></tr>
          <tr><td>utm_term</td><td>${cell(ctx.inquiryUtmTerm)}</td></tr>
          <tr><td>gclid</td><td>${cell(ctx.inquiryGclid)}</td></tr>
        </table>
        ${message ? `<p><strong>Message</strong><br/>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>` : ''}
      `,
    };
  },
  OA_TEMPLATE_CONFIRM: (ctx) => {
    const confirmUrl = escapeHtml(ctx.oaConfirmUrl ?? '#');
    const unsub = escapeHtml(ctx.oaUnsubscribeUrl ?? '#');
    const shell = localizedHtml(ctx);
    if (ctx.oaLocale === 'es') {
      return {
        subject: 'Confirma tu correo para la muestra del acuerdo operativo',
        body: shell`
          <h1>Confirma tu correo</h1>
          <p>Confirma tu dirección y te enviaremos los enlaces de descarga de la muestra de acuerdo operativo para LLC en Florida (un miembro y varios miembros, PDF y Word).</p>
          <a class="cta" href="${confirmUrl}">Confirmar mi correo</a>
          <p class="muted">La muestra es información general, no asesoría legal. Pide a un abogado que la revise antes de usarla.</p>
          <p class="muted"><a href="${unsub}">Darme de baja</a></p>
        `,
      };
    }
    return {
      subject: 'Confirm your email for the Florida LLC operating agreement sample',
      body: shell`
        <h1>Confirm your email</h1>
        <p>Confirm your email and we'll send the download links for the free Florida LLC operating agreement sample (single-member and multi-member, PDF and Word).</p>
        <a class="cta" href="${confirmUrl}">Confirm my email</a>
        <p class="muted">The sample is general information, not legal advice. Have an attorney review it before you use it.</p>
        <p class="muted"><a href="${unsub}">Unsubscribe</a></p>
      `,
    };
  },
  ANNUAL_REPORT_UNSAVED: (ctx) => ({
    subject: 'Annual report charged but not saved',
    body: html`
      <h1>Annual report charge needs a save</h1>
      <p>A customer was charged for an annual report, and the filing was not saved. If the charged amount matches the quote, ask them to submit the same page again. That retry uses the same payment and does not charge the card again. If the amounts differ, do not refund the card from this alert.</p>
      <p>${escapeHtml(ctx.unsavedChargeDetail?.trim() || 'No extra detail was recorded.')}</p>
    `,
  }),
  OA_TEMPLATE_DOWNLOAD: (ctx) => {
    const singlePdf = escapeHtml(ctx.oaSinglePdfUrl ?? '#');
    const singleDocx = escapeHtml(ctx.oaSingleDocxUrl ?? '#');
    const multiPdf = escapeHtml(ctx.oaMultiPdfUrl ?? '#');
    const multiDocx = escapeHtml(ctx.oaMultiDocxUrl ?? '#');
    const unsub = escapeHtml(ctx.oaUnsubscribeUrl ?? '#');
    const shell = localizedHtml(ctx);
    if (ctx.oaLocale === 'es') {
      return {
        subject: 'Tu muestra de acuerdo operativo de LLC en Florida',
        body: shell`
          <h1>Tu muestra está lista</h1>
          <p>Aquí están las muestras gratis del acuerdo operativo para una LLC en Florida.</p>
          <p><a href="${singlePdf}">PDF de un miembro</a></p>
          <p><a href="${singleDocx}">Word de un miembro</a></p>
          <p><a href="${multiPdf}">PDF de varios miembros</a></p>
          <p><a href="${multiDocx}">Word de varios miembros</a></p>
          <p class="muted">La muestra es información general, no asesoría legal. Pide a un abogado que la revise antes de usarla. LaunchForma no es un despacho de abogados.</p>
          <p class="muted"><a href="${unsub}">Darme de baja</a></p>
        `,
      };
    }
    return {
      subject: 'Your Florida LLC operating agreement sample',
      body: shell`
        <h1>Your sample is ready</h1>
        <p>Here are the free Florida LLC operating agreement samples.</p>
        <p><a href="${singlePdf}">Single-member PDF</a></p>
        <p><a href="${singleDocx}">Single-member Word</a></p>
        <p><a href="${multiPdf}">Multi-member PDF</a></p>
        <p><a href="${multiDocx}">Multi-member Word</a></p>
        <p class="muted">The sample is general information, not legal advice. Have an attorney review it before you use it. LaunchForma is not a law firm.</p>
        <p class="muted"><a href="${unsub}">Unsubscribe</a></p>
      `,
    };
  },
  ADMIN_PAID_ORDER: (ctx) => adminOrderEmail(ctx, 'paid'),
  ADMIN_FILING_OVERDUE: (ctx) => adminOrderEmail(ctx, 'overdue'),
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function adminOrderEmail(ctx: EmailContext, kind: 'paid' | 'overdue') {
  const name = ctx.businessName?.trim() || 'Untitled filing';
  const deadline = ctx.deadlineLabel?.trim() || '';
  const prefix = ctx.testOrder ? '[TEST] ' : '';
  const overdueWord = ctx.overdueKind === 'overdue' ? 'Overdue' : 'Overdue soon';
  const subject = (
    kind === 'paid'
      ? `${prefix}New paid order: ${name} (file by ${deadline})`
      : `${prefix}${overdueWord}: ${name} (file by ${deadline})`
  ).replace(/[\r\n]+/g, ' ');
  const heading = kind === 'paid' ? `${prefix}New paid order` : `${prefix}${overdueWord}`;
  const intro =
    kind === 'paid'
      ? 'Payment succeeded. File this order by the deadline below.'
      : 'This paid order still has no state filing number.';
  const row = (label: string, value: string) =>
    `<tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`;
  const documentNumber = ctx.annualReportDocumentNumber?.trim();
  const annualReportNote =
    kind === 'paid' && typeof ctx.annualReportDocumentNumber === 'string'
      ? `<blockquote><strong>${escapeHtml(LIVE_SUNBIZ_FILING_WARNING)}</strong></blockquote>${
          documentNumber
            ? `<p><a href="${escapeHtml(sunbizDocumentSearchUrl(documentNumber))}">Search ${escapeHtml(documentNumber)} on Sunbiz</a></p>`
            : ''
        }`
      : '';
  return {
    subject,
    body: html`
      ${annualReportNote}
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(intro)}</p>
      <table class="meta">
        ${row('Filing id', `<code>${escapeHtml(ctx.linkFilingId ?? '')}</code>`)}
        ${row('Business', escapeHtml(name))}
        ${row('Customer', escapeHtml(ctx.customerName?.trim() || ''))}
        ${row('Email', escapeHtml(ctx.customerEmail?.trim() || ''))}
        ${row('State', escapeHtml(ctx.orderState?.trim() || ''))}
        ${row('Entity', escapeHtml(ctx.orderEntity?.trim() || ''))}
        ${row('Plan', escapeHtml(ctx.orderPlan?.trim() || ''))}
        ${row('Amount paid', escapeHtml(ctx.totalCents != null ? formatCurrency(ctx.totalCents) : ''))}
        ${row('Paid', escapeHtml(ctx.paidAtLabel ?? ''))}
        ${row('File by', escapeHtml(deadline))}
      </table>
      <a class="cta" href="${escapeHtml(ctx.adminFilingUrl ?? '')}">Open filing</a>
    `,
  };
}

/** First line of a paid annual report alert. Filing with the state is manual. */
export const LIVE_SUNBIZ_FILING_WARNING =
  "Before filing, check the company on live Sunbiz. If this year's annual report is already filed, do not file and refund the customer.";

export function sunbizDocumentSearchUrl(documentNumber: string): string {
  return (
    'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults' +
    `?inquiryType=DocumentNumber&searchTerm=${encodeURIComponent(documentNumber.trim())}`
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function html(strings: TemplateStringsArray, ...vars: unknown[]) {
  let result = '';
  strings.forEach((str, i) => {
    result += str + (vars[i] !== undefined ? String(vars[i] ?? '') : '');
  });
  return wrap(result);
}

function dripShellLocale(locale: string | null | undefined): DripLocale {
  return locale === 'es' ? 'es' : 'en';
}

/** OA mail has no account, so the footer preferences link is the unsubscribe URL. */
function localizedHtml(ctx: EmailContext) {
  const locale = ctx.oaLocale === 'es' ? 'es' : 'en';
  const preferencesUrl = ctx.oaUnsubscribeUrl;
  return (strings: TemplateStringsArray, ...vars: unknown[]) => {
    let result = '';
    strings.forEach((str, i) => {
      result += str + (vars[i] !== undefined ? String(vars[i] ?? '') : '');
    });
    return wrap(result, { locale, preferencesUrl });
  };
}

function wrap(
  inner: string,
  options: { locale?: DripLocale; preferencesUrl?: string } = {},
) {
  const copy = emailShellCopy(options.locale === 'es' ? 'es' : 'en');
  // Modern transactional shell: full-bleed canvas, white card, brand blue
  // CTA matching the live site (#1565FF). Table-based for Outlook safety.
  const preferencesHref = options.preferencesUrl
    ? escapeHtml(options.preferencesUrl)
    : `${siteUrl}/dashboard/settings`;
  return `<!doctype html>
<html lang="${copy.lang}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>LaunchForma</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block}
    body{margin:0!important;padding:0!important;width:100%!important;background:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1F2B}
    a{color:#1565FF;text-decoration:none}
    .wrapper{width:100%;background:#F2F4F7;padding:32px 12px}
    .card{max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06)}
    .brand-bar{height:4px;background:linear-gradient(90deg,#1565FF 0%,#4CAF50 100%)}
    .header{padding:28px 32px 8px;text-align:left}
    .logo-mark{display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background:#1565FF;border-radius:10px;color:#fff;font-weight:800;font-size:14px;letter-spacing:-.4px;vertical-align:middle}
    .logo-text{display:inline-block;margin-left:10px;font-size:18px;font-weight:700;color:#1A1F2B;letter-spacing:-.3px;vertical-align:middle}
    .body{padding:8px 32px 28px}
    h1{font-size:24px;font-weight:650;line-height:1.25;margin:0 0 12px;color:#1A1F2B;letter-spacing:-.4px}
    p{font-size:15px;line-height:1.65;color:#475467;margin:0 0 14px}
    .cta{display:inline-block;background:#1565FF;color:#ffffff!important;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;margin:6px 0 14px;box-shadow:0 1px 2px rgba(21,101,255,.25)}
    .muted{color:#98A2B3;font-size:13px;line-height:1.5}
    .panel{margin:16px 0;padding:14px 16px;border:1px solid #E4E7EC;border-radius:12px;background:#F9FAFB}
    .panel code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
    table.meta{width:100%;border-collapse:collapse;margin:14px 0;border:1px solid #E4E7EC;border-radius:12px;overflow:hidden}
    table.meta td{padding:10px 14px;font-size:14px;border-bottom:1px solid #E4E7EC}
    table.meta tr:last-child td{border-bottom:none}
    table.meta td:first-child{color:#667085;font-weight:500;width:42%}
    table.meta td:last-child{color:#1A1F2B;font-weight:600}
    code{background:#F2F4F7;padding:2px 8px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#1A1F2B}
    blockquote{border-left:3px solid #F79009;padding:10px 14px;margin:16px 0;background:#FFFAEB;color:#7A2E0E;border-radius:0 10px 10px 0}
    .footer{max-width:560px;margin:20px auto 0;padding:0 8px;text-align:center}
    .footer p{color:#98A2B3;font-size:12px;line-height:1.55;margin:0 0 6px}
    @media only screen and (max-width:600px){
      .header,.body{padding-left:20px!important;padding-right:20px!important}
      h1{font-size:22px!important}
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="brand-bar"></div>
      <div class="header">
        <a href="${siteUrl}" style="text-decoration:none;color:inherit">
          <span class="logo-mark">LF</span>
          <span class="logo-text">LaunchForma</span>
        </a>
      </div>
      <div class="body">
        ${inner}
      </div>
    </div>
    <div class="footer">
      <p>LaunchForma · ${copy.tagline}</p>
      <p>
        ${copy.questions} <a href="mailto:help@launchforma.com" style="color:#667085;text-decoration:underline">help@launchforma.com</a>
        · <a href="${preferencesHref}" style="color:#667085;text-decoration:underline">${copy.preferences}</a>
      </p>
      <p>© ${new Date().getFullYear()} ${BUSINESS_LEGAL_NAME} · ${BUSINESS_ADDRESS} · ${copy.notALawFirm}</p>
    </div>
  </div>
</body>
</html>`;
}

function postFormationTemplate(
  step: PostFormationStepId,
  ctx: EmailContext,
): { subject: string; body: string } {
  const locale = dripShellLocale(ctx.locale);
  const built = buildPostFormationEmail({
    step,
    locale,
    firstName: ctx.firstName,
    businessName: ctx.businessName,
    filingId: ctx.linkFilingId ?? '',
    siteUrl,
    unsubscribeUrl: ctx.unsubscribeUrl ?? `${siteUrl}/unsubscribe`,
  });
  return {
    subject: built.subject,
    body: wrap(built.inner, { locale, preferencesUrl: ctx.unsubscribeUrl }),
  };
}

function resumeDripTemplate(
  step: ResumeStepId,
  ctx: EmailContext,
): { subject: string; body: string } {
  const built = buildResumeEmail({
    step,
    locale: ctx.locale,
    firstName: ctx.firstName,
    resumeUrl: ctx.resumeUrl ?? `${siteUrl}/dashboard`,
    unsubscribeUrl: ctx.unsubscribeUrl,
  });
  return {
    subject: built.subject,
    body: decorateResumeEmailHtml(wrap(built.inner, { locale: dripShellLocale(ctx.locale) }), step),
  };
}

// ─── Public helper - render a template without sending ────────────────────────

export function renderTemplate(
  type: NotificationType,
  ctx: Parameters<typeof TEMPLATES[NotificationType]>[0] = {},
): { subject: string; html: string } {
  const tpl = TEMPLATES[type];
  if (!tpl) throw new Error(`Unknown email type: ${type}`);
  const { subject, body } = tpl(ctx);
  return { subject, html: body };
}

// ─── Sender ───────────────────────────────────────────────────────────────────
//
// Priority order (first matching provider wins):
//   1. RESEND_API_KEY  → Resend (recommended; 3 000 free/mo)
//   2. SMTP_HOST + SMTP_USER + SMTP_PASS → Nodemailer (Google Workspace, etc.)
//   3. Neither → console-only (local dev / CI)
//
// Google Workspace SMTP quick-start:
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_USER=admin@launchforma.com
//   SMTP_PASS=<16-char App Password from myaccount.google.com/apppasswords>
//   EMAIL_FROM=LaunchForma <admin@launchforma.com>

const FROM = process.env.EMAIL_FROM ?? 'LaunchForma <no-reply@launchforma.com>';

/** Pause between marketing sends in one cron run so SMTP is not flooded. */
export const MARKETING_SEND_GAP_MS = 200;

export function waitBetweenMarketingSends(ms = MARKETING_SEND_GAP_MS): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SmtpSender = {
  sendMail: (message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }) => Promise<unknown>;
};

/** One SMTP connection for the life of this server instance (one cron run). */
let smtpTransportPromise: Promise<SmtpSender> | null = null;

async function sharedSmtpTransport(host: string, user: string, pass: string): Promise<SmtpSender> {
  if (!smtpTransportPromise) {
    const nodemailer = await import('nodemailer');
    smtpTransportPromise = Promise.resolve(
      nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
      }),
    );
  }
  return smtpTransportPromise;
}

interface DeliveryOptions {
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function deliverEmailDirect(to: string, subject: string, html: string) {
  return deliverEmail(to, subject, html);
}

async function deliverEmail(
  to: string,
  subject: string,
  html: string,
  options?: DeliveryOptions,
): Promise<{ ok: true }> {
  if (!isDeliverableEmail(to)) {
    throw new Error('Invalid recipient address.');
  }

  // QA and end-to-end fixtures (local part qa+ or e2e+, any case) are not
  // handed to Resend or SMTP. Transactional, drip, and abandoned-cart mail
  // all reach this helper, as does direct delivery. Callers treat the return
  // as a successful send.
  if (isQaOrE2eRecipient(to)) {
    console.log(`[email] skipped test recipient: ${normalizeEmail(to)}`);
    return { ok: true };
  }

  const resendKey = process.env.RESEND_API_KEY;
  const smtpHost  = process.env.SMTP_HOST;
  const smtpUser  = process.env.SMTP_USER;
  const smtpPass  = process.env.SMTP_PASS;

  if (resendKey) {
    // ── Option 1: Resend ──────────────────────────────────────────────────
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options?.headers ? { headers: options.headers } : {}),
    });
    if (error) {
      console.error('[email] Resend error:', error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
    return { ok: true };
  }

  if (smtpHost && smtpUser && smtpPass) {
    // ── Option 2: SMTP (Google Workspace, etc.) ───────────────────────────
    // Reuse one transport for every message in this process, including a
    // cron run that sends the newsletter and the post-formation series.
    const transporter = await sharedSmtpTransport(smtpHost, smtpUser, smtpPass);
    await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options?.headers ? { headers: options.headers } : {}),
    });
    return { ok: true };
  }

  // ── Option 3: console only (dev / no credentials) ─────────────────────
  console.log(`[email] → ${to} | "${subject}" (no RESEND_API_KEY or SMTP_* set)`);
  return { ok: true };
}

/** True when at least one real delivery provider is configured. */
export function isEmailDeliveryConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  );
}

export async function sendEmail(args: SendEmailArgs) {
  const tpl = TEMPLATES[args.type];
  if (!tpl) throw new Error(`Unknown email type: ${args.type}`);
  const { subject, body } = tpl(args.context ?? {});
  const recipient = typeof args.to === 'string' ? args.to.trim() : '';
  const templateName = args.type.toLowerCase();

  async function save(data: {
    status: string;
    errorMessage?: string;
    recipientEmail: string;
    attemptCount?: number;
  }) {
    const payload = {
      recipientEmail: data.recipientEmail,
      subject,
      templateName,
      htmlBody: body,
      status: data.status,
      ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
      ...(data.attemptCount !== undefined ? { attemptCount: data.attemptCount } : {}),
    };
    if (args.notificationId) {
      return prisma.emailNotification.update({
        where: { id: args.notificationId },
        data: payload,
      });
    }
    return prisma.emailNotification.create({
      data: {
        ...payload,
        notificationType: args.type,
        filingId: args.filingId,
        userId: args.userId,
        ...(args.step
          ? { step: args.step }
          : isResumeDripType(args.type)
            ? { step: args.type }
            : {}),
      },
    });
  }

  if (!isDeliverableEmail(recipient)) {
    const msg = 'Invalid recipient address.';
    console.error(`[email] skipped invalid recipient: ${JSON.stringify(args.to)}`);
    const record = await save({
      status: 'FAILED',
      errorMessage: msg,
      recipientEmail: recipient.slice(0, 320) || '(invalid)',
      ...(args.notificationId ? { attemptCount: RESUME_DRIP_MAX_ATTEMPTS } : {}),
    });
    return { ...record, status: 'FAILED', errorMessage: msg };
  }

  // Test fixtures return success from deliverEmail without a provider. Skip
  // the suppression lookup and the "no provider" failure so every caller
  // (transactional, drip, abandoned-cart) records a successful skip.
  const testRecipient = isQaOrE2eRecipient(recipient);

  if (!testRecipient) {
    const suppressed = await prisma.emailSuppression.findUnique({
      where: { email: normalizeEmail(recipient) },
      select: { id: true },
    });
    if (suppressed) {
      const msg = 'Recipient is on the suppression list.';
      console.warn(`[email] skipped suppressed recipient: ${normalizeEmail(recipient)}`);
      const record = await save({
        status: 'FAILED',
        errorMessage: msg,
        recipientEmail: recipient,
        ...(args.notificationId ? { attemptCount: RESUME_DRIP_MAX_ATTEMPTS } : {}),
      });
      return { ...record, status: 'FAILED', errorMessage: msg };
    }
  }

  // Persist to DB first so the admin Outbox always has a record. We start in
  // QUEUED and only flip to SENT once delivery actually succeeds - this keeps
  // the Outbox honest (the previous version marked everything SENT up front,
  // which hid every delivery failure, including silent "no provider" drops).
  // A resume claim already inserted PENDING, so that path updates the same row.
  const record = args.notificationId
    ? {
        id: args.notificationId,
        status: 'PENDING' as const,
        recipientEmail: recipient,
        subject,
        htmlBody: body,
      }
    : await save({ status: 'QUEUED', recipientEmail: recipient });

  // No provider configured → record FAILED with a clear reason instead of
  // pretending it was sent. This surfaces a misconfigured production
  // environment instead of silently swallowing mail. Attempt count stays
  // put so a later run can retry a resume claim.
  if (!testRecipient && !isEmailDeliveryConfigured()) {
    const msg =
      'No email provider configured (set RESEND_API_KEY or SMTP_HOST/USER/PASS).';
    console.error(`[email] NOT DELIVERED → ${recipient} | "${subject}" | ${msg}`);
    await prisma.emailNotification.update({
      where: { id: record.id },
      data: { status: 'FAILED', errorMessage: msg },
    });
    return { ...record, status: 'FAILED', errorMessage: msg };
  }

  // Attempt real delivery and record the true outcome. We deliberately await
  // so the status reflects reality; delivery errors are caught (not rethrown)
  // so a transient mail outage never breaks the calling user action.
  const replyTo = args.replyTo?.trim() || undefined;
  const headers = args.listUnsubscribeUrl
    ? listUnsubscribeHeaders(args.listUnsubscribeUrl)
    : undefined;

  try {
    await deliverEmail(recipient, subject, body, { replyTo, headers });
    if (testRecipient) {
      await prisma.emailNotification.update({
        where: { id: record.id },
        data: {
          status: EMAIL_STATUS_SKIPPED_TEST,
          subject,
          htmlBody: body,
          recipientEmail: recipient,
        },
      });
      return {
        ...record,
        status: EMAIL_STATUS_SKIPPED_TEST,
        sentAt: null,
        errorMessage: null as string | null,
      };
    }
    const sentAt = new Date();
    await prisma.emailNotification.update({
      where: { id: record.id },
      data: { status: 'SENT', sentAt, subject, htmlBody: body, recipientEmail: recipient },
    });
    return { ...record, status: 'SENT', sentAt, errorMessage: null as string | null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[email] delivery failed:', errorMessage);
    await prisma.emailNotification.update({
      where: { id: record.id },
      data: { status: 'FAILED', errorMessage },
    });
    return { ...record, status: 'FAILED', errorMessage };
  }
}
