import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/email';

const STATUS_TYPES = ['FILING_STARTED', 'FILING_SUBMITTED', 'FILING_APPROVED', 'FILING_REJECTED'] as const;

function assertSpanish(text: string) {
  expect(text).not.toMatch(/\u2014|\u2013/);
  expect(text).not.toMatch(/Bienvenid|vosotros|ustedes|\busted\b/i);
}

describe('filing status emails', () => {
  it('keeps the English subjects when locale is missing', () => {
    expect(renderTemplate('FILING_STARTED', { businessName: 'Acme LLC' }).subject).toBe(
      'Your filing for Acme LLC is started',
    );
    expect(renderTemplate('FILING_SUBMITTED', { businessName: 'Acme LLC' }).subject).toBe(
      'We received your order for Acme LLC',
    );
    expect(renderTemplate('FILING_APPROVED', { businessName: 'Acme LLC' }).subject).toBe(
      'Acme LLC is officially formed',
    );
    expect(renderTemplate('FILING_REJECTED', { businessName: 'Acme LLC' }).subject).toBe(
      'Action needed: Acme LLC filing',
    );
  });

  it('uses Spanish subject and body for es, including the shell', () => {
    const started = renderTemplate('FILING_STARTED', { locale: 'es', businessName: 'Acme LLC' });
    expect(started.subject).toBe('Tu trámite para Acme LLC ya empezó');
    expect(started.html).toContain('Tu trámite empezó');
    expect(started.html).toContain('href="https://launchforma.com/es/dashboard"');
    expect(started.html).toContain('lang="es"');
    expect(started.html).not.toContain('is started');

    const submitted = renderTemplate('FILING_SUBMITTED', {
      locale: 'es',
      businessName: 'Acme LLC',
      trackingNumber: 'LF1',
      pin: '4321',
    });
    expect(submitted.subject).toBe('Recibimos tu pedido para Acme LLC');
    expect(submitted.html).toContain('Recibimos tu pedido y estamos preparando tu registro.');
    expect(submitted.html).toContain('LF1');
    expect(submitted.html).toContain('4321');
    expect(submitted.html).toContain('href="https://launchforma.com/es/dashboard"');
    expect(submitted.html).not.toContain('has been submitted');
    expect(submitted.html).not.toContain('Sunbiz');
    expect(submitted.html).not.toMatch(/envió al estado|está en el estado/);

    const approved = renderTemplate('FILING_APPROVED', {
      locale: 'es',
      businessName: 'Acme LLC',
      filingNumber: 'L26000123456',
    });
    expect(approved.subject).toBe('Acme LLC ya es oficial');
    expect(approved.html).toContain('Ya puedes descargar los documentos de formación');
    expect(approved.html).toContain('L26000123456');
    expect(approved.html).not.toContain('officially formed');

    const rejected = renderTemplate('FILING_REJECTED', {
      locale: 'es',
      businessName: 'Acme LLC',
      rejectionReason: 'Nombre duplicado',
    });
    expect(rejected.subject).toBe('Acción necesaria: el trámite de Acme LLC');
    expect(rejected.html).toContain('El estado pidió cambios');
    expect(rejected.html).toContain('Nombre duplicado');
    expect(rejected.html).toContain('No hay una tarifa estatal extra');
    expect(rejected.html).not.toContain('Action needed');

    for (const mail of [started, submitted, approved, rejected]) {
      assertSpanish(mail.subject);
      assertSpanish(mail.html);
    }
  });

  it('falls back to a tú company name and keeps a caller resume link', () => {
    const submitted = renderTemplate('FILING_SUBMITTED', {
      locale: 'es',
      resumeUrl: 'https://launchforma.com/es/wizard/filing_1/2',
    });
    expect(submitted.subject).toBe('Recibimos tu pedido para Tu empresa');
    expect(submitted.html).toContain('href="https://launchforma.com/es/wizard/filing_1/2"');
    expect(renderTemplate('FILING_REJECTED', { locale: 'es' }).subject).toBe(
      'Acción necesaria: el trámite de tu empresa',
    );
  });

  it('says the order was received and is being prepared, in both languages', () => {
    const enSubmitted = renderTemplate('FILING_SUBMITTED', {
      businessName: 'Acme LLC',
      trackingNumber: 'LF1',
      pin: '4321',
    });
    expect(enSubmitted.subject).toBe('We received your order for Acme LLC');
    expect(enSubmitted.html).toContain('We received your order and are preparing your filing.');
    expect(enSubmitted.html).toContain('LF1');
    expect(enSubmitted.html).toContain('4321');
    expect(enSubmitted.html).not.toMatch(/submitted to the state|with the state|Sunbiz/i);

    const enPayment = renderTemplate('PAYMENT_CONFIRMATION', {
      businessName: 'Acme LLC',
      totalCents: 19900,
    });
    expect(enPayment.subject).toBe('Payment confirmed for Acme LLC');
    expect(enPayment.html).toContain('We received your order and are preparing your filing.');
    expect(enPayment.html).toContain('$199');
    expect(enPayment.html).not.toMatch(/submitted to the state/i);

    const esPayment = renderTemplate('PAYMENT_CONFIRMATION', {
      locale: 'es',
      businessName: 'Acme LLC',
      totalCents: 19900,
    });
    expect(esPayment.subject).toBe('Pago confirmado para Acme LLC');
    expect(esPayment.html).toContain('Recibimos tu pedido y estamos preparando tu registro.');
    expect(esPayment.html).not.toMatch(/enviarlo al estado|Sunbiz/);
    assertSpanish(esPayment.subject);
    assertSpanish(esPayment.html);

    const mock = readFileSync('lib/email-mock.ts', 'utf8');
    expect(mock).toContain('We received your order for ${businessName ?? \'your business\'}');
    expect(mock).toContain('We received your order and are preparing your filing.');
    expect(mock).not.toMatch(/being submitted to the Florida|has been filed with the State/);
  });

  it('passes the filing and user locale into every filing-status send', () => {
    const filings = readFileSync('actions/filings.ts', 'utf8');
    const admin = readFileSync('actions/admin.ts', 'utf8');
    expect(filings).toContain("type: 'FILING_STARTED'");
    expect(filings).toContain("type: 'FILING_SUBMITTED'");
    expect(filings).toContain('resolveDripLocale(filing.locale, null, filing.entryPath)');
    expect(filings).toContain('resolveDripLocale(filing.locale, filing.user?.locale, filing.entryPath)');
    expect(admin).toContain("type: 'FILING_APPROVED'");
    expect(admin).toContain("type: 'FILING_REJECTED'");
    expect(admin.match(/resolveDripLocale\(filing\.locale, filing\.user\?\.locale, filing\.entryPath\)/g)).toHaveLength(3);
    for (const type of STATUS_TYPES) {
      expect(readFileSync('lib/email.ts', 'utf8')).toContain(type);
    }
  });
});
