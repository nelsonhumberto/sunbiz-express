'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail, type NotificationType } from '@/lib/email';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/sign-in');
}

export interface BlastResult {
  ok?: boolean;
  error?: string;
  sent?: number;
}

export async function sendEmailBlast(formData: FormData): Promise<BlastResult> {
  await requireAdmin();

  const type = formData.get('type') as NotificationType;
  const audience = formData.get('audience') as string; // 'all' | 'userId:<id>'
  const subject = formData.get('subject') as string;

  if (!type || !audience) return { error: 'Missing required fields.' };

  let users: { id: string; email: string; firstName: string }[] = [];

  if (audience === 'all') {
    users = await prisma.user.findMany({
      where: { accountStatus: 'ACTIVE', role: 'USER' },
      select: { id: true, email: true, firstName: true },
    });
  } else if (audience.startsWith('userId:')) {
    const uid = audience.replace('userId:', '');
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, email: true, firstName: true },
    });
    if (u) users = [u];
  } else if (audience.startsWith('email:')) {
    const email = audience.replace('email:', '').toLowerCase();
    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });
    if (u) users = [u];
    else return { error: `No user found with email ${email}.` };
  }

  if (users.length === 0) return { error: 'No recipients found.' };

  let sent = 0;
  for (const user of users) {
    try {
      await sendEmail({
        type,
        to: user.email,
        userId: user.id,
        context: { firstName: user.firstName },
      });
      sent++;
    } catch {
      // continue sending to remaining users even if one fails
    }
  }

  return { ok: true, sent };
}

export async function sendCustomEmail(formData: FormData): Promise<BlastResult> {
  await requireAdmin();

  const to      = (formData.get('to') as string)?.trim();
  const subject = (formData.get('subject') as string)?.trim();
  const body    = (formData.get('body') as string)?.trim();

  if (!to || !subject || !body) return { error: 'To, subject, and body are all required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: 'Enter a valid email address.' };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0F1F1C; background: #F8FAF9; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; color: #0F1F1C; }
    p { line-height: 1.6; color: #475A56; margin: 0 0 16px; }
    .muted { color: #8A9A95; font-size: 13px; }
  </style></head><body>
    <div style="text-align:center; padding-bottom:16px;">
      <img src="${siteUrl}/images/logo-full.png" alt="LaunchForma" style="height:36px; max-width:180px;" />
    </div>
    <div style="white-space:pre-wrap;">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    <hr style="border:none; border-top:1px solid #E5EBEA; margin:32px 0;"/>
    <p class="muted" style="text-align:center;">
      LaunchForma · Questions? <a href="mailto:help@launchforma.com" style="color:#8A9A95;">help@launchforma.com</a>
    </p>
  </body></html>`;

  // Record in outbox
  const user = await prisma.user.findUnique({ where: { email: to }, select: { id: true } });
  await prisma.emailNotification.create({
    data: {
      notificationType: 'COMPLIANCE_ALERT',
      recipientEmail: to,
      subject,
      templateName: 'custom',
      htmlBody: html,
      status: 'SENT',
      sentAt: new Date(),
      userId: user?.id,
    },
  });

  // Deliver
  const { deliverEmailDirect } = await import('@/lib/email');
  await deliverEmailDirect(to, subject, html);

  return { ok: true, sent: 1 };
}

export async function updateStateFees(formData: FormData): Promise<BlastResult> {
  await requireAdmin();

  const stateId = formData.get('stateId') as string;
  const llcFilingFeeCents = Number(formData.get('llcFilingFeeCents'));
  const corpFilingFeeCents = Number(formData.get('corpFilingFeeCents'));
  const llcAnnualReportFeeCents = Number(formData.get('llcAnnualReportFeeCents'));
  const corpAnnualReportFeeCents = Number(formData.get('corpAnnualReportFeeCents'));
  const annualReportLateFeeCents = Number(formData.get('annualReportLateFeeCents'));
  const expressProcessingFeeCents = Number(formData.get('expressProcessingFeeCents') ?? 0);

  if (!stateId) return { error: 'Missing state.' };

  await prisma.state.update({
    where: { id: stateId },
    data: {
      llcFilingFeeCents,
      corpFilingFeeCents,
      llcAnnualReportFeeCents,
      corpAnnualReportFeeCents,
      annualReportLateFeeCents,
      expressProcessingFeeCents,
    },
  });

  return { ok: true };
}
