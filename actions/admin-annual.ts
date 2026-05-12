'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/sign-in');
}

export async function markAnnualReportFiled(reportId: string, filingNumber?: string) {
  await requireAdmin();
  await prisma.annualReport.update({
    where: { id: reportId },
    data: {
      status: 'FILED',
      filedDate: new Date(),
      sunbizFilingNumber: filingNumber ?? null,
    },
  });
  revalidatePath('/admin/annual-reports');
}

export async function markAnnualReportOverdue(reportId: string) {
  await requireAdmin();
  await prisma.annualReport.update({
    where: { id: reportId },
    data: { status: 'OVERDUE' },
  });
  revalidatePath('/admin/annual-reports');
}
