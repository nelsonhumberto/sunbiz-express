// Mock email service. Writes to EmailNotification table + console-logs preview.
// Real implementation would use SendGrid; UI/admin Outbox view shows the same data.

import { prisma } from './db';
import { formatCurrency, formatDateLong } from './utils';

export type NotificationType =
  | 'WELCOME'
  | 'FILING_STARTED'
  | 'ABANDONED_24H'
  | 'ABANDONED_72H'
  | 'PAYMENT_CONFIRMATION'
  | 'FILING_SUBMITTED'
  | 'FILING_APPROVED'
  | 'FILING_REJECTED'
  | 'ANNUAL_REPORT_60'
  | 'ANNUAL_REPORT_30'
  | 'ANNUAL_REPORT_FINAL'
  | 'COMPLIANCE_ALERT';

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
}

const TEMPLATES: Record<
  NotificationType,
  (ctx: EmailContext) => { subject: string; body: string }
> = {
  WELCOME: ({ firstName }) => ({
    subject: 'Welcome to Sunbiz Express ☀️',
    body: html`
      <h1>Welcome, ${firstName ?? 'there'}!</h1>
      <p>You're moments away from forming your Florida business. We've cleared the runway — when you're ready, your dashboard is waiting.</p>
      <a class="cta" href="https://sunbizexpress.example/dashboard">Go to Dashboard</a>
      <p class="muted">Need a hand? Reply to this email and a real person will help.</p>
    `,
  }),
  FILING_STARTED: ({ firstName, businessName }) => ({
    subject: `Your filing for ${businessName ?? 'your business'} is started`,
    body: html`
      <h1>Filing started</h1>
      <p>Hi ${firstName ?? 'there'} — we've saved your progress. Pick up exactly where you left off.</p>
    `,
  }),
  ABANDONED_24H: ({ firstName, businessName }) => ({
    subject: `Continue forming ${businessName ?? 'your business'} — pick up where you left off`,
    body: html`
      <h1>Almost there, ${firstName ?? 'there'}</h1>
      <p>Your draft is saved and waiting. Most users finish in 5 minutes from this point.</p>
      <a class="cta" href="https://sunbizexpress.example/dashboard">Resume Filing</a>
    `,
  }),
  ABANDONED_72H: ({ firstName, businessName }) => ({
    subject: `Last chance: complete your filing for ${businessName ?? 'your business'}`,
    body: html`
      <h1>Don't lose your progress</h1>
      <p>${firstName ?? 'Hi'} — we'll keep your draft for a few more days. After that we'll archive it.</p>
    `,
  }),
  PAYMENT_CONFIRMATION: ({ businessName, totalCents }) => ({
    subject: `Payment confirmed for ${businessName ?? 'your business'}`,
    body: html`
      <h1>Payment received</h1>
      <p>We charged your card ${totalCents != null ? formatCurrency(totalCents) : ''}. Your filing is being submitted to the Florida Department of State now.</p>
    `,
  }),
  FILING_SUBMITTED: ({ businessName, trackingNumber, pin }) => ({
    subject: `${businessName ?? 'Your business'} has been filed with the State of Florida`,
    body: html`
      <h1>Filing submitted</h1>
      <p>The state typically processes filings in 1-2 business days. We'll email you the moment your formation is approved.</p>
      <table>
        <tr><td>Tracking #</td><td><code>${trackingNumber ?? '—'}</code></td></tr>
        <tr><td>PIN</td><td><code>${pin ?? '—'}</code></td></tr>
      </table>
    `,
  }),
  FILING_APPROVED: ({ businessName, filingNumber }) => ({
    subject: `🎉 ${businessName ?? 'Your business'} is officially formed!`,
    body: html`
      <h1>Approved!</h1>
      <p>Florida has approved your formation. Documents are ready to download from your dashboard.</p>
      <table>
        <tr><td>Sunbiz Filing #</td><td><code>${filingNumber ?? '—'}</code></td></tr>
      </table>
      <p>Next steps: open a business bank account, file Form SS-4 for your EIN (if not already), and review your operating agreement.</p>
    `,
  }),
  FILING_REJECTED: ({ businessName, rejectionReason }) => ({
    subject: `Action needed: ${businessName ?? 'your business'} filing`,
    body: html`
      <h1>State requested changes</h1>
      <p>The Florida Department of State has requested changes to your filing.</p>
      <blockquote>${rejectionReason ?? 'See dashboard for details.'}</blockquote>
      <p>We'll handle the resubmission — no extra state fee.</p>
    `,
  }),
  ANNUAL_REPORT_60: ({ businessName, dueDate }) => ({
    subject: `${businessName ?? 'Your business'}'s annual report is due ${dueDate ? formatDateLong(dueDate) : 'soon'}`,
    body: html`
      <h1>Annual report — 60 day reminder</h1>
      <p>Florida requires annual reports between January 1 and May 1. Filing on time avoids the $400 non-waivable late fee.</p>
    `,
  }),
  ANNUAL_REPORT_30: ({ businessName }) => ({
    subject: `${businessName ?? 'Your business'} annual report due in 30 days`,
    body: html`
      <h1>30 days until your annual report</h1>
      <p>Have us file it for you in one click — your data is already on file.</p>
    `,
  }),
  ANNUAL_REPORT_FINAL: ({ businessName, daysUntilDue }) => ({
    subject: `URGENT: ${businessName ?? 'Your business'} annual report due in ${daysUntilDue ?? 3} days`,
    body: html`
      <h1>Final reminder</h1>
      <p>The Florida $400 late fee is non-waivable. Tap below and we'll file in 60 seconds.</p>
    `,
  }),
  COMPLIANCE_ALERT: ({ businessName }) => ({
    subject: `Compliance update for ${businessName ?? 'your business'}`,
    body: html`
      <h1>Compliance alert</h1>
      <p>We noticed something that needs your attention — sign in to review.</p>
    `,
  }),
};

