import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  STEP_NAMES,
  TOTAL_DISPLAYED_STEPS,
  displayStepNumber,
} from '@/lib/wizard-constants';
import { safeParseJson } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CSV_COLUMNS = [
  'filing_id',
  'created_at',
  'updated_at',
  'business_name',
  'entity_type',
  'service_tier',
  'status',
  'user_archived_at',
  'current_step_route',
  'current_step_display',
  'current_step_title',
  'sections_completed',
  'sections_total',
  'progress_pct',
  'paid',
  'customer_first_name',
  'customer_last_name',
  'customer_email',
] as const;

/**
 * Admin-only CSV export of every draft filing — including ones the customer
 * removed from their dashboard. Lets the team feed retention sequences with
 * a fresh "where they left off" snapshot. Per OWASP A01 we hard-gate this
 * route on `role === 'ADMIN'` and return 403 for anyone else.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const drafts = await prisma.filing.findMany({
    where: { status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      payments: { select: { status: true } },
    },
  });

  const rows = drafts.map((d) => {
    const completedSteps = safeParseJson<number[]>(d.completedSteps, []);
    const visibleCompleted = Math.min(
      completedSteps.length,
      TOTAL_DISPLAYED_STEPS,
    );
    const progressPct = Math.round(
      (visibleCompleted / TOTAL_DISPLAYED_STEPS) * 100,
    );
    const stepRoute = d.currentStep ?? 1;
    const stepDisplay = displayStepNumber(stepRoute);
    const stepTitle = STEP_NAMES[stepRoute]?.title ?? '';
    const paid = d.payments.some((p) => p.status === 'SUCCEEDED');

    return {
      filing_id: d.id,
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
      business_name: d.businessName ?? '',
      entity_type: d.entityType,
      service_tier: d.serviceTier,
      status: d.status,
      user_archived_at: d.userArchivedAt?.toISOString() ?? '',
      current_step_route: stepRoute,
      current_step_display: stepDisplay ?? 'bonus',
      current_step_title: stepTitle,
      sections_completed: visibleCompleted,
      sections_total: TOTAL_DISPLAYED_STEPS,
      progress_pct: progressPct,
      paid: paid ? 'true' : 'false',
      customer_first_name: d.user.firstName,
      customer_last_name: d.user.lastName,
      customer_email: d.user.email,
    };
  });

  const csv = toCsv(rows);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="drafts-${today}.csv"`,
      // OWASP A05: prevent caching of potentially sensitive PII.
      'Cache-Control': 'no-store',
    },
  });
}

/** Minimal RFC-4180-ish CSV serializer; escapes quotes and wraps cells with
 * commas, quotes, or newlines. UTF-8 BOM helps Excel pick up encoding. */
function toCsv(rows: Record<string, unknown>[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((r) =>
    CSV_COLUMNS.map((col) => csvCell(r[col])).join(','),
  );
  return '\uFEFF' + [header, ...lines].join('\r\n');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
