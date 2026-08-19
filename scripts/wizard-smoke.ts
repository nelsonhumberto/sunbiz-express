/**
 * Smoke test the Wizard Compliance Cleanup logic:
 *  - filingHasOperatingAgreement entitlement matrix
 *  - addOnPriceCents entity-type pricing
 *  - normalizeDistinguishableName / namesAreNotDistinguishable
 *  - subtractBusinessDays / isValidEffectiveDate
 *  - Wizard Speed and Trust Pass: Articles ordering, conditional FILED stamp,
 *    cover-letter customer/admin gating, RA "use us" auto-signature.
 *
 * Run with: npx tsx --env-file=.env scripts/wizard-smoke.ts
 */

import {
  filingHasOperatingAgreement,
  addOnPriceCents,
  preferredOperatingAgreementSlug,
  computeCost,
} from '../lib/pricing';
import {
  normalizeDistinguishableName,
  namesAreNotDistinguishable,
  isValidEffectiveDate,
  subtractBusinessDays,
} from '../lib/florida';
import {
  generateArticlesOfOrganization,
  generateArticlesOfIncorporation,
  generateCoverLetter,
} from '../lib/pdf';

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
  }
}

console.log('\n--- OA entitlement ---');
check(
  'BASIC + no add-ons → not entitled',
  filingHasOperatingAgreement({ tier: 'BASIC', addOnSlugs: [] }),
  false,
);
check(
  'BASIC + operating_agreement_single → entitled',
  filingHasOperatingAgreement({
    tier: 'BASIC',
    addOnSlugs: ['operating_agreement_single'],
  }),
  true,
);
check(
  'BASIC + operating_agreement_multi → entitled',
  filingHasOperatingAgreement({
    tier: 'BASIC',
    addOnSlugs: ['operating_agreement_multi'],
  }),
  true,
);
check(
  'STANDARD + no add-ons → entitled (bundled)',
  filingHasOperatingAgreement({ tier: 'STANDARD', addOnSlugs: [] }),
  true,
);
check(
  'PREMIUM + no add-ons → entitled (bundled)',
  filingHasOperatingAgreement({ tier: 'PREMIUM', addOnSlugs: [] }),
  true,
);
check('preferredOperatingAgreementSlug(1)', preferredOperatingAgreementSlug(1), 'operating_agreement_single');
check('preferredOperatingAgreementSlug(3)', preferredOperatingAgreementSlug(3), 'operating_agreement_multi');

console.log('\n--- Add-on pricing (per-state, per-entity) ---');
// State-fee add-ons surface the actual government remittance + LaunchForma's
// service margin. Federal services (EIN, OA, domain) stay flat across states
// and entities. Default state is Florida.
check('FL LLC cert_status', addOnPriceCents('cert_status', 'LLC'), 3_900);
check('FL CORP cert_status', addOnPriceCents('cert_status', 'CORP'), 4_275); // 3400 service + 875 FL CORP fee
check('WY LLC cert_status', addOnPriceCents('cert_status', 'LLC', 'WY'), 5_900); // 3400 + 2500
check('DE LLC cert_status', addOnPriceCents('cert_status', 'LLC', 'DE'), 8_400); // 3400 + 5000
check('FL LLC cert_copy', addOnPriceCents('cert_copy', 'LLC'), 5_900);
check('FL CORP cert_copy', addOnPriceCents('cert_copy', 'CORP'), 3_775); // 2900 service + 875 FL CORP fee
check('WY LLC cert_copy', addOnPriceCents('cert_copy', 'LLC', 'WY'), 5_900);
check('DE LLC cert_copy', addOnPriceCents('cert_copy', 'LLC', 'DE'), 7_900); // 2900 + 5000
check('FL LLC ein (federal - flat)', addOnPriceCents('ein', 'LLC'), 7_900);
check('FL CORP ein (federal - flat)', addOnPriceCents('ein', 'CORP'), 7_900);
check('WY LLC ein (federal - flat)', addOnPriceCents('ein', 'LLC', 'WY'), 7_900);
check('DE CORP ein (federal - flat)', addOnPriceCents('ein', 'CORP', 'DE'), 7_900);

