import { z } from 'zod';

export const AnnualReportAddressSchema = z.object({
  street1: z.string().trim().min(1, 'Enter a street address.'),
  street2: z.string().optional(),
  city: z.string().trim().min(1, 'Enter a city.'),
  state: z.string().trim().min(2, 'Enter a 2-letter state.').max(2, 'Enter a 2-letter state.'),
  zip: z.string().trim().min(5, 'Enter a ZIP code.'),
});

export const AnnualReportOfficerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Enter each officer name.'),
  title: z.string().trim().min(1, 'Enter each officer title.'),
});

/**
 * Fields required before an annual-report card charge.
 * This object can be extended. {@link AnnualReportDraftSchema} adds the
 * signing-officer check used by the payment-intent route and the client.
 */
export const AnnualReportDraftFields = z.object({
  ein: z.string().optional(),
  registeredAgentName: z.string().trim().min(1, 'Enter the registered agent name.'),
  registeredAgentAddress: AnnualReportAddressSchema,
  useOurRa: z.boolean(),
  principalAddress: AnnualReportAddressSchema,
  mailingAddress: AnnualReportAddressSchema,
  officers: z.array(AnnualReportOfficerSchema).min(1, 'Add at least one officer.'),
  signingOfficerName: z.string().trim().min(1, 'Select an officer to sign.'),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Accept the terms to continue.' }),
  }),
});

export function refineAnnualReportDraft(
  data: { officers: { name: string }[]; signingOfficerName: string },
  ctx: z.RefinementCtx,
) {
  const names = data.officers.map((officer) => officer.name.trim());
  if (!names.includes(data.signingOfficerName.trim())) {
    ctx.addIssue({
      code: 'custom',
      message: 'Select an officer from the list to sign.',
      path: ['signingOfficerName'],
    });
  }
}

export const AnnualReportDraftSchema = AnnualReportDraftFields.superRefine(refineAnnualReportDraft);

export type AnnualReportDraft = z.infer<typeof AnnualReportDraftSchema>;

/** First customer-facing problem, or null when the draft can be charged. */
export function annualReportDraftError(input: unknown): string | null {
  const parsed = AnnualReportDraftSchema.safeParse(input);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? 'Check the form and try again.';
}

/**
 * What to do when a customer submits again after a charge.
 * `done` means the report and payment are already stored.
 * `finish` means the charge was saved and the report still needs to be marked filed.
 * `blocked` means the report is filed without this payment.
 * `create` means nothing has been stored yet.
 */
export function annualReportSaveRetry(input: {
  paymentExists: boolean;
  reportFiled: boolean;
}): 'done' | 'finish' | 'blocked' | 'create' {
  if (input.reportFiled && input.paymentExists) return 'done';
  if (input.reportFiled) return 'blocked';
  if (input.paymentExists) return 'finish';
  return 'create';
}
