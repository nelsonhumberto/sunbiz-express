import { z } from 'zod';

/** Services offered on the not-in-scope ad landing. */
export const SERVICE_INQUIRY_OPTIONS = [
  'registered_agent',
  'operating_agreement',
  'compliance_alerts',
  'other',
] as const;

export type ServiceInquiryOption = (typeof SERVICE_INQUIRY_OPTIONS)[number];

export const SERVICE_INQUIRY_LABELS: Record<ServiceInquiryOption, string> = {
  registered_agent: 'Registered agent',
  operating_agreement: 'Operating agreement',
  compliance_alerts: 'Compliance alerts',
  other: 'Other',
};

export function isServiceInquiryOption(value: string): value is ServiceInquiryOption {
  return (SERVICE_INQUIRY_OPTIONS as readonly string[]).includes(value);
}

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 && /^[0-9+\-().\s]+$/.test(value);
  });

/**
 * Name, phone/WhatsApp, and service are required. Email is optional so a
 * visitor who only has WhatsApp can finish. `lf_hp` is the honeypot. `website`
 * stays accepted so an old client that still posts that name is treated as a
 * bot, but the form must not use it: browsers autofill `name="website"`.
 */
export const ServiceInquirySchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  service: z.enum(SERVICE_INQUIRY_OPTIONS),
  email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).optional(),
  message: z.string().trim().max(2000).optional(),
  locale: z.enum(['en', 'es']).optional(),
  lf_hp: z.string().optional(),
  website: z.string().optional(),
});

export type ServiceInquiryInput = z.input<typeof ServiceInquirySchema>;

export function inquiryHoneypotTripped(input: {
  lf_hp?: string | null;
  website?: string | null;
}): boolean {
  return Boolean(input.lf_hp?.trim() || input.website?.trim());
}

export function inquiryFieldErrors(input: {
  name: string;
  phone: string;
  service: string;
}): { name?: true; phone?: true; service?: true } {
  const parsed = ServiceInquirySchema.safeParse(input);
  if (parsed.success) return {};
  const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
  return {
    name: fields.has('name') ? true : undefined,
    phone: fields.has('phone') ? true : undefined,
    service: fields.has('service') ? true : undefined,
  };
}
