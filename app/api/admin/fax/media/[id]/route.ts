import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Serves a stored fax PDF so Telnyx can fetch it as the fax `media_url`.
 * Guarded by an unguessable per-fax access token (Telnyx is unauthenticated).
 * Not in robots/sitemap; only Telnyx and links we generate hit this.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const fax = await prisma.faxMessage.findUnique({ where: { id: params.id } });

  if (!fax || !fax.accessToken || token !== fax.accessToken || !fax.mediaBase64) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const bytes = Buffer.from(fax.mediaBase64, 'base64');
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': fax.mediaMime || 'application/pdf',
      'Content-Disposition': `inline; filename="${(fax.mediaName || 'fax.pdf').replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
