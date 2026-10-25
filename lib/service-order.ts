/**
 * Guest service-order checkout shared by LLC reinstatement and the public
 * annual report. Amounts are computed here. A client amount is accepted
 * only when it matches, and it is never used as the charge.
 */

import { z } from 'zod';
import { guestAnnualReportPrice } from '@/lib/guest-service-price';
import { normalizeFloridaDocumentNumber } from '@/lib/sunbiz';
import {
  quoteReinstatement,
  ReinstatementQuoteError,
  type ReinstatementQuote,
} from '@/lib/reinstatement-quote';

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 && /^[0-9+\-().\s]+$/.test(value);
  }, 'Enter a phone number.');

const documentSchema = z.string().trim().min(5).max(32);

export const ReinstatementCheckoutSchema = z.object({
  type: z.literal('reinstatement'),
  documentNumber: documentSchema,
  companyName: z.string().trim().min(1).max(200),
  sunbizStatus: z.string().trim().max(80).optional().or(z.literal('')),
  years: z.array(z.number().int()).min(1).max(15),
  contactName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: phoneSchema,
  officerName: z.string().trim().min(1).max(120),
  officerTitle: z.string().trim().min(1).max(80),
  changeNote: z.string().trim().max(2000).optional().or(z.literal('')),
  termsAccepted: z.literal(true),
  locale: z.enum(['en', 'es']).optional(),
  amountCents: z.number().int().positive().optional(),
});

export const AnnualReportCheckoutSchema = z.object({
  type: z.literal('annual-report'),
  documentNumber: documentSchema,
  entityType: z.enum(['LLC', 'CORP']),
  useOurRa: z.boolean().optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  amountCents: z.number().int().positive().optional(),
  locale: z.enum(['en', 'es']).optional(),
});

export const ServiceOrderSchema = z.discriminatedUnion('type', [
  ReinstatementCheckoutSchema,
  AnnualReportCheckoutSchema,
]);

export type ReinstatementCheckoutInput = z.infer<typeof ReinstatementCheckoutSchema>;
export type AnnualReportCheckoutInput = z.infer<typeof AnnualReportCheckoutSchema>;

export type PricedServiceOrder =
  | {
      type: 'reinstatement';
      input: ReinstatementCheckoutInput;
      documentNumber: string;
      email: string;
      locale: 'en' | 'es';
      quote: ReinstatementQuote;
      amountCents: number;
    }
  | {
      type: 'annual-report';
      input: AnnualReportCheckoutInput;
      documentNumber: string;
      email: string | null;
      locale: 'en' | 'es';
      amountCents: number;
      entityType: 'LLC' | 'CORP';
      useOurRa: boolean;
    };

export function serviceOrderError(locale: 'en' | 'es', code: 'amount' | 'invalid' | 'rate' | 'payment' | 'account'): string {
  const es = locale === 'es';
  if (code === 'amount') {
    return es
      ? 'El total cambió. Actualiza la página e inténtalo de nuevo.'
      : 'The total changed. Refresh the page and try again.';
  }
  if (code === 'rate') {
    return es ? 'Demasiados intentos. Espera un momento.' : 'Too many attempts. Please wait a moment.';
  }
  if (code === 'payment') {
    return es ? 'No pudimos iniciar el pago. Inténtalo de nuevo.' : 'Could not start payment. Please try again.';
  }
  if (code === 'account') {
    return es
      ? 'Ya existe una cuenta con este correo. Entra y vuelve a enviar el pedido.'
      : 'An account already exists for this email. Sign in, then submit the order again.';
  }
  return es ? 'Revisa el formulario e inténtalo de nuevo.' : 'Check the form and try again.';
}

/**
 * Reject a client total that does not match the server quote. Missing
 * client amounts are allowed. The charge is always `serverAmountCents`.
 */
