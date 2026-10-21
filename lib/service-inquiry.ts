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
