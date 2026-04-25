import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { TIERS, ADD_ONS } from '../lib/pricing';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Wipe existing data ─────────────────────────────────────────
  await prisma.filingAdditionalService.deleteMany();
  await prisma.adminAction.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.annualReport.deleteMany();
  await prisma.emailNotification.deleteMany();
  await prisma.registeredAgentService.deleteMany();
  await prisma.document.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.managerMember.deleteMany();
  await prisma.filingStep.deleteMany();
  await prisma.filing.deleteMany();
  await prisma.user.deleteMany();
  await prisma.additionalService.deleteMany();
  await prisma.pricingTier.deleteMany();
  await prisma.state.deleteMany();

  // ─── States ─────────────────────────────────────────────────────
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
      expressProcessingFeeCents: 0,
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

  // States we list as "Coming soon" for the marketing UI
  const comingSoon = [
    ['CA', 'California'], ['NY', 'New York'], ['TX', 'Texas'], ['DE', 'Delaware'],
    ['NV', 'Nevada'], ['IL', 'Illinois'], ['GA', 'Georgia'], ['NC', 'North Carolina'],
  ];
  for (const [code, name] of comingSoon) {
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

  // ─── Pricing tiers ──────────────────────────────────────────────
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

  // ─── Additional services ───────────────────────────────────────
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

  // ─── Demo users ─────────────────────────────────────────────────
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

  // ─── Sample completed filing for demo ───────────────────────────
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
      correspondenceContact: JSON.stringify({
        email: 'demo@inc.demo',
        phone: '+13055550100',
      }),
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

  // Seed a few outbox emails for realism
  const sampleEmails = [
    {
      type: 'WELCOME',
      subject: 'Welcome to Sunbiz Express ☀️',
      tpl: 'welcome',
      bodyText: 'Welcome aboard',
      offsetMs: 9 * 24 * 60 * 60 * 1000,
    },
    {
      type: 'FILING_STARTED',
      subject: 'Your filing for Sunshine Coast Ventures LLC is started',
      tpl: 'filing_started',
      bodyText: 'Filing started',
      offsetMs: 8 * 24 * 60 * 60 * 1000,
    },
    {
      type: 'PAYMENT_CONFIRMATION',
      subject: 'Payment confirmed for Sunshine Coast Ventures LLC',
      tpl: 'payment_confirmation',
      bodyText: 'Payment received',
      offsetMs: 5 * 24 * 60 * 60 * 1000,
    },
    {
      type: 'FILING_SUBMITTED',
      subject: 'Sunshine Coast Ventures LLC has been filed with the State of Florida',
      tpl: 'filing_submitted',
      bodyText: 'Submitted',
      offsetMs: 5 * 24 * 60 * 60 * 1000,
    },
    {
      type: 'FILING_APPROVED',
      subject: '🎉 Sunshine Coast Ventures LLC is officially formed!',
      tpl: 'filing_approved',
      bodyText: 'Approved!',
      offsetMs: 3 * 24 * 60 * 60 * 1000,
    },
  ];

  for (const e of sampleEmails) {
    await prisma.emailNotification.create({
      data: {
        notificationType: e.type,
        recipientEmail: demoUser.email,
        subject: e.subject,
        templateName: e.tpl,
        htmlBody: `<!doctype html><html><head><style>body{font-family:Inter,sans-serif;padding:32px;color:#0F1F1C;background:#F8FAF9;max-width:560px;margin:0 auto}h1{font-size:22px;margin:0 0 12px}p{color:#475A56;line-height:1.6}.cta{display:inline-block;background:#0B7A6B;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;margin-top:8px}</style></head><body><div style="text-align:center;padding-bottom:16px"><span style="display:inline-block;width:32px;height:32px;background:#0B7A6B;border-radius:8px;color:#fff;font-weight:bold;line-height:32px">SE</span> <span style="margin-left:8px;font-weight:600">Sunbiz Express</span></div><h1>${e.bodyText}</h1><p>This is a sample email rendered for the demo.</p></body></html>`,
        status: 'SENT',
        sentAt: new Date(Date.now() - e.offsetMs),
        userId: demoUser.id,
        filingId: sampleFiling.id,
        createdAt: new Date(Date.now() - e.offsetMs),
      },
    });
  }

  console.log('✅ Seed complete.');
  console.log('');
  console.log('   Demo accounts:');
  console.log('   • admin@inc.demo / Demo1234!  (admin)');
  console.log('   • demo@inc.demo  / Demo1234!  (user with sample filing)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
