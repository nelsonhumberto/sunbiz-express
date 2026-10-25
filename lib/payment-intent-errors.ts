import { CHECKOUT_BELOW_STATE_FEE_ERROR } from '@/lib/checkout-guard';
import {
  GUEST_CHECKOUT_EMAIL_UNAVAILABLE_CODE,
  GUEST_CHECKOUT_EXISTING_ACCOUNT_CODE,
} from '@/lib/guest-checkout';
import { CHECKOUT_ACCOUNT_REQUIRED } from '@/lib/guest-identity';

/**
 * Stable codes for POST /api/stripe/payment-intent.
 * The wizard shows the Spanish line when the page path is /es.
 * English stays the sentence the API has always returned.
 */
export const PAYMENT_INTENT_ERRORS = {
  rate_limited: {
    en: 'Too many attempts. Please wait a moment.',
    es: 'Demasiados intentos. Espera un momento.',
  },
  start_filing_first: {
    en: 'Please start a filing first.',
    es: 'Empieza un trámite primero.',
  },
  create_failed: {
    en: 'Could not create payment.',
    es: 'No se pudo crear el pago.',
  },
  filing_not_found: {
    en: 'Filing not found.',
    es: 'No encontramos el trámite.',
  },
  account_required: {
    en: CHECKOUT_ACCOUNT_REQUIRED,
    es: 'Crea una cuenta antes de pagar.',
  },
  [GUEST_CHECKOUT_EXISTING_ACCOUNT_CODE]: {
    en: 'This email already has an account. Sign in and we will attach this draft.',
    es: 'Este correo ya tiene una cuenta. Entra y pasamos este borrador a tu cuenta.',
  },
  [GUEST_CHECKOUT_EMAIL_UNAVAILABLE_CODE]: {
    en: "That email can't be used. Enter a different one to pay.",
    es: 'Ese correo no se puede usar. Escribe otro para pagar.',
  },
  already_paid: {
    en: 'This filing has already been paid.',
    es: 'Este trámite ya está pagado.',
  },
  invalid_email: {
    en: 'Enter a valid email.',
    es: 'Escribe un correo válido.',
  },
  invalid_coupon: {
    en: 'This coupon code is invalid.',
    es: 'Este código de cupón no es válido.',
  },
  below_state_fee: {
    en: CHECKOUT_BELOW_STATE_FEE_ERROR,
    es: 'Este total queda por debajo de la tarifa estatal del paquete elegido.',
  },
  company_not_found: {
    en: 'Company not found.',
    es: 'No encontramos la empresa.',
  },
  document_included: {
    en: 'This document is already included.',
    es: 'Este documento ya está incluido.',
  },
  document_not_ready: {
    en: 'This document can be ordered once your company is filed.',
    es: 'Puedes pedir este documento cuando la empresa ya esté presentada.',
  },
} as const;

export type PaymentIntentErrorCode = keyof typeof PAYMENT_INTENT_ERRORS;

export function isPaymentIntentErrorCode(code: string | null | undefined): code is PaymentIntentErrorCode {
  return Boolean(code && Object.prototype.hasOwnProperty.call(PAYMENT_INTENT_ERRORS, code));
}

/** Copy for a payment-intent code. Spanish only when locale is es. Unknown codes return null. */
export function paymentIntentErrorMessage(
  code: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  if (!isPaymentIntentErrorCode(code)) return null;
  return locale === 'es' ? PAYMENT_INTENT_ERRORS[code].es : PAYMENT_INTENT_ERRORS[code].en;
}
