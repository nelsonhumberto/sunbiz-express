import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { renderTemplate, type NotificationType } from '@/lib/email';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const type = req.nextUrl.searchParams.get('type') as NotificationType | null;
  if (!type) return new NextResponse('Missing type', { status: 400 });

  try {
    const { html } = renderTemplate(type, {
      firstName: 'Jane',
      businessName: 'Sunshine Ventures LLC',
      totalCents: 22400,
      trackingNumber: 'TRK123456',
      pin: '4280',
      filingNumber: 'L26000012345',
      dueDate: new Date(new Date().getFullYear() + 1, 3, 30),
      daysUntilDue: 3,
      rejectionReason: 'The business name conflicts with an existing registration.',
      resetUrl: 'https://launchforma.com/reset-password?token=preview',
    });

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new NextResponse('Unknown template type', { status: 400 });
  }
}
