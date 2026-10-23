import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { parseEmailBounce } from '@/lib/resend-bounce';
import { verifySvixSignature } from '@/lib/svix';

export const dynamic = 'force-dynamic';

/**
 * Resend bounce webhook.
 *
 * Verifies the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`)
 * with RESEND_WEBHOOK_SECRET, marks matching EmailNotification rows BOUNCED,
 * and adds permanent-bounce addresses to EmailSuppression so sendEmail skips
 * them. Subscribe this URL to the `email.bounced` event.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const rawBody = await request.text();

  if (!secret) {
    logger.error('resend webhook rejected: RESEND_WEBHOOK_SECRET is not set', {
      area: 'email',
      tag: 'resend-webhook',
    });
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 401 });
  }

  const verified = verifySvixSignature({
    payload: rawBody,
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
    secret,
  });
  if (!verified) {
    logger.warn('resend webhook rejected: bad signature', {
      area: 'email',
      tag: 'resend-webhook',
    });
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const bounce = parseEmailBounce(event);
  if (!bounce) return NextResponse.json({ received: true, ignored: true });
  if (bounce.emails.length === 0) {
    return NextResponse.json({ received: true, updated: 0 });
  }

  try {
    let updated = 0;
    for (const email of bounce.emails) {
      const result = await prisma.emailNotification.updateMany({
        where: {
          recipientEmail: { equals: email, mode: 'insensitive' },
          status: { in: ['SENT', 'QUEUED'] },
        },
        data: {
          status: 'BOUNCED',
          errorMessage: bounce.detail ?? 'Bounced',
        },
      });
      updated += result.count;

      if (bounce.suppress) {
        await prisma.emailSuppression.upsert({
          where: { email },
          create: { email, reason: 'BOUNCE', detail: bounce.detail },
          update: { reason: 'BOUNCE', detail: bounce.detail },
        });
      }
    }

    logger.info('resend bounce processed', {
      area: 'email',
      tag: 'resend-webhook',
      recipients: bounce.emails.length,
      updated,
      suppressed: bounce.suppress,
    });
    return NextResponse.json({ received: true, updated, suppressed: bounce.suppress });
  } catch (err) {
    logger.error('resend bounce handler failed', { area: 'email', tag: 'resend-webhook' }, err);
    return NextResponse.json({ error: 'handler error' }, { status: 500 });
  }
}
