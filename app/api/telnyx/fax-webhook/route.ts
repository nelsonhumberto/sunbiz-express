import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { telnyxPublicKeyConfigured, verifyTelnyxSignature } from '@/lib/telnyx';

export const dynamic = 'force-dynamic';

/**
 * Telnyx fax webhook — receives inbound faxes and outbound status updates.
 *
 * Inbound faxes are stored in the FaxMessage tray (media fetched + persisted
 * so it survives Telnyx's time-limited URL). Outbound status events update the
 * matching record by Telnyx fax id.
 *
 * Requests are authenticated with Telnyx's Ed25519 signature
 * (`telnyx-signature-ed25519` + `telnyx-timestamp`) verified against
 * TELNYX_PUBLIC_KEY. In production an unverified request is rejected; without
 * a configured key we fail closed so forged faxes can't be injected.
 */
export async function POST(request: NextRequest) {
  // Read the raw body once — signature verification needs the exact bytes.
  const rawBody = await request.text();

  const verified = verifyTelnyxSignature({
    rawBody,
    signatureB64: request.headers.get('telnyx-signature-ed25519'),
    timestamp: request.headers.get('telnyx-timestamp'),
  });
  if (!verified) {
    if (process.env.NODE_ENV === 'production' || telnyxPublicKeyConfigured()) {
      logger.warn('telnyx fax webhook rejected: bad/missing signature', {
        area: 'fax',
        tag: 'webhook-verify',
      });
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
    // Non-production with no key configured: allow for local testing only.
    logger.warn('telnyx fax webhook unverified (no TELNYX_PUBLIC_KEY in dev)', {
      area: 'fax',
      tag: 'webhook-verify',
    });
  }

  let event: {
    data?: { event_type?: string; payload?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody);
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