export function enforceServerAmount(
  clientAmountCents: number | undefined,
  serverAmountCents: number,
): { ok: true } | { ok: false } {
  if (clientAmountCents == null) return { ok: true };
  if (!Number.isInteger(clientAmountCents) || clientAmountCents !== serverAmountCents) {
    return { ok: false };
  }
  return { ok: true };
}

export function serviceOrderIdempotencyKey(input: {
  type: 'reinstatement' | 'annual-report';
  documentNumber: string;
  amountCents: number;
  years?: number[];
  entityType?: string;
  useOurRa?: boolean;
  email?: string | null;
}): string {
  const years = [...(input.years ?? [])].sort((a, b) => a - b).join('.');
  const email = (input.email ?? '').toLowerCase().replace(/[^a-z0-9@._+-]/g, '');
  const raw = [
    'svc',
    input.type,
    input.documentNumber,
    String(input.amountCents),
    years,
    input.entityType ?? '',
    input.useOurRa ? 'ra' : '',
    email,
  ].join('_');
  return raw.slice(0, 255);
}

export function reinstatementStripeMetadata(documentNumber: string, years: number[]): Record<string, string> {
  return {
    type: 'reinstatement',
    documentNumber,
    years: [...years].sort((a, b) => a - b).join(','),
  };
}

function normalizeDoc(raw: string): string | null {
  const documentNumber = normalizeFloridaDocumentNumber(raw);
  if (documentNumber.length < 5 || documentNumber.length > 20) return null;
  return documentNumber;
}

export function priceServiceOrder(
  body: unknown,
  now: Date = new Date(),
): { ok: true; order: PricedServiceOrder } | { ok: false; locale: 'en' | 'es' } {
  const parsed = ServiceOrderSchema.safeParse(body);
  if (!parsed.success) {
    const locale = body && typeof body === 'object' && (body as { locale?: string }).locale === 'es' ? 'es' : 'en';
    return { ok: false, locale };
  }
  const locale = parsed.data.locale === 'es' ? 'es' : 'en';
  const documentNumber = normalizeDoc(parsed.data.documentNumber);
  if (!documentNumber) return { ok: false, locale };

  if (parsed.data.type === 'annual-report') {
    const useOurRa = parsed.data.useOurRa === true;
    const price = guestAnnualReportPrice(parsed.data.entityType, useOurRa);
    return {
      ok: true,
      order: {
        type: 'annual-report',
        input: parsed.data,
        documentNumber,
        email: parsed.data.email?.trim() ? parsed.data.email.trim().toLowerCase() : null,
        locale,
        amountCents: price.totalCents,
        entityType: parsed.data.entityType,
        useOurRa,
      },
    };
  }

  let quote: ReinstatementQuote;
  try {
    quote = quoteReinstatement({ years: parsed.data.years, now });
  } catch (err) {
    if (err instanceof ReinstatementQuoteError) return { ok: false, locale };
    throw err;
  }
  return {
    ok: true,
    order: {
      type: 'reinstatement',
      input: parsed.data,
      documentNumber,
      email: parsed.data.email.trim().toLowerCase(),
      locale,
      quote,
      amountCents: quote.totalCents,
    },
  };
}

export function reinstatementInquiryMessage(order: Extract<PricedServiceOrder, { type: 'reinstatement' }>): string {
  const input = order.input;
  const note = input.changeNote?.trim();
  return [
    'LLC reinstatement checkout started. Payment is not complete.',
    `Document: ${order.documentNumber}`,
    `Company: ${input.companyName.trim()}`,
    `Sunbiz status: ${input.sunbizStatus?.trim() || 'Not provided'}`,
    `Years: ${order.quote.years.join(', ')}`,
    `Contact: ${input.contactName.trim()}`,
    `Email: ${order.email}`,
    `Phone: ${input.phone.trim()}`,
    `Officer: ${input.officerName.trim()}, ${input.officerTitle.trim()}`,
    note ? `Officer/manager changes: ${note}` : 'Officer/manager changes: none noted',
    `Quoted total cents: ${order.amountCents}`,
  ].join('\n');
}
