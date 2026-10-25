import { describe, expect, it } from 'vitest';
import {
  PAYMENT_INTENT_ERRORS,
  paymentIntentErrorMessage,
} from '@/lib/payment-intent-errors';

describe('payment intent error copy', () => {
  it('keeps English and maps every code to Spanish on es', () => {
    for (const [code, copy] of Object.entries(PAYMENT_INTENT_ERRORS)) {
      expect(paymentIntentErrorMessage(code, 'en'), code).toBe(copy.en);
      expect(paymentIntentErrorMessage(code, 'es'), code).toBe(copy.es);
      expect(paymentIntentErrorMessage(code, null), code).toBe(copy.en);
      expect(copy.es, code).not.toBe(copy.en);
      expect(copy.es, code).not.toContain('\u2014');
      expect(copy.es, code).not.toMatch(/Bienvenid/i);
      expect(copy.es, code).not.toMatch(/vosotros|ustedes/i);
    }
  });

  it('uses tú and leaves unknown codes unmapped', () => {
    expect(paymentIntentErrorMessage('rate_limited', 'es')).toBe(
      'Demasiados intentos. Espera un momento.',
    );
    expect(paymentIntentErrorMessage('invalid_email', 'es')).toBe('Escribe un correo válido.');
    expect(paymentIntentErrorMessage('existing_account', 'es')).toContain('tu cuenta');
    expect(paymentIntentErrorMessage('not_a_code', 'es')).toBeNull();
    expect(paymentIntentErrorMessage(undefined, 'es')).toBeNull();
  });
});
