import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';
import {
  adminAddOnLabel,
  certificateIncluded,
  certificateOffer,
  certificateOrderPath,
  certificateOrderQuote,
  displayedCertificateTitle,
  type CertificateAddOnSlug,
} from '@/lib/certificate-addons';
import {
  ADD_ON_BY_SLUG,
  addOnPriceCents,
  addOnPriceParts,
  tierPackagePriceCents,
} from '@/lib/pricing';
import {
  certificateOfStatusFeeCents,
  certifiedCopyFeeCents,
  type StateCode,
} from '@/lib/formation-states';

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

const SLUGS: CertificateAddOnSlug[] = ['cert_status', 'cert_copy'];
const STATES: StateCode[] = ['FL', 'WY', 'DE'];

function keys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

describe('certificate dashboard eligibility', () => {
  it('hides both add-ons until the company is filed or approved', () => {
    for (const status of ['DRAFT', 'REJECTED', 'ABANDONED', '']) {
      for (const slug of SLUGS) {
        expect(
          certificateOffer({
            slug,
            status,
            tier: 'BASIC',
            filingSource: 'WIZARD',
            addOnSlugs: [],
          }).kind,
        ).toBe('hidden');
      }
    }
  });

  it('offers them on a filed or approved Essential filing that has not bought them', () => {
    for (const status of ['SUBMITTED', 'APPROVED']) {
      for (const slug of SLUGS) {
        expect(
          certificateOffer({
            slug,
            status,
            tier: 'BASIC',
            filingSource: 'WIZARD',
            addOnSlugs: [],
          }),
        ).toEqual({ kind: 'orderable' });
      }
    }
  });

  it('treats Popular and Premium formation packages as already included', () => {
    for (const tier of ['STANDARD', 'PREMIUM'] as const) {
      for (const slug of SLUGS) {
        const offer = certificateOffer({
          slug,
          status: 'APPROVED',
          tier,
          filingSource: 'WIZARD',
          addOnSlugs: [],
        });
        expect(offer).toEqual({ kind: 'included', pending: false });
        expect(
          certificateIncluded({
            slug,
            status: 'APPROVED',
            tier,
            filingSource: 'WIZARD',
            addOnSlugs: [],
          }),
        ).toBe(true);
      }
    }
  });

  it('does not treat a linked company STANDARD tier as a purchased package', () => {
    for (const slug of SLUGS) {
      expect(
        certificateOffer({
          slug,
          status: 'APPROVED',
          tier: 'STANDARD',
          filingSource: 'LINKED',
          addOnSlugs: [],
        }),
      ).toEqual({ kind: 'orderable' });
    }
  });

  it('blocks a slug that was already purchased, without blocking the other document', () => {
    expect(
      certificateOffer({
        slug: 'cert_copy',
        status: 'SUBMITTED',
        tier: 'BASIC',
        filingSource: 'WIZARD',
        addOnSlugs: ['cert_copy'],
      }),
    ).toEqual({ kind: 'included', pending: false });
    expect(
      certificateOffer({
        slug: 'cert_status',
        status: 'SUBMITTED',
        tier: 'BASIC',
        filingSource: 'WIZARD',
        addOnSlugs: ['cert_copy'],
      }),
    ).toEqual({ kind: 'orderable' });
  });

  it('blocks a document that is already on the filing and marks a pending file', () => {
    const offer = certificateOffer({
      slug: 'cert_status',
      status: 'APPROVED',
      tier: 'BASIC',
      filingSource: 'WIZARD',
      addOnSlugs: [],
      documents: [{ documentType: 'CERT_STATUS', pendingState: true }],
    });
    expect(offer).toEqual({ kind: 'included', pending: true });
    expect(
      certificateOffer({
        slug: 'cert_copy',
        status: 'APPROVED',
        tier: 'BASIC',
        filingSource: 'LINKED',
        addOnSlugs: [],
        documents: [{ documentType: 'CERT_STATUS', pendingState: true }],
      }),
    ).toEqual({ kind: 'orderable' });
  });

  it('uses the dashboard URL for each add-on and keeps Spanish', () => {
    expect(certificateOrderPath('fil_1', 'cert_status')).toBe(
      '/dashboard/filings/fil_1/certificates/cert_status',
    );
    expect(certificateOrderPath('fil_1', 'cert_copy')).toBe(
      '/dashboard/filings/fil_1/certificates/cert_copy',
    );
    expect(certificateOrderPath('fil_1', 'cert_status', 'es')).toBe(
      '/es/dashboard/filings/fil_1/certificates/cert_status',
    );
    expect(certificateOrderPath('fil_1', 'cert_copy', 'es')).toBe(
      '/es/dashboard/filings/fil_1/certificates/cert_copy',
    );
  });

  it('shows a translated certificate title and leaves other documents alone', () => {
    expect(
      displayedCertificateTitle('CERT_STATUS', 'Certificate of Status', {
        CERT_STATUS: 'Certificado de estado',
        CERT_COPY: 'Copia certificada',
      }),
    ).toBe('Certificado de estado');
    expect(
      displayedCertificateTitle('CERT_COPY', 'Certified Copy of Articles', {
        CERT_COPY: 'Copia certificada',
      }),
    ).toBe('Copia certificada');
    expect(displayedCertificateTitle('RECEIPT', 'Receipt', {})).toBe('Receipt');
  });

  it('labels the admin add-on without the Handling suffix', () => {
    expect(adminAddOnLabel('cert_status', 'Certificate of Status Handling')).toBe(
      'Certificate of Status',
    );
    expect(adminAddOnLabel('cert_copy', 'Certified Copy Handling')).toBe('Certified Copy');
    expect(adminAddOnLabel('registered_agent', 'Registered Agent Service')).toBe(
      'Registered Agent Service',
    );
  });
});

