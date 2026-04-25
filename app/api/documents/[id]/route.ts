import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decodeDocument } from '@/lib/pdf';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: { filing: true },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.filing.userId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      downloadedCount: { increment: 1 },
      lastDownloadedAt: new Date(),
    },
  });

  const body = decodeDocument(doc.base64);
  return new NextResponse(body, {
    headers: {
      'Content-Type': doc.mimeType,
      // Render inline for HTML demo
      'Content-Disposition': `inline; filename="${doc.title}.html"`,
    },
  });
}
