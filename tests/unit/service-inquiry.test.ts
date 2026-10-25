import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/email';
import {
  inquiryCompanyFieldValues,
  inquiryStoredMessage,
  SERVICE_INQUIRY_LABELS,
  serviceInquirySubjectPrefix,
} from '@/lib/service-inquiry-note';
import {
  ServiceInquirySchema,
  inquiryCollectsCompanyDetails,
  inquiryFieldErrors,
  inquiryHoneypotTripped,
  serviceInquiryFromQuery,
} from '@/lib/service-inquiry';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

describe('service inquiry', () => {
  it('accepts name, phone, and service without an email', () => {
    const parsed = ServiceInquirySchema.safeParse({
      name: 'Ana Ruiz',
      phone: '+1 305 555 0100',
      service: 'compliance_alerts',
      locale: 'es',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBeUndefined();
  });

  it('rejects a blank name, a short phone, and an unknown service', () => {
    expect(
      inquiryFieldErrors({ name: ' ', phone: '123', service: 'not-a-service' }),
    ).toEqual({
      name: true,
      phone: true,
      service: true,
    });
    const parsed = ServiceInquirySchema.safeParse({
      name: 'Ana',
      phone: '555',
      service: 'compliance_alerts',
    });
    expect(parsed.success).toBe(false);
  });

  it('treats a filled honeypot as a bot, including the old website field name', () => {
    expect(inquiryHoneypotTripped({ lf_hp: 'https://spam.test' })).toBe(true);
    expect(inquiryHoneypotTripped({ website: 'filled by autofill' })).toBe(true);
    expect(inquiryHoneypotTripped({ lf_hp: '   ', website: '' })).toBe(false);
  });

  it('keeps the public form to name, phone, and service, and reports both outcomes', () => {
    const form = readFileSync('components/marketing/ServiceInquiryForm.tsx', 'utf8');
    expect(form).toContain('name="name"');
    expect(form).toContain('name="phone"');
    expect(form).toContain('name="service"');
    expect(form).toContain('name="lf_hp"');
    expect(form).toContain('name="documentNumber"');
    expect(form).toContain('name="companyName"');
    expect(form).toContain('inquiryCollectsCompanyDetails(service)');
    expect(form).toContain('value="llc_reinstatement"');
    expect(form).toContain('value="late_annual_report"');
    expect(form).toContain('initialSelection(initialService, companyServices)');
    expect(form).not.toContain('name="email"');
    expect(form).not.toContain('name="message"');
    expect(form).not.toContain('name="website"');
    expect(form).not.toMatch(/annual report/i);
    expect(form).not.toMatch(/sunbiz/i);
    expect(form).not.toMatch(/informe anual/i);
    expect(form).toContain("trackEvent('form_started'");
    expect(form).toContain("trackEvent('form_submitted', { service, success: true }");
    expect(form).toContain("trackEvent('form_submitted', { service, success: false }");
    expect(form).toContain('data-testid="service-inquiry-success"');
    expect(form).toContain('data-testid="service-inquiry-error"');
    expect(form).toContain('data-testid="inquiry-document-number"');
    expect(form).toContain('data-testid="inquiry-company-name"');
    expect(form).toContain('<option value="">{t(\'servicePlaceholder\')}</option>');
    expect(form).toContain('required');
    expect(
      inquiryFieldErrors({ name: 'Ana Ruiz', phone: '+1 305 555 0100', service: '' }),
    ).toEqual({ service: true });
    expect(en.businessServices.servicePlaceholder).toBe('Choose a service');
    expect(en.businessServices.serviceError).toBe('Choose a service.');
    expect(es.businessServices.servicePlaceholder).toBe('Elige un servicio');
    expect(es.businessServices.serviceError).toBe('Elige un servicio.');

    const action = readFileSync('actions/service-inquiry.ts', 'utf8');
    expect(action).toContain('prisma.serviceInquiry.create');
    expect(action).toContain('message: note');
    expect(action).toContain('inquiryStoredMessage');
    expect(action).toContain('serviceInquirySubjectPrefix');
    expect(action).toContain('inquirySunbizDocumentNumber');
    expect(action).toContain('inquiryCompanyName');
    expect(action).toContain("type: 'SERVICE_INQUIRY'");
    expect(action).toContain('INQUIRY_NOTIFY_EMAIL');
    expect(action).toContain('inquiryHoneypotTripped');
    expect(readFileSync('lib/constants.ts', 'utf8')).toContain("'admin@launchforma.com'");

    const landing = readFileSync('app/(compliance-landing)/business-services/page.tsx', 'utf8');
    expect(landing).not.toContain('companyServices');
    expect(landing).not.toContain('llc_reinstatement');
    expect(landing).not.toContain('late_annual_report');
    expect(readFileSync('lib/service-inquiry.ts', 'utf8')).not.toMatch(/annual report|sunbiz|informe anual/i);
  });

  it('maps contact deep links and stores optional company details on the message', () => {
    expect(serviceInquiryFromQuery('reinstatement')).toBe('llc_reinstatement');
    expect(serviceInquiryFromQuery(' late-annual-report ')).toBe('late_annual_report');
    expect(serviceInquiryFromQuery('LLC_REINSTATEMENT')).toBe('llc_reinstatement');
    expect(serviceInquiryFromQuery('registered-agent')).toBe('registered_agent');
    expect(serviceInquiryFromQuery('not-a-service')).toBeNull();
    expect(serviceInquiryFromQuery(null)).toBeNull();
    expect(inquiryCollectsCompanyDetails('llc_reinstatement')).toBe(true);
    expect(inquiryCollectsCompanyDetails('late_annual_report')).toBe(true);
    expect(inquiryCollectsCompanyDetails('other')).toBe(false);

    const parsed = ServiceInquirySchema.safeParse({
      name: 'Ana Ruiz',
      phone: '+1 305 555 0100',
      service: 'llc_reinstatement',
      documentNumber: ' L21000012345 ',
      companyName: ' Acme LLC ',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.documentNumber).toBe('L21000012345');
    expect(parsed.data.companyName).toBe('Acme LLC');

    expect(
      ServiceInquirySchema.safeParse({
        name: 'Ana Ruiz',
        phone: '+1 305 555 0100',
        service: 'late_annual_report',
      }).success,
    ).toBe(true);
    expect(
      ServiceInquirySchema.safeParse({
        name: 'Ana Ruiz',
        phone: '+1 305 555 0100',
        service: 'llc_reinstatement',
        documentNumber: 'x'.repeat(65),
      }).success,
    ).toBe(false);

    expect(
      inquiryStoredMessage({
        service: 'llc_reinstatement',
        documentNumber: 'L21000012345',
        companyName: 'Acme LLC',
      }),
    ).toBe('Sunbiz document number: L21000012345\nCompany name: Acme LLC');
    expect(
      inquiryStoredMessage({
        service: 'late_annual_report',
        message: 'Please call after 5.',
        documentNumber: '  ',
        companyName: 'North\nWind',
      }),
    ).toBe(
      'Please call after 5.\n\nSunbiz document number: Not provided\nCompany name: North Wind',
    );
    expect(
      inquiryStoredMessage({
        service: 'registered_agent',
        documentNumber: 'L21000012345',
        companyName: 'Acme LLC',
      }),
    ).toBeNull();
    expect(
      inquiryCompanyFieldValues({
        service: 'late_annual_report',
        documentNumber: '',
        companyName: 'Acme LLC',
      }),
    ).toEqual({ documentNumber: undefined, companyName: 'Acme LLC' });
    expect(serviceInquirySubjectPrefix('llc_reinstatement')).toBe('[Reinstatement]');
    expect(serviceInquirySubjectPrefix('late_annual_report')).toBe('[Late annual report]');
    expect(serviceInquirySubjectPrefix('other')).toBeUndefined();
    expect(SERVICE_INQUIRY_LABELS.llc_reinstatement).toBe('LLC reinstatement (dissolved company)');
    expect(SERVICE_INQUIRY_LABELS.late_annual_report).toBe('Late annual report');
  });

  it('prefixes the admin alert and lists the company fields', () => {
    const reinstatement = renderTemplate('SERVICE_INQUIRY', {
      inquiryName: 'Ana Ruiz',
      inquiryPhone: '+1 305 555 0100',
      inquiryService: SERVICE_INQUIRY_LABELS.llc_reinstatement,
      inquirySubjectPrefix: serviceInquirySubjectPrefix('llc_reinstatement'),
      inquirySunbizDocumentNumber: '<script>',
      inquiryCompanyName: 'Acme & Co',
    });
    expect(reinstatement.subject).toBe(
      '[Reinstatement] Service request: LLC reinstatement (dissolved company)',
    );
    expect(reinstatement.subject.startsWith('[Reinstatement]')).toBe(true);
    expect(reinstatement.html).toContain('LLC reinstatement (dissolved company)');
    expect(reinstatement.html).toContain('Sunbiz document number');
    expect(reinstatement.html).toContain('Company name');
    expect(reinstatement.html).toContain('&lt;script&gt;');
    expect(reinstatement.html).toContain('Acme &amp; Co');
    expect(reinstatement.html).not.toContain('<script>');

    const late = renderTemplate('SERVICE_INQUIRY', {
      inquiryService: SERVICE_INQUIRY_LABELS.late_annual_report,
      inquirySubjectPrefix: serviceInquirySubjectPrefix('late_annual_report'),
    });
    expect(late.subject).toBe('[Late annual report] Service request: Late annual report');
    expect(late.subject.startsWith('[Late annual report]')).toBe(true);
    expect(late.html).toContain('Sunbiz document number');
    expect(late.html).toContain('Not provided');
    expect(late.html).toContain('>Late annual report<');

    const other = renderTemplate('SERVICE_INQUIRY', {
      inquiryService: 'Registered agent',
    });
    expect(other.subject).toBe('Service request: Registered agent');
    expect(other.html).not.toContain('Sunbiz document number');

    const copy = {
      en: {
        service: en.contactPage.serviceReinstatement,
        late: en.contactPage.serviceLateAnnualReport,
        document: en.contactPage.sunbizDocumentLabel,
        company: en.contactPage.companyNameLabel,
      },
      es: {
        service: es.contactPage.serviceReinstatement,
        late: es.contactPage.serviceLateAnnualReport,
        document: es.contactPage.sunbizDocumentLabel,
        company: es.contactPage.companyNameLabel,
      },
    };
    expect(copy.en).toEqual({
      service: 'LLC reinstatement (dissolved company)',
      late: 'Late annual report',
      document: 'Sunbiz document number',
      company: 'Company name',
    });
    expect(copy.es).toEqual({
      service: 'Reactivación de LLC (empresa disuelta)',
      late: 'Informe anual atrasado',
      document: 'Número de documento en Sunbiz',
      company: 'Nombre de la empresa',
    });
    const spanish = Object.values(copy.es).join('\n');
    expect(spanish).not.toMatch(/—|–/);
    expect(spanish).not.toMatch(/bienvenid|estimad[oa]|señor|señora|amigo/i);
    expect(JSON.stringify(copy)).not.toMatch(/\$\d|precio|tarifa|gratis|free\b|guarantee/i);
    expect(JSON.stringify(en.businessServices)).not.toMatch(/annual report|sunbiz|informe anual/i);
    expect(JSON.stringify(es.businessServices)).not.toMatch(/annual report|sunbiz|informe anual/i);
  });
});
