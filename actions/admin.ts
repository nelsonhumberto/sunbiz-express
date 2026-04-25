'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email-mock';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  return session;
}

export async function advanceFilingStatus(filingId: string) {
  await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { user: true },
  });
  if (!filing) throw new Error('Not found');

  let newStatus = filing.status;
  let nowField: 'sunbizApprovedAt' | null = null;

  if (filing.status === 'DRAFT') {
    newStatus = 'SUBMITTED';
  } else if (filing.status === 'SUBMITTED') {
    newStatus = 'APPROVED';
    nowField = 'sunbizApprovedAt';
  } else {
    return; // already terminal
  }

  await prisma.filing.update({
    where: { id: filingId },
    data: {
      status: newStatus,
      ...(nowField ? { [nowField]: new Date() } : {}),
    },
  });

  if (newStatus === 'APPROVED' && filing.user) {
    await sendEmail({
      type: 'FILING_APPROVED',
      to: filing.user.email,
      userId: filing.userId,
      filingId: filing.id,
      context: {
        businessName: filing.businessName ?? '',
        filingNumber: filing.sunbizFilingNumber ?? undefined,
      },
    });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/filings');
  revalidatePath(`/dashboard/filings/${filingId}`);
}

export async function rejectFiling(filingId: string, reason: string) {
  await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { user: true },
  });
  if (!filing) throw new Error('Not found');

  await prisma.filing.update({
    where: { id: filingId },
    data: {
      status: 'REJECTED',
      sunbizRejectionReason: reason,
    },
  });

  if (filing.user) {
    await sendEmail({
      type: 'FILING_REJECTED',
      to: filing.user.email,
      userId: filing.userId,
      filingId: filing.id,
      context: { businessName: filing.businessName ?? '', rejectionReason: reason },
    });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/filings');
}
