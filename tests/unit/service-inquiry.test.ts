import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ServiceInquirySchema,
  inquiryFieldErrors,
  inquiryHoneypotTripped,
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
    expect(form).not.toContain('name="email"');
    expect(form).not.toContain('name="message"');
    expect(form).not.toContain('name="website"');
    expect(form).toContain("trackEvent('form_started'");
    expect(form).toContain("trackEvent('form_submitted', { service, success: true }");
    expect(form).toContain("trackEvent('form_submitted', { service, success: false }");
    expect(form).toContain('data-testid="service-inquiry-success"');
    expect(form).toContain('data-testid="service-inquiry-error"');
    expect(form).toContain("useState<ServiceInquiryOption | ''>('')");
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
    expect(action).toContain("type: 'SERVICE_INQUIRY'");
    expect(action).toContain('INQUIRY_NOTIFY_EMAIL');
    expect(action).toContain('inquiryHoneypotTripped');
  });
});
