import { z } from 'zod';

/** Services offered on the not-in-scope ad landing, plus contact-only services. */
export const SERVICE_INQUIRY_OPTIONS = [
  'registered_agent',
  'operating_agreement',
  'compliance_alerts',
  'llc_reinstatement',
  'late_annual_report',
  'other',
] as const;

export type ServiceInquiryOption = (typeof SERVICE_INQUIRY_OPTIONS)[number];

/**
 * Contact-page services that ask for an optional document number and company
 * name. The ad landing does not pass copy for these options.
 */
export const COMPANY_DETAIL_SERVICES = ['llc_reinstatement', 'late_annual_report'] as const;

export type CompanyDetailService = (typeof COMPANY_DETAIL_SERVICES)[number];

const SERVICE_QUERY_ALIASES: Record<string, ServiceInquiryOption> = {
  registered_agent: 'registered_agent',
  'registered-agent': 'registered_agent',
  operating_agreement: 'operating_agreement',
  'operating-agreement': 'operating_agreement',
  compliance_alerts: 'compliance_alerts',
  'compliance-alerts': 'compliance_alerts',
  reinstatement: 'llc_reinstatement',
  llc_reinstatement: 'llc_reinstatement',
  'llc-reinstatement': 'llc_reinstatement',
  'late-annual-report': 'late_annual_report',
  late_annual_report: 'late_annual_report',
  other: 'other',
};

export function isServiceInquiryOption(value: string): value is ServiceInquiryOption {
  return (SERVICE_INQUIRY_OPTIONS as readonly string[]).includes(value);
}

export function inquiryCollectsCompanyDetails(service: string): service is CompanyDetailService {
  return (COMPANY_DETAIL_SERVICES as readonly string[]).includes(service);
}

/** Map `?service=` deep links onto a known option. Unknown values stay unselected. */
export function serviceInquiryFromQuery(value: string | null | undefined): ServiceInquiryOption | null {
  const key = value?.trim().toLowerCase() ?? '';
  if (!key) return null;
  return SERVICE_QUERY_ALIASES[key] ?? null;
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
  /** Optional. Collected for the two contact-only company services. */
  documentNumber: z.string().trim().max(64).optional(),
  /** Optional company name for those same contact-only services. */
  companyName: z.string().trim().max(200).optional(),
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
