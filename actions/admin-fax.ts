'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { telnyxSendFax, normalizeFaxNumber, TelnyxError } from '@/lib/telnyx';

export interface SendFaxResult {
  ok?: boolean;
  error?: string;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function sendFax(
  _prev: SendFaxResult,
  formData: FormData,
): Promise<SendFaxResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { error: 'Admin access required.' };
  }

  const rawTo = String(formData.get('to') ?? '').trim();
  const file = formData.get('file');
  if (!rawTo) return { error: 'Enter a destination fax number.' };
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Attach a PDF to fax.' };
  }
  if (file.type && file.type !== 'application/pdf') {
    return { error: 'Only PDF files are supported.' };
  }
  if (file.size > MAX_BYTES) {
    return { error: 'PDF is too large (10 MB max).' };
  }

  const connectionId = process.env.TELNYX_FAX_CONNECTION_ID?.trim();
  const from = process.env.TELNYX_FAX_FROM?.trim();
  if (!connectionId) {
    return { error: 'TELNYX_FAX_CONNECTION_ID is not configured.' };
  }

  const to = normalizeFaxNumber(rawTo);
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const accessToken = crypto.randomBytes(24).toString('hex');

  // Persist first so we always have a record (and a media URL to hand Telnyx).
  const fax = await prisma.faxMessage.create({
    data: {
      direction: 'OUTBOUND',
      toNumber: to,
      fromNumber: from || null,
      status: 'queued',
      mediaName: file.name || 'document.pdf',
      mediaMime: 'application/pdf',
      mediaBase64: base64,
      accessToken,
      createdBy: session.user.id,
    },
  });

  if (!from) {
    await prisma.faxMessage.update({
      where: { id: fax.id },
      data: {
        status: 'failed',
        errorMessage: 'No Telnyx fax number configured (set TELNYX_FAX_FROM).',
      },
    });
    revalidatePath('/admin/fax');
    return {
      error:
        'Saved, but no Telnyx fax number is configured. Buy a fax-capable number in Telnyx and set TELNYX_FAX_FROM, then resend.',
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const mediaUrl = `${siteUrl}/api/admin/fax/media/${fax.id}?t=${accessToken}`;

  try {
    const result = await telnyxSendFax({ to, from, mediaUrl, connectionId });
    await prisma.faxMessage.update({
      where: { id: fax.id },
      data: { status: result.status || 'sending', telnyxFaxId: result.id || null },
    });
    revalidatePath('/admin/fax');
    return { ok: true };
  } catch (err) {
    const message = err instanceof TelnyxError ? err.message : 'Failed to send fax.';
    logger.error('telnyx send fax failed', { area: 'fax', entityId: fax.id, tag: 'send' }, err);
    await prisma.faxMessage.update({
      where: { id: fax.id },
      data: { status: 'failed', errorMessage: message },
    });
    revalidatePath('/admin/fax');
    return { error: message };
  }
}