describe('certificate dashboard pricing', () => {
  it('keeps the Florida LLC package prices', () => {
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(14_900);
    expect(tierPackagePriceCents('STANDARD', 'LLC', 'FL')).toBe(27_900);
    expect(tierPackagePriceCents('PREMIUM', 'LLC', 'FL')).toBe(44_900);
  });

  it('composes each certificate as the catalog service fee plus the state fee', () => {
    expect(ADD_ON_BY_SLUG.cert_status.serviceMarginCents).toBe(3_400);
    expect(ADD_ON_BY_SLUG.cert_copy.serviceMarginCents).toBe(2_900);

    for (const state of STATES) {
      for (const entityType of ['LLC', 'CORP'] as const) {
        for (const slug of SLUGS) {
          const quote = certificateOrderQuote(slug, entityType, state);
          const stateFee =
            slug === 'cert_status'
              ? certificateOfStatusFeeCents(state, entityType)
              : certifiedCopyFeeCents(state, entityType);
          expect(quote.serviceCents).toBe(ADD_ON_BY_SLUG[slug].serviceMarginCents);
          expect(quote.stateFeeCents).toBe(stateFee);
          expect(quote.totalCents).toBe(quote.serviceCents + quote.stateFeeCents);
          expect(quote).toEqual(addOnPriceParts(slug, entityType, state));
          expect(quote.totalCents).toBe(addOnPriceCents(slug, entityType, state));
        }
      }
    }
  });

  it('shows a Florida LLC certificate of status as $34 plus $5 and a certified copy as $29 plus $30', () => {
    expect(certificateOrderQuote('cert_status', 'LLC', 'FL')).toEqual({
      serviceCents: 3_400,
      stateFeeCents: 500,
      totalCents: 3_900,
    });
    expect(certificateOrderQuote('cert_copy', 'LLC', 'FL')).toEqual({
      serviceCents: 2_900,
      stateFeeCents: 3_000,
      totalCents: 5_900,
    });
  });
});

describe('certificate copy', () => {
  it('keeps English and Spanish keys aligned and free of em dashes', () => {
    expect(keys(en.certificates)).toEqual(keys(es.certificates));
    const blob = JSON.stringify(en.certificates) + JSON.stringify(es.certificates);
    expect(blob).not.toMatch(/\u2014|\u2013/);
    expect(en.certificates.alreadyIncluded).toBe('Already included');
    expect(es.certificates.alreadyIncluded).toBe('Ya incluido');
    expect(es.certificates.statusTitle).toMatch(/certificado de estado/i);
    expect(es.certificates.copyTitle).toMatch(/copia certificada/i);
    expect(en.certificates.statusIntroIncluded).not.toMatch(/pay the state fee/i);
    expect(en.certificates.copyIntroIncluded).not.toMatch(/pay the state fee/i);
    expect(es.certificates.statusIntroIncluded).not.toMatch(/pagamos la tarifa/i);
    expect(es.certificates.copyIntroIncluded).not.toMatch(/pagamos la tarifa/i);
    expect(en.certificates.statusIntro).toMatch(/pay the state fee/i);
  });

  it('keeps certificate links and hidden-offer redirects on the locale', () => {
    const filing = source('app/(app)/dashboard/filings/[id]/page.tsx');
    const order = source('app/(app)/dashboard/filings/[id]/certificates/[slug]/page.tsx');
    expect(filing).toContain("from '@/i18n/navigation'");
    expect(filing).toContain('LocaleLink');
    expect(filing).toContain('certificateOrderPath(filing.id, slug)');
    expect(filing).toContain('locale={locale}');
    expect(order).toContain("from '@/i18n/navigation'");
    expect(order).toContain('redirect({ href: `/dashboard/filings/${filing.id}`, locale })');
    expect(order).toContain('redirect({ href: \'/sign-in\', locale: requestLocale })');
    expect(order).not.toContain('redirect(`/dashboard/filings/');
    expect(order).toContain('statusIntroIncluded');
    expect(order).toContain('copyIntroIncluded');
  });
});