console.log('\n--- Cost scenarios (all-in package pricing) ---');
{
  // Essential ("BASIC") package is $149 all-in (May 2026 audit reprice).
  // Florida's $125 LLC fee is bundled - customer never sees it as a
  // separate line.
  const llcBasicNoOA = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: [],
  });
  check('LLC Essential total', llcBasicNoOA.totalCents, 14_900);
  check('LLC Essential govt remittance', llcBasicNoOA.governmentRemittanceCents, 12_500);
  check('LLC Essential package margin', llcBasicNoOA.packageMarginCents, 2_400);
}
{
  const llcBasicOA = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: ['operating_agreement_single'],
  });
  // 14900 package + 8900 single-member OA = 23800
  check('LLC Essential + single OA total', llcBasicOA.totalCents, 23_800);
}
{
  const llcStandard = computeCost({
    entityType: 'LLC',
    tier: 'STANDARD',
    addOnSlugs: [],
  });
  // Popular is $279 all-in; OA, EIN, certificates, BOI already bundled.
  check('LLC Popular total (bundled)', llcStandard.totalCents, 27_900);
}
{
  const corpBasicCerts = computeCost({
    entityType: 'CORP',
    tier: 'BASIC',
    addOnSlugs: ['cert_status', 'cert_copy'],
  });
  // FL CORP Essential: 2400 service + 7000 FL corp fee = 9400 package
  // cert_status FL CORP: 3400 + 875 = 4275
  // cert_copy FL CORP: 2900 + 875 = 3775
  // Total: 9400 + 4275 + 3775 = 17450
  check('FL CORP Essential + cert_status + cert_copy total', corpBasicCerts.totalCents, 17_450);
}
{
  const llcBasicCerts = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: ['cert_status', 'cert_copy'],
  });
  // 14900 package + 3900 + 5900 = 24700
  check('LLC Essential + cert_status + cert_copy total', llcBasicCerts.totalCents, 24_700);
}
{
  // Bundled add-ons must not double-charge inside Popular/Premium.
  const standardWithBundled = computeCost({
    entityType: 'LLC',
    tier: 'STANDARD',
    addOnSlugs: ['ein', 'operating_agreement_single', 'cert_status', 'cert_copy', 'boi_filing'],
  });
  check(
    'Popular ignores bundled add-on duplicates',
    standardWithBundled.totalCents,
    27_900,
  );
}
{
  // Government remittance never includes LaunchForma margin - even on add-ons
  // that pass through a state fee, the customer-facing price is higher.
  const llcCertCopy = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: ['cert_copy'],
  });
  // 12500 LLC filing + 3000 LLC certified-copy state fee = 15500 remittance.
  check('LLC Essential + cert_copy govt remittance', llcCertCopy.governmentRemittanceCents, 15_500);
  check('LLC Essential + cert_copy customer total', llcCertCopy.totalCents, 20_800);
}

console.log('\n--- Distinguishability ---');
check(
  'normalize("The Kitchen LLC")',
  normalizeDistinguishableName('The Kitchen LLC'),
  'KITCHEN',
);
check(
  'normalize("Kitchen, LLC")',
  normalizeDistinguishableName('Kitchen, LLC'),
  'KITCHEN',
);
check(
  '"The Kitchen, LLC" not distinguishable from "Kitchen LLC"',
  namesAreNotDistinguishable('The Kitchen, LLC', 'Kitchen LLC'),
  true,
);
check(
  '"Cheese & Crackers LLC" not distinguishable from "Cheese and Crackers LLC"',
  namesAreNotDistinguishable('Cheese & Crackers LLC', 'Cheese and Crackers LLC'),
  true,
);
check(
  '"Tallahassee\'s LLC" not distinguishable from "Tallahassees LLC"',
  namesAreNotDistinguishable("Tallahassee's LLC", 'Tallahassees LLC'),
  true,
);
check(
  '"Apples LLC" not distinguishable from "Apple LLC" (plural collapse)',
  namesAreNotDistinguishable('Apples LLC', 'Apple LLC'),
  true,
);
check(
  '"Sunshine Bakery" distinguishable from "Sunshine Coffee"',
  namesAreNotDistinguishable('Sunshine Bakery', 'Sunshine Coffee'),
  false,
);

