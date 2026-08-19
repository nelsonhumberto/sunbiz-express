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
import { RA_RENEWAL_PRICE_CENTS } from './pricing';
import { formatCurrency, formatDateLong } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'WELCOME'
  | 'FILING_STARTED'
  | 'ABANDONED_24H'
  | 'ABANDONED_72H'
  | 'ABANDONED_7D'
  | 'RA_RENEWAL_60'
  | 'RA_RENEWAL_30'
  | 'RA_RENEWAL_7'
  | 'RA_RENEWED'
  | 'PAYMENT_CONFIRMATION'
  | 'FILING_SUBMITTED'
  | 'FILING_APPROVED'
  | 'FILING_REJECTED'
  | 'ANNUAL_REPORT_60'
  | 'ANNUAL_REPORT_30'
  | 'ANNUAL_REPORT_FINAL'
  | 'COMPLIANCE_ALERT'
  | 'PASSWORD_RESET';

interface EmailContext {
  firstName?: string;
  businessName?: string;
  entityType?: 'LLC' | 'CORP';
  totalCents?: number;
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
}

export interface SendEmailArgs {
  type: NotificationType;
  to: string;
  filingId?: string;
  userId?: string;
  context?: EmailContext;
}

// ─── Templates ───────────────────────────────────────────────────────────────

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

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

const TEMPLATES: Record<
  NotificationType,
  (ctx: EmailContext) => { subject: string; body: string }
