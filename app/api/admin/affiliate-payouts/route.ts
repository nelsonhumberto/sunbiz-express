import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { payoutCsv } from '@/lib/affiliate-admin';
import { loadCommissionOrders } from '@/lib/affiliate-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const report = await loadCommissionOrders({
    month: url.searchParams.get('month'),
    partnerId: url.searchParams.get('partner'),
  });
  const csv = payoutCsv(report.label, report.orders);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="affiliate-payouts-${report.label}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