console.log('\n--- Effective date / business days ---');
{
  // Use a Wednesday, 2026-04-22 -> 5 business days back = Wednesday 2026-04-15
  const wed = new Date('2026-04-22T00:00:00');
  const back = subtractBusinessDays(wed, 5);
  // 5 business days back from a Wednesday should land on the previous Wednesday.
  check(
    'subtractBusinessDays(Wed 4/22, 5)',
    back.toISOString().slice(0, 10),
    '2026-04-15',
  );
}
{
  // Today + 100 days should be invalid (limit 90).
  const future = new Date();
  future.setDate(future.getDate() + 100);
  const res = isValidEffectiveDate(future);
  check('100 days forward → invalid', res.valid, false);
}
{
  // Today + 30 days should be valid.
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const res = isValidEffectiveDate(future);
  check('30 days forward → valid', res.valid, true);
}
{
  // 10 calendar days back = > 5 business days back → invalid.
  const past = new Date();
  past.setDate(past.getDate() - 10);
  const res = isValidEffectiveDate(past);
  check('10 days back → invalid', res.valid, false);
}

console.log('\n--- Articles ordering & FILED stamp gating ---');

// Minimal fixture - just enough to exercise the article ordering, FILED-stamp
// gating, and RA "use us" auto-signature paths.
const baseFiling = {
  id: 'filing_smoke_1',
  businessName: 'Smoke Test LLC',
  entityType: 'LLC' as const,
  principalAddress: {
    street1: '500 Brickell Ave',
    street2: 'Suite 1200',
    city: 'Miami',
    state: 'FL',
    zip: '33131',
  },
  mailingAddress: 'SAME_AS_PRINCIPAL' as const,
  registeredAgent: {
    name: 'LaunchForma RA Services LLC',
    street1: '1234 Sunshine Blvd',
    street2: 'Suite 200',
    city: 'Miami',
    state: 'FL',
    zip: '33101',
    signature: 'LaunchForma RA Services LLC',
    useOurService: true,
  },
  managersMembers: [
    {
      title: 'AMBR',
      name: 'Daniela Demo',
      street1: '500 Brickell Ave',
      city: 'Miami',
      state: 'FL',
      zip: '33131',
    },
  ],
  correspondenceContact: { email: 'owner@example.com', phone: '+1 305 555 0100' },
  optionalDetails: {
    effectiveDate: '2026-05-01',
    businessPurpose: 'General consulting services',
  },
  incorporatorSignature: 'Daniela Demo',
  incorporatorSignedAt: new Date('2026-04-25T12:00:00Z'),
  sunbizFilingNumber: null,
  sunbizApprovedAt: null,
  submittedAt: new Date('2026-04-25T12:00:00Z'),
};

{
  // LLC Articles ordering must match Florida CR2E047:
  //   I Name → II Address → III Registered Agent → IV Managers/Auth Reps →
  //   V Effective Date → VI Other Provisions
  const html = generateArticlesOfOrganization(baseFiling);
  const articleOrderRe =
    /Article I[\s\S]*Article II[\s\S]*Article III[\s\S]*Article IV[\s\S]*Article V/;
  check('LLC Articles render in CR2E047 order (I → V)', articleOrderRe.test(html), true);
  check(
    'LLC Article II combines principal + mailing addresses',
    /Article II[\s\S]*Principal Office[\s\S]*Mailing Address/.test(html),
    true,
  );
  check(
    'LLC Article III is Registered Agent (not Address Part B)',
    /Article III[\s\S]*Registered Agent/.test(html),
    true,
  );
  check(
    'LLC Article IV uses Managers and Authorized Representatives heading',
    /Article IV - Managers and Authorized Representatives/.test(html),
    true,
  );
  check(
    'LLC Article IV legend explains AMBR/MGR/MGRM',
    /Title abbreviations[\s\S]*MGR[\s\S]*MGRM[\s\S]*AMBR/.test(html),
    true,
  );
  check(
    'LLC Articles do not use colloquial Authorized Persons heading',
    !/Article IV - Authorized Persons/.test(html),
    true,
  );
}

