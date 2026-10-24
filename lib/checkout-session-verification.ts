/**
 * Decide whether /checkout/success may record a purchase.
 *
 * The browser event stays `purchase_completed` (see trackPurchaseCompleted).
 * It runs only after stripe.checkout.sessions.retrieve shows a paid session
 * that belongs to the signed-in user or one of their filings.
 */

export interface CheckoutSessionSnapshot {
  id?: string | null;
  payment_status?: string | null;
  status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  customer?: string | { id?: string | null } | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string | null | undefined> | null;
}

export interface CheckoutOwnerContext {
  userId: string;
  email?: string | null;
  stripeCustomerId?: string | null;
  /** Filing id from the success URL. Used only when that filing is owned. */
  requestedFilingId?: string | null;
  /** Filing ids already confirmed to belong to userId. */
  ownedFilingIds?: readonly string[];
}

export interface VerifiedPaidCheckout {
  amountCents: number | null;
  currency: string | null;
  filingId: string | null;
}

export type CheckoutSuccessGate =
  | { status: 'confirming' }
  | ({ status: 'paid' } & VerifiedPaidCheckout);

const ID_MAX = 200;

/**
 * Paid when payment_status is `paid`, which includes a complete session
 * whose payment_status is also `paid`. Complete + unpaid stays unpaid.
 */
export function isPaidCheckoutSession(
  session: { payment_status?: string | null; status?: string | null } | null | undefined,
): boolean {
  if (!session) return false;
  const paymentStatus = session.payment_status;
  const completeAndPaid = session.status === 'complete' && paymentStatus === 'paid';
  return paymentStatus === 'paid' || completeAndPaid;
}

export function readQueryParam(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return cleanId(raw);
}

export function toCheckoutSessionSnapshot(session: CheckoutSessionSnapshot): CheckoutSessionSnapshot {
  return {
    id: session.id ?? null,
    payment_status: session.payment_status ?? null,
    status: session.status ?? null,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null,
    client_reference_id: session.client_reference_id ?? null,
    customer: session.customer ?? null,
    customer_email: session.customer_details?.email ?? session.customer_email ?? null,
    metadata: session.metadata ?? null,
  };
}

/** Filing ids worth loading so ownership can be checked against the user. */
export function checkoutFilingCandidates(
  session: CheckoutSessionSnapshot | null,
  urlFilingId: string | null,
): string[] {
  const metadata = session?.metadata;
  const ids = [
    urlFilingId,
    metadata?.filingId,
    metadata?.filing_id,
    session?.client_reference_id,
  ];
  const out: string[] = [];
  for (const id of ids) {
    const cleaned = cleanId(id);
    if (!cleaned || out.includes(cleaned)) continue;
    out.push(cleaned);
  }
  return out;
}

export function verifyPaidCheckoutSession(
  session: CheckoutSessionSnapshot | null | undefined,
  owner: CheckoutOwnerContext,
): VerifiedPaidCheckout | null {
  if (!session || !isPaidCheckoutSession(session)) return null;
  if (!cleanId(owner.userId)) return null;

  const owned = new Set(
    (owner.ownedFilingIds ?? []).map((id) => cleanId(id)).filter((id): id is string => Boolean(id)),
  );
  const requested = cleanId(owner.requestedFilingId);
  const metadata = session.metadata;
  const metaUser = metaString(metadata, 'userId', 'user_id');
  const metaFiling = metaString(metadata, 'filingId', 'filing_id');
  const clientRef = cleanId(session.client_reference_id);
  const customer = customerId(session.customer);
  const ownerCustomer = cleanId(owner.stripeCustomerId);
  const email = cleanEmail(session.customer_email);
  const ownerEmail = cleanEmail(owner.email);

  let matched = false;
  let mismatch = false;

  if (metaUser) {
    if (metaUser === owner.userId) matched = true;
    else mismatch = true;
  }
  if (metaFiling) {
    if (owned.has(metaFiling)) matched = true;
    else mismatch = true;
  }
  if (clientRef && (clientRef === owner.userId || owned.has(clientRef))) {
    matched = true;
  }
  // Customer id and email can prove ownership when metadata is absent.
  // A different checkout email or a newly created customer does not cancel
  // a user or filing match already on the session.
  if (customer && ownerCustomer && customer === ownerCustomer) matched = true;
  if (email && ownerEmail && email === ownerEmail) matched = true;

  if (mismatch || !matched) return null;

  let filingId: string | null = null;
  if (metaFiling && owned.has(metaFiling)) filingId = metaFiling;
  else if (clientRef && owned.has(clientRef)) filingId = clientRef;
  else if (requested && owned.has(requested)) filingId = requested;

  return {
    amountCents: amountCents(session.amount_total),
    currency: currencyCode(session.currency),
    filingId,
  };
}

export function gateCheckoutSuccess(input: {
  sessionId: string | null;
  session: CheckoutSessionSnapshot | null;
  owner: CheckoutOwnerContext;
}): CheckoutSuccessGate {
  if (!input.sessionId || !input.session) return { status: 'confirming' };
  if (input.session.id && input.session.id !== input.sessionId) return { status: 'confirming' };
  const verified = verifyPaidCheckoutSession(input.session, input.owner);
  if (!verified) return { status: 'confirming' };
  return { status: 'paid', ...verified };
}

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ID_MAX) return null;
  return trimmed;
}

function metaString(
  metadata: CheckoutSessionSnapshot['metadata'],
  ...keys: string[]
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const cleaned = cleanId(metadata[key]);
    if (cleaned) return cleaned;
  }
  return null;
}

function customerId(customer: CheckoutSessionSnapshot['customer']): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return cleanId(customer);
  return cleanId(customer.id);
}

function cleanEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 320 || !trimmed.includes('@')) return null;
  return trimmed;
}

function amountCents(amount: number | null | undefined): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount);
}

function currencyCode(currency: string | null | undefined): string | null {
  if (typeof currency !== 'string') return null;
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return code;
}
