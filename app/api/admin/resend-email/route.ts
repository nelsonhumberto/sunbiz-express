import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resendEmailNotification } from '@/actions/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/resend-email
 * Body: { notificationId: string } | { notificationIds: string[] }
 * Admin-only. Used to retry failed transactional mail after SMTP is fixed.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 401 });
  }

  let body: { notificationId?: string; notificationIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ids = [
    ...(body.notificationId ? [body.notificationId] : []),
    ...(Array.isArray(body.notificationIds) ? body.notificationIds : []),
  ].filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'notificationId required' }, { status: 400 });
  }

  const results = [];
  for (const id of ids) {
    try {
      const res = await resendEmailNotification(id);
      results.push({ id, ...res });
    } catch (err) {
      results.push({
        id,
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