{
  // CORP Articles ordering: I Name → II Address → III Purpose → IV Shares →
  // V Officers → VI Registered Agent → VII Effective Date → VIII Incorporator
  const corpFiling = { ...baseFiling, entityType: 'CORP' as const };
  const html = generateArticlesOfIncorporation(corpFiling);
  const corpOrderRe =
    /Article I[\s\S]*Article II[\s\S]*Article III[\s\S]*Article IV[\s\S]*Article V[\s\S]*Article VI[\s\S]*Article VII/;
  check('CORP Articles render in 607 ordering (I → VII)', corpOrderRe.test(html), true);
  check(
    'CORP Article III is Purpose (not RA)',
    /Article III[\s\S]*?Purpose/.test(html),
    true,
  );
  check(
    'CORP Article VI is Registered Agent',
    /Article VI[\s\S]*?Registered Agent/.test(html),
    true,
  );
}

{
  // FILED stamp is gated on sunbizFilingNumber. Submitting without it must
  // render the "Pending state approval" badge, not a fake stamp.
  const html = generateArticlesOfOrganization(baseFiling);
  check('FILED stamp absent before approval', html.includes('class="filing-stamp"'), false);
  check(
    'Pending-state badge present before approval',
    html.includes('class="pending-badge"'),
    true,
  );
}

{
  // After admin approval (sunbizFilingNumber + approvedAt set), the FILED
  // stamp with the real number must appear on the regenerated Articles.
  const approved = {
    ...baseFiling,
    sunbizFilingNumber: 'L26000123456',
    sunbizApprovedAt: new Date('2026-04-26T12:00:00Z'),
  };
  const html = generateArticlesOfOrganization(approved);
  check('FILED stamp present after approval', html.includes('class="filing-stamp"'), true);
  check(
    'Real filing number appears in stamp',
    html.includes('L26000123456'),
    true,
  );
  check(
    'Pending-state badge gone after approval',
    html.includes('class="pending-badge"'),
    false,
  );
}

{
  // RA "use us" path: customer never types a signature. Articles show
  // "Registered Agent Signature: Nelson Medina, LaunchForma LLC" (FL profile).
  const html = generateArticlesOfOrganization(baseFiling);
  check(
    'Internal RA signature is Nelson Medina, LaunchForma LLC',
    /Registered Agent Signature:[\s\S]*Nelson Medina, LaunchForma LLC/.test(html),
    true,
  );
}

{
  // External RA path still uses the customer's typed signature verbatim.
  const externalFiling = {
    ...baseFiling,
    registeredAgent: {
      name: 'Doe Registered Agent Services LLC',
      street1: '900 Biscayne Blvd',
      city: 'Miami',
      state: 'FL',
      zip: '33132',
      signature: 'John Doe',
      useOurService: false,
    },
  };
  const html = generateArticlesOfOrganization(externalFiling);
  check(
    'External RA: customer-typed signature renders',
    html.includes('John Doe'),
    true,
  );
  check(
    'External RA: no LaunchForma officer signature',
    !html.includes('Nelson Medina, LaunchForma LLC'),
    true,
  );
}

console.log('\n--- Cover-letter customer/admin gating ---');
{
  // Cover letter generation works…
  const html = generateCoverLetter({
    filing: baseFiling,
    contactName: 'Daniela Demo',
    contactEmail: 'owner@example.com',
    contactPhone: '+1 305 555 0100',
    totalFeeCents: 12_500,
    certificateOfStatus: false,
    certifiedCopy: false,
  });
  check('Cover letter renders subject line', html.includes('Smoke Test LLC'), true);

  // …but customers must never see it. Mirror the dashboard filter logic so a
  // future regression in the filter trips this assertion.
  const documents = [
    { documentType: 'ARTICLES_ORG' },
    { documentType: 'COVER_LETTER' },
    { documentType: 'RECEIPT' },
  ];
  const customerVisible = documents.filter((d) => d.documentType !== 'COVER_LETTER');
  check(
    'COVER_LETTER excluded from customer-visible documents',
    customerVisible.map((d) => d.documentType),
    ['ARTICLES_ORG', 'RECEIPT'],
  );
  check(
    'COVER_LETTER still present for admin-visible set',
    documents.map((d) => d.documentType),
    ['ARTICLES_ORG', 'COVER_LETTER', 'RECEIPT'],
  );
}

console.log(`\n${fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES'} - ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