// HTML template wrapper. Inlined styles so admin Outbox preview renders correctly.
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
    .cta { display: inline-block; background: #0B7A6B; color: #fff !important; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin: 8px 0 16px; }
    .muted { color: #8A9A95; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    td { padding: 8px 12px; border-bottom: 1px solid #E5EBEA; font-size: 14px; }
    td:first-child { color: #475A56; font-weight: 500; }
    code { background: #EEF2F1; padding: 2px 8px; border-radius: 6px; font-family: ui-monospace, monospace; font-size: 13px; }
    blockquote { border-left: 3px solid #F4A261; padding: 8px 16px; margin: 16px 0; background: #FEF6EE; color: #6E3F18; }
  </style></head><body>
    <div style="text-align:center; padding-bottom:16px;">
      <span style="display:inline-block; width:32px; height:32px; background:#0B7A6B; border-radius:8px; color:#fff; font-weight:bold; line-height:32px;">SE</span>
      <span style="margin-left:8px; font-weight:600;">Sunbiz Express</span>
    </div>
    ${inner}
    <hr style="border:none; border-top:1px solid #E5EBEA; margin:32px 0;"/>
    <p class="muted" style="text-align:center;">Sunbiz Express · 1234 Sunshine Blvd, Miami FL 33101 · <a href="#" style="color:#475A56;">Unsubscribe</a></p>
  </body></html>`;
}

export interface SendEmailArgs {
  type: NotificationType;
  to: string;
  filingId?: string;
  userId?: string;
  context?: EmailContext;
}

export async function sendEmail(args: SendEmailArgs) {
  const tpl = TEMPLATES[args.type];
  if (!tpl) throw new Error(`Unknown email type: ${args.type}`);
  const { subject, body } = tpl(args.context ?? {});

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

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[email-mock] → ${args.to} | ${args.type} | "${subject}"`);
  }
  return record;
}
