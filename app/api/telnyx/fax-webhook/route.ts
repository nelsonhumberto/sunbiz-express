import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Telnyx fax webhook — receives inbound faxes and outbound status updates.
 *
 * Inbound faxes are stored in the FaxMessage tray (media fetched + persisted
 * so it survives Telnyx's time-limited URL). Outbound status events update the
 * matching record by Telnyx fax id.
 *
 * NOTE: signature verification (Ed25519 via the account public key) should be
 * added before this is used for anything sensitive. For now it only writes
 * fax records, so we accept and validate structure.
 */
export async function POST(request: NextRequest) {
  let event: {
    data?: { event_type?: string; payload?: Record<string, unknown> };
  };
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const type = event?.data?.event_type;
  const payload = event?.data?.payload ?? {};
  if (!type) return NextResponse.json({ received: true });

  try {
    if (type === 'fax.received') {
      await handleInbound(payload);
    } else if (type.startsWith('fax.')) {
      await handleStatus(type, payload);
    }
  } catch (err) {
    logger.error('telnyx fax webhook error', { area: 'fax', tag: 'webhook' }, err);
    return NextResponse.json({ error: 'handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleInbound(p: Record<string, unknown>) {
  const faxId = (p.fax_id as string) || (p.id as string) || null;
  const mediaUrl = (p.media_url as string) || (p.original_media_url as string) || null;

  // De-dupe on Telnyx id.
  if (faxId) {
    const existing = await prisma.faxMessage.findUnique({ where: { telnyxFaxId: faxId } });
    if (existing) return;
  }

  // Best-effort: fetch + store the PDF so it persists past Telnyx's URL TTL.
  let mediaBase64: string | null = null;
  if (mediaUrl) {
    try {
      const res = await fetch(mediaUrl, { cache: 'no-store' });
      if (res.ok) {
        mediaBase64 = Buffer.from(await res.arrayBuffer()).toString('base64');
      }
    } catch {
      /* keep mediaUrl as a fallback link */
    }
  }

  await prisma.faxMessage.create({
    data: {
      direction: 'INBOUND',
      toNumber: (p.to as string) ?? null,
      fromNumber: (p.from as string) ?? null,
      status: 'received',
      telnyxFaxId: faxId,
      mediaName: `Inbound fax ${new Date().toISOString().slice(0, 10)}.pdf`,
      mediaMime: 'application/pdf',
      mediaBase64,
      mediaUrl,
      accessToken: mediaBase64 ? crypto.randomBytes(24).toString('hex') : null,
      pageCount: typeof p.page_count === 'number' ? (p.page_count as number) : null,
    },
  });
}

async function handleStatus(type: string, p: Record<string, unknown>) {
  const faxId = (p.fax_id as string) || (p.id as string) || null;
  if (!faxId) return;
  const fax = await prisma.faxMessage.findUnique({ where: { telnyxFaxId: faxId } });
  if (!fax) return;

  let status = fax.status;
  if (type === 'fax.delivered') status = 'delivered';
  else if (type === 'fax.failed' || type === 'fax.sending.failed') status = 'failed';
  else if (type === 'fax.sending.started' || type === 'fax.media.processed') status = 'sending';

  await prisma.faxMessage.update({
    where: { id: fax.id },
    data: {
      status,
      errorMessage: (p.failure_reason as string) || fax.errorMessage,
      pageCount: typeof p.page_count === 'number' ? (p.page_count as number) : fax.pageCount,
    },
  });
}
