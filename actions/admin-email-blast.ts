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
