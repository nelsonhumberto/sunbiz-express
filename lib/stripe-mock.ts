// Mock Stripe checkout. Real impl would create a PaymentIntent + Stripe Elements.
// Here we just generate a session id and return a success URL.

export interface MockCheckoutSession {
  id: string;
  url: string;
  amountCents: number;
  currency: string;
}

export function createMockCheckoutSession(input: {
  filingId: string;
  amountCents: number;
}): MockCheckoutSession {
  const sessionId = `cs_mock_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: sessionId,
    url: `/checkout/success?session=${sessionId}&filing=${input.filingId}`,
    amountCents: input.amountCents,
    currency: 'usd',
  };
}

// Test cards (mimic Stripe behavior for the demo)
export const TEST_CARDS = {
  visa: '4242 4242 4242 4242',
  visaDeclined: '4000 0000 0000 0002',
  mastercard: '5555 5555 5555 4444',
  amex: '3782 822463 10005',
} as const;

export function maskCardLast4(input: string): string {
  const digits = input.replace(/\s+/g, '');
  return digits.slice(-4);
}

export function detectBrand(input: string): string {
  const digits = input.replace(/\s+/g, '');
  if (digits.startsWith('4')) return 'Visa';
  if (digits.startsWith('5')) return 'Mastercard';
  if (digits.startsWith('3')) return 'American Express';
  if (digits.startsWith('6')) return 'Discover';
  return 'Card';
}
