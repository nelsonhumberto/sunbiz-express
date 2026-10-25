import {
  inquiryCollectsCompanyDetails,
  type ServiceInquiryOption,
} from '@/lib/service-inquiry';

/** English labels for the admin alert. The public form translates its own copy. */
export const SERVICE_INQUIRY_LABELS: Record<ServiceInquiryOption, string> = {
  registered_agent: 'Registered agent',
  operating_agreement: 'Operating agreement',
  compliance_alerts: 'Compliance alerts',
  llc_reinstatement: 'LLC reinstatement (dissolved company)',
  late_annual_report: 'Late annual report',
  other: 'Other',
};

const SUBJECT_PREFIX: Partial<Record<ServiceInquiryOption, string>> = {
  llc_reinstatement: '[Reinstatement]',
  late_annual_report: '[Late annual report]',
};

export function serviceInquirySubjectPrefix(service: ServiceInquiryOption): string | undefined {
  return SUBJECT_PREFIX[service];
}

function oneLine(value: string | null | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Persist the optional document number and company name on the existing
 * message column. Other services keep the visitor message unchanged.
 */
export function inquiryStoredMessage(input: {
  service: ServiceInquiryOption;
  message?: string | null;
  documentNumber?: string | null;
  companyName?: string | null;
}): string | null {
  const base = input.message?.replace(/\r\n/g, '\n').trim() ?? '';
  if (!inquiryCollectsCompanyDetails(input.service)) return base || null;

  const documentNumber = oneLine(input.documentNumber);
  const companyName = oneLine(input.companyName);
  const details = [
    `Sunbiz document number: ${documentNumber || 'Not provided'}`,
    `Company name: ${companyName || 'Not provided'}`,
  ].join('\n');
  return base ? `${base}\n\n${details}` : details;
}

/** Values for the admin email. Blank answers stay unset so the template can say so. */
export function inquiryCompanyFieldValues(input: {
  service: ServiceInquiryOption;
  documentNumber?: string | null;
  companyName?: string | null;
}): { documentNumber?: string; companyName?: string } {
  if (!inquiryCollectsCompanyDetails(input.service)) return {};
  const documentNumber = oneLine(input.documentNumber);
  const companyName = oneLine(input.companyName);
  return {
    documentNumber: documentNumber || undefined,
    companyName: companyName || undefined,
  };
}
