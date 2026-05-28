import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

/**
 * Generates a one-shot Stripe Billing Portal session for the signed-in
 * customer. We redirect them straight to the portal where they can
 * update card info, view invoices, and cancel subscriptions (Registered
 * Agent renewals, Compliance Alerts, .com domain) without LaunchForma
 * having to build that UI ourselves.
 *
 * If the user doesn't yet have a Stripe customer record (rare — they
 * haven't checked out yet) we 404 instead of silently creating a blank
 * one. The dashboard billing page surfaces this condition with a clear
 * empty state.
 *
 * OWASP A01 — the session is auth-scoped to the calling user; we never
 * accept a customer id from the request body.
 */
export async function POST(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: 'No billing account on file. Complete a purchase first.' },
      { status: 404 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/billing`,
    });
    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (err) {
    console.error('[stripe:customer-portal] session creation failed', err);
    return NextResponse.json(
      { error: 'Could not open billing portal. Please try again.' },
      { status: 500 },
    );
  }
}
