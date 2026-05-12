/**
 * Email service — uses Resend when RESEND_API_KEY is set, otherwise logs
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

const TEMPLATES: Record<
  NotificationType,
  (ctx: EmailContext) => { subject: string; body: string }
> = {
  WELCOME: ({ firstName }) => ({
    subject: 'Welcome to LaunchForma ☀️',
    body: html`
      <h1>Welcome, ${firstName ?? 'there'}!</h1>
      <p>You're moments away from forming your business. We've cleared the runway — when you're ready, your dashboard is waiting.</p>
      <a class="cta" href="${siteUrl}/dashboard">Go to Dashboard</a>
      <p class="muted">Need a hand? Reply to this email or write us at <a href="mailto:help@launchforma.com">help@launchforma.com</a> and a real person will help.</p>
    `,
  }),
  FILING_STARTED: ({ firstName, businessName }) => ({
    subject: `Your filing for ${businessName ?? 'your business'} is started`,
    body: html`
      <h1>Filing started</h1>
      <p>Hi ${firstName ?? 'there'} — we've saved your progress. Pick up exactly where you left off.</p>
      <a class="cta" href="${siteUrl}/dashboard">Resume Filing</a>
    `,
  }),
  ABANDONED_24H: ({ firstName, businessName }) => ({
    subject: `Continue forming ${businessName ?? 'your business'} — pick up where you left off`,
    body: html`
      <h1>Almost there, ${firstName ?? 'there'}</h1>
      <p>Your draft for <strong>${businessName ?? 'your business'}</strong> is saved. Finish today and we submit to the state the same business day.</p>
      <a class="cta" href="${siteUrl}/dashboard">Resume Filing</a>
      <p class="muted">Most owners finish in 5 minutes from where you left off.</p>
    `,
  }),
  ABANDONED_72H: ({ firstName, businessName }) => ({
    subject: `Your business name isn't reserved until you file`,
    body: html`
      <h1>Your name isn't locked in yet</h1>
      <p>${firstName ?? 'Hi'} — states only reserve a business name once your formation is filed. Anyone else can claim it in the meantime.</p>
      <a class="cta" href="${siteUrl}/dashboard">Finish my filing</a>
      <p class="muted">We'll prepare and submit your Articles to the state the same business day you complete checkout.</p>
    `,
  }),
  ABANDONED_7D: ({ firstName, businessName }) => ({
    subject: `Need a hand finishing ${businessName ?? 'your business'}?`,
    body: html`
      <h1>Stuck on a step?</h1>
      <p>${firstName ?? 'Hi'} — your draft is still saved. If something is unclear, reply to this email and a specialist will walk you through the rest. No charge.</p>
      <a class="cta" href="${siteUrl}/dashboard">Resume Filing</a>
    `,
  }),
  RA_RENEWAL_60: ({ businessName }) => ({
    subject: `Your Registered Agent for ${businessName ?? 'your business'} renews in 60 days`,
    body: html`
      <h1>Heads up — RA renewal in 60 days</h1>
      <p>Your free Year-1 Registered Agent service for <strong>${businessName ?? 'your business'}</strong> is approaching its first anniversary. Renewal is $149/year and keeps your home address off the public state record.</p>
      <a class="cta" href="${siteUrl}/dashboard">Manage Registered Agent</a>
    `,
  }),
  RA_RENEWAL_30: ({ businessName }) => ({
    subject: `RA renewal in 30 days for ${businessName ?? 'your business'}`,
    body: html`
      <h1>30 days until Registered Agent renewal</h1>
      <p>Cancel anytime if you've found another agent. Otherwise we'll keep accepting service of process for you starting on your renewal date.</p>
      <a class="cta" href="${siteUrl}/dashboard">Review renewal</a>
    `,
  }),
  RA_RENEWAL_7: ({ businessName }) => ({
    subject: `Final notice: RA renewal in 7 days for ${businessName ?? 'your business'}`,
    body: html`
      <h1>RA renewal in 7 days</h1>
      <p>If we don't hear from you, we'll renew Registered Agent service for ${businessName ?? 'your business'} for another year so you don't lose coverage.</p>
      <a class="cta" href="${siteUrl}/dashboard">Manage renewal</a>
    `,
  }),
  PAYMENT_CONFIRMATION: ({ businessName, totalCents }) => ({
    subject: `Payment confirmed for ${businessName ?? 'your business'}`,
    body: html`
      <h1>Payment received</h1>
      <p>We charged your card ${totalCents != null ? formatCurrency(totalCents) : ''}. Your filing is being submitted to the state now.</p>
      <a class="cta" href="${siteUrl}/dashboard">View filing status</a>
    `,
  }),
  FILING_SUBMITTED: ({ businessName, trackingNumber, pin }) => ({
    subject: `${businessName ?? 'Your business'} has been submitted to the state`,
    body: html`
      <h1>Filing submitted</h1>
      <p>The state is processing your filing. We'll email you the moment it's approved.</p>
      <table>
        <tr><td>Tracking #</td><td><code>${trackingNumber ?? '—'}</code></td></tr>
        <tr><td>PIN</td><td><code>${pin ?? '—'}</code></td></tr>
      </table>
      <a class="cta" href="${siteUrl}/dashboard">Track status</a>
    `,
  }),
  FILING_APPROVED: ({ businessName, filingNumber }) => ({
    subject: `🎉 ${businessName ?? 'Your business'} is officially formed!`,
    body: html`
      <h1>Approved!</h1>
      <p>The state has approved your formation. Documents are ready to download from your dashboard.</p>
      <table>
        <tr><td>Filing #</td><td><code>${filingNumber ?? '—'}</code></td></tr>
      </table>
      <p>Next steps: open a business bank account, file Form SS-4 for your EIN (if not already), and review your operating agreement.</p>
      <a class="cta" href="${siteUrl}/dashboard">Download documents</a>
    `,
  }),
  FILING_REJECTED: ({ businessName, rejectionReason }) => ({
    subject: `Action needed: ${businessName ?? 'your business'} filing`,
    body: html`
      <h1>State requested changes</h1>
      <p>The state has requested changes to your filing.</p>
      <blockquote>${rejectionReason ?? 'See dashboard for details.'}</blockquote>
      <p>We'll handle the resubmission — no extra state fee.</p>
      <a class="cta" href="${siteUrl}/dashboard">View details</a>
    `,
  }),
  ANNUAL_REPORT_60: ({ businessName, dueDate }) => ({
    subject: `${businessName ?? 'Your business'}'s annual report is due ${dueDate ? formatDateLong(dueDate) : 'soon'}`,
    body: html`
      <h1>Annual report — 60 day reminder</h1>
      <p>Filing on time avoids non-waivable late fees. Have us file it for you in one click — your data is already on file.</p>
      <a class="cta" href="${siteUrl}/dashboard">File annual report</a>
    `,
  }),
  ANNUAL_REPORT_30: ({ businessName }) => ({
    subject: `${businessName ?? 'Your business'} annual report due in 30 days`,
    body: html`
      <h1>30 days until your annual report</h1>
      <p>Have us file it for you in one click — your data is already on file.</p>
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
      <p>We noticed something that needs your attention — sign in to review.</p>
      <a class="cta" href="${siteUrl}/dashboard">Review now</a>
    `,
  }),
  PASSWORD_RESET: ({ firstName, resetUrl }) => ({
    subject: 'Reset your LaunchForma password',
    body: html`
      <h1>Password reset request</h1>
      <p>Hi ${firstName ?? 'there'} — we received a request to reset the password for your LaunchForma account.</p>
      <a class="cta" href="${resetUrl ?? '#'}">Reset my password</a>
      <p class="muted">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your password won't change.</p>
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
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0F1F1C; background: #F8FAF9; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; color: #0F1F1C; }
    p { line-height: 1.6; color: #475A56; margin: 0 0 16px; }
    a { color: #0B7A6B; }
    .cta { display: inline-block; background: #0B7A6B; color: #fff !important; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin: 8px 0 16px; }
    .muted { color: #8A9A95; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    td { padding: 8px 12px; border-bottom: 1px solid #E5EBEA; font-size: 14px; }
    td:first-child { color: #475A56; font-weight: 500; }
    code { background: #EEF2F1; padding: 2px 8px; border-radius: 6px; font-family: ui-monospace, monospace; font-size: 13px; }
    blockquote { border-left: 3px solid #F4A261; padding: 8px 16px; margin: 16px 0; background: #FEF6EE; color: #6E3F18; }
  </style></head><body>
    <div style="text-align:center; padding-bottom:16px;">
      <img src="${siteUrl}/images/logo-full.png" alt="LaunchForma" style="height:36px; max-width:180px;" />
    </div>
    ${inner}
    <hr style="border:none; border-top:1px solid #E5EBEA; margin:32px 0;"/>
    <p class="muted" style="text-align:center;">
      LaunchForma · Questions? <a href="mailto:help@launchforma.com">help@launchforma.com</a><br/>
      <a href="#" style="color:#8A9A95;">Unsubscribe</a>
    </p>
  </body></html>`;
}

// ─── Public helper — render a template without sending ────────────────────────

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

export async function sendEmail(args: SendEmailArgs) {
  const tpl = TEMPLATES[args.type];
  if (!tpl) throw new Error(`Unknown email type: ${args.type}`);
  const { subject, body } = tpl(args.context ?? {});

  // Persist to DB first so admin Outbox always has a record
  const record = await prisma.emailNotification.create({
    data: {
      notificationType: args.type,
      recipientEmail: args.to,
      subject,
      templateName: args.type.toLowerCase(),
      htmlBody: body,
      status: 'SENT',
      sentAt: new Date(),
      filingId: args.filingId,
      userId: args.userId,
    },
  });

  // Best-effort delivery — don't fail the calling action if email is broken
  deliverEmail(args.to, subject, body).catch((err) =>
    console.error('[email] delivery error (non-fatal):', err)
  );

  return record;
}
