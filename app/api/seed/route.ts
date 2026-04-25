// One-time seeding endpoint. Hit it ONCE after first deploy:
//   curl -X POST "https://YOUR-DEPLOY.vercel.app/api/seed?secret=YOUR_SEED_SECRET"
//
// Requires SEED_SECRET env var set in Vercel. Idempotent — checks if already seeded.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { TIERS, ADD_ONS } from '@/lib/pricing';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const provided = searchParams.get('secret');
  const expected = process.env.SEED_SECRET;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: 'demo@inc.demo' } });
  if (existingUser) {
    return NextResponse.json({ ok: true, alreadySeeded: true });
  }

  // States
  await prisma.state.create({
    data: {
      stateCode: 'FL',
      stateName: 'Florida',
      llcFilingFeeCents: 12_500,
      corpFilingFeeCents: 7_000,
      raFeeCents: 0,
      llcAnnualReportFeeCents: 13_875,
      corpAnnualReportFeeCents: 15_000,
      annualReportLateFeeCents: 40_000,
      standardProcessingDays: 7,
      expressProcessingDays: 1,
      requiresAnnualReport: true,
      annualReportDueMonth: 1,
      annualReportDueDay: 1,
      annualReportEndMonth: 5,
      annualReportEndDay: 1,
      allowsOnlineFiling: true,
      enabled: true,
      formationWizardUrl: 'https://efile.sunbiz.org/llc_file.html',
      searchUrl: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    },
  });

  for (const [code, name] of [
    ['CA', 'California'],
    ['NY', 'New York'],
    ['TX', 'Texas'],
    ['DE', 'Delaware'],
    ['NV', 'Nevada'],
    ['IL', 'Illinois'],
    ['GA', 'Georgia'],
    ['NC', 'North Carolina'],
  ] as [string, string][]) {
    await prisma.state.create({
      data: {
        stateCode: code,
        stateName: name,
        llcFilingFeeCents: 0,
        corpFilingFeeCents: 0,
        raFeeCents: 0,
        llcAnnualReportFeeCents: 0,
        corpAnnualReportFeeCents: 0,
        annualReportLateFeeCents: 0,
        standardProcessingDays: 0,
        expressProcessingDays: 0,
        requiresAnnualReport: false,
        annualReportDueMonth: 1,
        annualReportDueDay: 1,
        annualReportEndMonth: 1,
        annualReportEndDay: 1,
        allowsOnlineFiling: false,
        enabled: false,
      },
    });
  }

  // Pricing tiers
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    await prisma.pricingTier.create({
      data: {
        tierName: t.name,
        tierSlug: t.slug,
        description: t.description,
        displayOrder: i,
        basePriceCents: t.basePriceCents,
        includedFeatures: JSON.stringify(t.features.filter((f) => f.included).map((f) => f.label)),
        includesRegisteredAgentY1: true,
        includesOperatingAgreement: t.slug !== 'BASIC',
        includesEin: t.slug !== 'BASIC',
        includesExpedited: t.slug !== 'BASIC',
        includesCertifiedCopy: t.slug !== 'BASIC',
        includesCertificateOfStatus: t.slug !== 'BASIC',
        includesAnnualCompliance: t.slug === 'PREMIUM',
        includesDomain: t.slug === 'PREMIUM',
        recommended: !!t.recommended,
      },
    });
  }

  // Additional services
  for (let i = 0; i < ADD_ONS.length; i++) {
    const a = ADD_ONS[i];
    await prisma.additionalService.create({
      data: {
        serviceName: a.name,
        serviceSlug: a.slug,
        description: a.description,
        iconKey: a.iconKey,
        priceCents: a.priceCents,
        isRecurring: !!a.recurring,
        recurringInterval: a.recurring ?? null,
        applicableTypes: JSON.stringify(['LLC', 'CORP']),
        displayOrder: i,
        enabled: true,
        category: a.category,
      },
    });
  }

  // Demo users
  const demoPassword = await bcrypt.hash('Demo1234!', 10);
  await prisma.user.create({
    data: {
      email: 'admin@inc.demo',
      passwordHash: demoPassword,
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'ADMIN',
      emailVerified: true,
      accountStatus: 'ACTIVE',
    },
  });
  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@inc.demo',
      passwordHash: demoPassword,
      firstName: 'Daniela',
      lastName: 'Demo',
      role: 'USER',
      emailVerified: true,
      accountStatus: 'ACTIVE',
    },
  });

  // Sample filing
  const sampleFiling = await prisma.filing.create({
    data: {
      userId: demoUser.id,
      entityType: 'LLC',
      state: 'FL',
      businessName: 'Sunshine Coast Ventures LLC',
      nameAvailable: true,
      nameCheckedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      serviceTier: 'STANDARD',
      principalAddress: JSON.stringify({
        street1: '500 Brickell Ave',
        street2: 'Suite 1200',
        city: 'Miami',
        state: 'FL',
        zip: '33131',
      }),
      mailingAddress: JSON.stringify('SAME_AS_PRINCIPAL'),
      registeredAgent: JSON.stringify({
        type: 'internal',
        useOurService: true,
        name: 'Sunbiz Express RA Services LLC',
        email: 'agent@sunbizexpress.example',
        street1: '1234 Sunshine Blvd',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
        signature: 'Daniela Demo',
        signedAt: new Date().toISOString(),
      }),
      correspondenceContact: JSON.stringify({ email: 'demo@inc.demo', phone: '+13055550100' }),
      optionalDetails: JSON.stringify({
        effectiveDate: new Date().toISOString(),
        businessPurpose: 'Real estate investment and consulting',
      }),
      incorporatorSignature: 'Daniela Demo',
      incorporatorSignedAt: new Date(),
      confirmationAccepted: true,
      status: 'APPROVED',
      currentStep: 12,
      completedSteps: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      sunbizFilingNumber: 'L26000001234',
      sunbizTrackingNumber: 'XYZ123ABC456',
      sunbizPin: '4280',
      sunbizSubmittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      sunbizApprovedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      stateFeeCents: 12_500,
      serviceFeeCents: 9_900,
      addOnsTotalCents: 0,
      totalCents: 22_400,
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.managerMember.create({
    data: {
      filingId: sampleFiling.id,
      title: 'AMBR',
      name: 'Daniela Demo',
      street1: '500 Brickell Ave',
      city: 'Miami',
      state: 'FL',
      zip: '33131',
      ownershipPercentage: 100,
    },
  });

  await prisma.payment.create({
    data: {
      filingId: sampleFiling.id,
      userId: demoUser.id,
      stripePaymentIntentId: 'pi_mock_demo_filing_paid',
      amountCents: 22_400,
      status: 'SUCCEEDED',
      stateFilingFeeCents: 12_500,
      formationServiceFeeCents: 9_900,
      cardLast4: '4242',
      cardBrand: 'Visa',
      cardholderName: 'Daniela Demo',
      completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.annualReport.create({
    data: {
      filingId: sampleFiling.id,
      reportYear: new Date().getFullYear() + 1,
      dueDate: new Date(new Date().getFullYear() + 1, 4, 1),
      status: 'PENDING',
      filingFeeCents: 13_875,
      totalCostCents: 13_875,
    },
  });

  return NextResponse.json({
    ok: true,
    seeded: {
      users: 2,
      states: 9,
      pricingTiers: TIERS.length,
      additionalServices: ADD_ONS.length,
      sampleFiling: sampleFiling.id,
    },
    demoCredentials: {
      user: 'demo@inc.demo / Demo1234!',
      admin: 'admin@inc.demo / Demo1234!',
    },
  });
}