> = {
  WELCOME: ({ firstName, tempPassword, loginEmail }) => ({
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
          <a class="cta" href="${siteUrl}/sign-in">Sign in to my dashboard</a>
          <p class="muted">Need a hand? Reply to this email or write <a href="mailto:help@launchforma.com">help@launchforma.com</a> - a real person will help.</p>
        `
      : html`
          <h1>Welcome aboard, ${firstName ?? 'there'}</h1>
          <p>You're moments away from forming your business. When you're ready, your dashboard is waiting - no busywork, one clear price.</p>
          <a class="cta" href="${siteUrl}/dashboard">Go to dashboard</a>
          <p class="muted">Questions? Reply anytime or email <a href="mailto:help@launchforma.com">help@launchforma.com</a>.</p>
        `,
  }),
  FILING_STARTED: ({ firstName, businessName, resumeUrl }) => ({
    subject: `Your filing for ${businessName ?? 'your business'} is started`,
    body: html`
      <h1>Filing started</h1>
      <p>Hi ${firstName ?? 'there'} - we've saved your progress. Pick up exactly where you left off.</p>
      <a class="cta" href="${resumeUrl ?? `${siteUrl}/dashboard`}">Resume Filing</a>
    `,
  }),
  ABANDONED_24H: ({ firstName, businessName, resumeUrl }) => ({
    subject: `Continue forming ${businessName ?? 'your business'} - pick up where you left off`,
    body: html`
      <h1>Almost there, ${firstName ?? 'there'}</h1>
      <p>Your draft for <strong>${businessName ?? 'your business'}</strong> is saved. Finish today and we submit to the state the same business day.</p>
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
      <p class="muted">We'll prepare and submit your Articles to the state the same business day you complete checkout.</p>
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
  PAYMENT_CONFIRMATION: ({ businessName, totalCents }) => ({
    subject: `Payment confirmed for ${businessName ?? 'your business'}`,
    body: html`
      <h1>Payment received - thank you</h1>
      <p>We charged <strong>${totalCents != null ? formatCurrency(totalCents) : 'your card'}</strong> for <strong>${businessName ?? 'your business'}</strong>. Your filing is being prepared and submitted to the state now.</p>
      <a class="cta" href="${siteUrl}/dashboard">View filing status</a>
      <p class="muted">A receipt is also available from your dashboard once processing finishes.</p>
    `,
  }),
  FILING_SUBMITTED: ({ businessName, trackingNumber, pin, resumeUrl }) => ({
    subject: `${businessName ?? 'Your business'} has been submitted to the state`,
    body: html`
      <h1>Your filing is with the state</h1>
      <p><strong>${businessName ?? 'Your business'}</strong> has been submitted. We'll email you the moment it's approved - usually within 1–2 business days.</p>
      <table class="meta">
        <tr><td>Reference #</td><td><code>${trackingNumber ?? '-'}</code></td></tr>
        <tr><td>PIN</td><td><code>${pin ?? '-'}</code></td></tr>
      </table>
      <p class="muted">Your reference # and PIN identify this filing in your LaunchForma dashboard (and on support requests). Status updates live in your dashboard - there isn't a separate public tracking page.</p>
      <a class="cta" href="${resumeUrl ?? `${siteUrl}/dashboard`}">View filing status</a>
    `,
  }),
  FILING_APPROVED: ({ businessName, filingNumber }) => ({
    subject: `${businessName ?? 'Your business'} is officially formed`,
    body: html`
      <h1>You're official - congrats!</h1>
      <p>The state has approved <strong>${businessName ?? 'your business'}</strong>. Your formation documents are ready to download.</p>
      <table class="meta">
        <tr><td>Filing #</td><td><code>${filingNumber ?? '-'}</code></td></tr>
      </table>
      <p>Next up: open a business bank account, confirm your EIN, and keep your annual report deadline on the calendar - we'll remind you.</p>
      <a class="cta" href="${siteUrl}/dashboard">Download documents</a>
    `,
  }),
  FILING_REJECTED: ({ businessName, rejectionReason }) => ({
    subject: `Action needed: ${businessName ?? 'your business'} filing`,
    body: html`
      <h1>State requested changes</h1>
      <p>The state has requested changes to your filing.</p>
      <blockquote>${rejectionReason ?? 'See dashboard for details.'}</blockquote>
      <p>We'll handle the resubmission - no extra state fee.</p>
      <a class="cta" href="${siteUrl}/dashboard">View details</a>
    `,
  }),
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
  PASSWORD_RESET: ({ firstName, resetUrl }) => ({
    subject: 'Reset your LaunchForma password',
    body: html`
      <h1>Password reset request</h1>
      <p>Hi ${firstName ?? 'there'} - we received a request to reset the password for your LaunchForma account.</p>
      <a class="cta" href="${resetUrl ?? '#'}">Reset my password</a>
      <p class="muted">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email - your password won't change.</p>
    `,
  }),
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function html(strings: TemplateStringsArray, ...vars: unknown[]) {
  let result = '';
  strings.forEach((str, i) => {
    result += str + (vars[i] !== undefined ? String(vars[i] ?? '') : '');
  });
  return wrap(result);
}

function wrap(inner: string) {
  // Modern transactional shell: full-bleed canvas, white card, brand blue
  // CTA matching the live site (#1565FF). Table-based for Outlook safety.
  return `<!doctype html>
<html lang="en">
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
      <p>LaunchForma · Form your business the honest way</p>
      <p>
        Questions? <a href="mailto:help@launchforma.com" style="color:#667085;text-decoration:underline">help@launchforma.com</a>
        · <a href="${siteUrl}/dashboard/settings" style="color:#667085;text-decoration:underline">Email preferences</a>
      </p>
      <p>© ${new Date().getFullYear()} LaunchForma, Inc. · Not a law firm</p>
    </div>
  </div>
</body>
</html>`;
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

export async function deliverEmailDirect(to: string, subject: string, html: string) {
  return deliverEmail(to, subject, html);
}

async function deliverEmail(to: string, subject: string, html: string) {
  const resendKey = process.env.RESEND_API_KEY;
  const smtpHost  = process.env.SMTP_HOST;
  const smtpUser  = process.env.SMTP_USER;
  const smtpPass  = process.env.SMTP_PASS;

  if (resendKey) {
    // ── Option 1: Resend ──────────────────────────────────────────────────
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error('[email] Resend error:', error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
    return;
  }

  if (smtpHost && smtpUser && smtpPass) {
    // ── Option 2: SMTP (Google Workspace, etc.) ───────────────────────────
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({ from: FROM, to, subject, html });
    return;
  }

  // ── Option 3: console only (dev / no credentials) ─────────────────────
  console.log(`[email] → ${to} | "${subject}" (no RESEND_API_KEY or SMTP_* set)`);
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

  // Persist to DB first so the admin Outbox always has a record. We start in
  // QUEUED and only flip to SENT once delivery actually succeeds - this keeps
  // the Outbox honest (the previous version marked everything SENT up front,
  // which hid every delivery failure, including silent "no provider" drops).
  const record = await prisma.emailNotification.create({
    data: {
      notificationType: args.type,
      recipientEmail: args.to,
      subject,
      templateName: args.type.toLowerCase(),
      htmlBody: body,
      status: 'QUEUED',
      filingId: args.filingId,
      userId: args.userId,
    },
  });

  // No provider configured → leave the record as QUEUED with a clear reason
  // instead of pretending it was sent. This is what surfaces a misconfigured
  // production environment instead of silently swallowing mail.
  if (!isEmailDeliveryConfigured()) {
    const msg =
      'No email provider configured (set RESEND_API_KEY or SMTP_HOST/USER/PASS).';
    console.error(`[email] NOT DELIVERED → ${args.to} | "${subject}" | ${msg}`);
    await prisma.emailNotification.update({
      where: { id: record.id },
      data: { status: 'FAILED', errorMessage: msg },
    });
    return { ...record, status: 'FAILED', errorMessage: msg };
  }

  // Attempt real delivery and record the true outcome. We deliberately await
  // so the status reflects reality; delivery errors are caught (not rethrown)
  // so a transient mail outage never breaks the calling user action.
  try {
    await deliverEmail(args.to, subject, body);
    const sentAt = new Date();
    await prisma.emailNotification.update({
      where: { id: record.id },
      data: { status: 'SENT', sentAt },
    });
    return { ...record, status: 'SENT', sentAt };
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
