'use client';

/**
 * StripeCardInput
 *
 * A self-contained card field built on Stripe Elements (CardElement).
 * Wraps itself in an <Elements> provider so parent components don't need
 * to know about Stripe at all.
 *
 * Usage:
 *   const cardRef = useRef<StripeCardHandle>(null);
 *
 *   // To confirm a payment:
 *   const { paymentIntentId, error } = await cardRef.current!.confirm({
 *     amountCents,
 *     cardholderName,
 *     filingId,          // optional, added to PI metadata
 *     savedPaymentMethodId, // optional, bypasses CardElement for saved cards
 *   });
 */

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from 'react';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { localeFromPublicPath } from '@/lib/locale-paths';
import { paymentIntentErrorMessage } from '@/lib/payment-intent-errors';
import { stripePromise } from '@/lib/stripe-client';
import { getAnalyticsDistinctId } from '@/lib/analytics';

// ── Public API exposed via ref ─────────────────────────────────────────────

export interface ConfirmOptions {
  amountCents: number;
  cardholderName: string;
  /** Optional - stored in Stripe PI metadata for reconciliation. */
  filingId?: string;
  /**
   * Dashboard certificate order (`cert_status` or `cert_copy`). The server
   * prices this from the filing instead of the formation checkout total.
   */
  certificateSlug?: string;
  /**
   * Which catalog price to charge. The server ignores amountCents.
   * Formation is the default when a filingId is set.
   */
  purpose?: 'formation' | 'annual_report' | 'ein' | 'ra_renewal' | 'guest_annual_report';
  /** Validated server-side. A client discount amount is not accepted. */
  couponCode?: string;
  raServiceId?: string;
  useOurRa?: boolean;
  /** Guest annual report entity. The server prices from this, not amountCents. */
  entityType?: 'LLC' | 'CORP';
  /** Stable id so a repeat click reuses the same guest PaymentIntent. */
  guestAttemptId?: string;
  /** Open or succeeded guest PaymentIntent to reuse instead of creating another. */
  paymentIntentId?: string;
  /** Called once the server has a PaymentIntent, before the card is confirmed. */
  onPaymentIntent?: (paymentIntentId: string) => void;
  /** Dashboard annual report row. The server prices the late fee from this year. */
  annualReportId?: string;
  /** Draft validated on the server before a PaymentIntent is created. */
  annualReport?: unknown;
  /** Extra metadata fields forwarded to the PaymentIntent. */
  metadata?: Record<string, string>;
  /** If provided, the CardElement is skipped and this PM is re-used. */
  savedPaymentMethodId?: string;
  /** Guest checkout mailbox. The server stores it before creating the PaymentIntent. */
  email?: string;
}

export type CardConfirmResult =
  | { paymentIntentId: string }
  | { error: string; code?: string; paymentIntentId?: string };

export interface StripeCardHandle {
  confirm(opts: ConfirmOptions): Promise<CardConfirmResult>;
}

// ── Inner component (has access to useStripe / useElements) ────────────────

const InnerCard = forwardRef(function InnerCard(
  _props: { showCardElement: boolean },
  ref: ForwardedRef<StripeCardHandle>,
) {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    async confirm(opts: ConfirmOptions): Promise<CardConfirmResult> {
      const {
        amountCents,
        cardholderName,
        filingId,
        savedPaymentMethodId,
        certificateSlug,
        purpose,
        couponCode,
        raServiceId,
        useOurRa,
        email,
        annualReportId,
        annualReport,
        entityType,
        guestAttemptId,
        paymentIntentId,
      } = opts;
      if (!stripe) return { error: 'Stripe has not loaded yet. Please wait.' };

      const guestAnnualReport = purpose === 'guest_annual_report';
      // 1. Create PaymentIntent server-side
      const res = await fetch(
        guestAnnualReport
          ? '/api/stripe/payment-intent?purpose=guest_annual_report'
          : '/api/stripe/payment-intent',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          ...(filingId ? { filingId } : {}),
          ...(certificateSlug ? { certificateSlug } : {}),
          ...(purpose ? { purpose } : {}),
          ...(couponCode ? { couponCode } : {}),
          ...(raServiceId ? { raServiceId } : {}),
          ...(typeof useOurRa === 'boolean' ? { useOurRa } : {}),
          ...(email ? { email } : {}),
          ...(entityType ? { entityType } : {}),
          ...(opts.metadata?.documentNumber ? { documentNumber: opts.metadata.documentNumber } : {}),
          ...(guestAttemptId ? { guestAttemptId } : {}),
          ...(paymentIntentId ? { paymentIntentId } : {}),
          ...(annualReportId ? { annualReportId } : {}),
          ...(annualReport ? { annualReport } : {}),
          ...(opts.metadata ? { metadata: opts.metadata } : {}),
          posthogDistinctId: getAnalyticsDistinctId(),
        }),
      });
      const json = await res.json();
      if (json.paymentIntentId) opts.onPaymentIntent?.(json.paymentIntentId);
      if (json.alreadySucceeded && json.paymentIntentId) {
        return { paymentIntentId: json.paymentIntentId };
      }
      if (json.error || !json.clientSecret) {
        const code = typeof json.code === 'string' ? json.code : undefined;
        const locale =
          typeof window !== 'undefined' ? localeFromPublicPath(window.location.pathname) : 'en';
        return {
          error:
            paymentIntentErrorMessage(code, locale) ??
            (typeof json.error === 'string' ? json.error : paymentIntentErrorMessage('create_failed', locale)) ??
            'Could not create payment.',
          ...(code ? { code } : {}),
          ...(json.paymentIntentId ? { paymentIntentId: json.paymentIntentId } : {}),
        };
      }

      // 2. Confirm the PaymentIntent on the client
      let result: Awaited<ReturnType<typeof stripe.confirmCardPayment>>;

      if (savedPaymentMethodId) {
        // Returning customer - re-use stored PM
        result = await stripe.confirmCardPayment(json.clientSecret, {
          payment_method: savedPaymentMethodId,
        });
      } else {
        // New card via CardElement
        const cardElement = elements?.getElement(CardElement);
        if (!cardElement) return { error: 'Card element not mounted.' };
        result = await stripe.confirmCardPayment(json.clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: { name: cardholderName },
          },
        });
      }

      if (result.error) {
        return {
          error: result.error.message ?? 'Payment failed.',
          ...(json.paymentIntentId ? { paymentIntentId: json.paymentIntentId } : {}),
        };
      }

      return { paymentIntentId: result.paymentIntent!.id };
    },
  }));

  if (!_props.showCardElement) return null;

  return (
    <div className="rounded-md border border-input bg-background px-3 py-3 text-sm">
      <CardElement
        options={{
          style: {
            base: {
              fontSize: '15px',
              color: '#1a1a2e',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              '::placeholder': { color: '#9ca3af' },
            },
            invalid: { color: '#ef4444' },
          },
          hidePostalCode: false,
        }}
      />
    </div>
  );
});

// ── Public component (provides Elements context) ────────────────────────────

interface StripeCardInputProps {
  /** Pass false when a saved card is selected - hides the CardElement. */
  showCardElement?: boolean;
}

export const StripeCardInput = forwardRef<StripeCardHandle, StripeCardInputProps>(
  function StripeCardInput({ showCardElement = true }, ref) {
    return (
      <Elements stripe={stripePromise}>
        <InnerCard ref={ref} showCardElement={showCardElement} />
      </Elements>
    );
  },
);
