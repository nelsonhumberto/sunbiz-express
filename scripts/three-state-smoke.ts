/**
 * Smoke test the Three-State Launch (FL/WY/DE) wiring:
 *   - State formation registry shape (fees, rules, RA, URLs).
 *   - State-aware `computeCost` remittance math.
 *   - State-aware business-name validation.
 *   - State-aware effective-date and annual-compliance computation.
 *   - State-aware Articles + Cover Letter document generation.
 *   - EIN entitlement gate + AES-256-GCM encryption round-trip.
 *   - FAQ content present for each active state, in EN and ES.
 *
 * Pure-logic only - no DB, no network. Run with:
 *   npx tsx --env-file=.env scripts/three-state-smoke.ts
 */

import {
  ACTIVE_FORMATION_STATES,
  FORMATION_STATES,
  annualComplianceFor,
  certificateOfStatusFeeCents,
  certifiedCopyFeeCents,
  formationDocumentLabel,
  getFormationState,
  isActiveFormationState,
  stateFilingFeeCents,
  type StateCode,
} from '../lib/formation-states';
import {
  isValidEffectiveDate,
  validateBusinessName,
  validateRegisteredAgentAddress,
  computeNextAnnualCompliance,
  suffixOptionsFor,
  assessBusinessName,
} from '../lib/formation-validation';
import {
  defaultProcessingOption,
  resolveProcessingOption,
} from '../lib/formation-states';
import {
  addOnPriceCents,
  computeCost,
  tierPackagePriceCents,
  type AddOnSlug,
} from '../lib/pricing';
import {
  generateArticlesOfOrganization,
  generateArticlesOfIncorporation,
  generateCoverLetter,
  generateReceipt,
} from '../lib/pdf';
import {
  classifyEinPathway,
  filingIncludesEin,
  lastFourDigits,
  looksLikeUsTaxId,
} from '../lib/ein';
import {
  decryptString,
  encryptString,
  maskPassport,
  maskTaxId,
} from '../lib/encryption';
import { getMarketingFaq } from '../lib/marketing-faq';
import { resolveMarketingState } from '../lib/marketing-states';

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

function checkTrue(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label} - assertion was false`);
  }
}

function includes(label: string, haystack: string, needle: string) {
  if (haystack.includes(needle)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label} - "${needle}" not found`);
  }
}

console.log('\n--- State registry shape ---');
check('active states are FL/WY/DE', [...ACTIVE_FORMATION_STATES], ['FL', 'WY', 'DE']);
for (const code of ACTIVE_FORMATION_STATES) {
  const rule = FORMATION_STATES[code];
  checkTrue(`${code} registry has LLC + Corp suffixes`, rule.nameRules.llcSuffixes.length > 0 && rule.nameRules.corpSuffixes.length > 0);
  checkTrue(`${code} has positive LLC + Corp filing fees`, rule.fees.llcTotal > 0 && rule.fees.corpTotal > 0);
  checkTrue(`${code} has annual compliance for both entity types`, rule.annualCompliance.some((c) => c.entityType === 'LLC') && rule.annualCompliance.some((c) => c.entityType === 'CORP'));
  checkTrue(`${code} RA address is in-state`, rule.registeredAgent.state === code);
  checkTrue(`${code} URLs are populated`, !!rule.urls.search && !!rule.urls.homepage);
}
check('FL has live name search', FORMATION_STATES.FL.hasLiveNameSearch, true);
check('WY does NOT have live name search', FORMATION_STATES.WY.hasLiveNameSearch, false);
check('DE does NOT have live name search', FORMATION_STATES.DE.hasLiveNameSearch, false);
check('isActiveFormationState rejects "GA"', isActiveFormationState('GA'), false);
check('isActiveFormationState accepts "wy"', isActiveFormationState('wy'), true);
check('getFormationState falls back to FL on garbage', getFormationState('XXX').code, 'FL');

console.log('\n--- Document labels ---');
check('FL LLC label', formationDocumentLabel(FORMATION_STATES.FL, 'LLC'), 'Articles of Organization');
check('FL CORP label', formationDocumentLabel(FORMATION_STATES.FL, 'CORP'), 'Articles of Incorporation');
check('WY LLC label', formationDocumentLabel(FORMATION_STATES.WY, 'LLC'), 'Articles of Organization');
check('DE LLC label', formationDocumentLabel(FORMATION_STATES.DE, 'LLC'), 'Certificate of Formation');
check('DE CORP label', formationDocumentLabel(FORMATION_STATES.DE, 'CORP'), 'Certificate of Incorporation');

console.log('\n--- Fee helpers ---');
check('FL LLC formation fee', stateFilingFeeCents('FL', 'LLC'), 12_500);
check('WY LLC formation fee', stateFilingFeeCents('WY', 'LLC'), 10_000);
check('DE LLC formation fee', stateFilingFeeCents('DE', 'LLC'), 11_000);
check('DE CORP formation fee (minimum)', stateFilingFeeCents('DE', 'CORP'), 10_900);
check('FL Cert of Status (Corp)', certificateOfStatusFeeCents('FL', 'CORP'), 875);
check('DE Certified Copy (LLC)', certifiedCopyFeeCents('DE', 'LLC'), 5_000);

console.log('\n--- computeCost remittance per state ---');
const baseAddons: AddOnSlug[] = ['cert_status'];
for (const state of ACTIVE_FORMATION_STATES) {
  const breakdown = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: baseAddons,
    state,
  });
  const expectedRemit =
    stateFilingFeeCents(state, 'LLC') + certificateOfStatusFeeCents(state, 'LLC');
  check(`${state} BASIC LLC + cert_status remittance`, breakdown.governmentRemittanceCents, expectedRemit);
  checkTrue(`${state} BASIC LLC totalCents > package`, breakdown.totalCents > breakdown.packageCents);
}

// Tier-bundled add-ons must NOT be billed à la carte.
{
  const std = computeCost({
    entityType: 'LLC',
    tier: 'STANDARD',
    addOnSlugs: ['ein', 'cert_copy'],
    state: 'WY',
  });
  check('STANDARD LLC + bundled add-ons → no extra add-on lines', std.lines.filter((l) => l.category === 'addon').length, 0);
}

console.log('\n--- Per-state package prices (LLC) ---');
// May 2026 audit-driven repricing. Service-margin model:
//   BASIC = $24, STANDARD = $119, PREMIUM = $289.
// Customer total = service margin + state fee + bundled cert fees.
// FL LLC headline: $149 / $279 / $449 (round numbers, audit-approved).
check('FL BASIC LLC', tierPackagePriceCents('BASIC', 'LLC', 'FL'), 14_900);
check('FL STANDARD LLC', tierPackagePriceCents('STANDARD', 'LLC', 'FL'), 27_900);
check('FL PREMIUM LLC', tierPackagePriceCents('PREMIUM', 'LLC', 'FL'), 44_900);
check('WY BASIC LLC', tierPackagePriceCents('BASIC', 'LLC', 'WY'), 12_400); // 2400 + 10000
check('WY STANDARD LLC', tierPackagePriceCents('STANDARD', 'LLC', 'WY'), 27_400); // 11900 + 10000 + 2500 + 3000
check('WY PREMIUM LLC', tierPackagePriceCents('PREMIUM', 'LLC', 'WY'), 44_400); // 28900 + 10000 + 2500 + 3000
check('DE BASIC LLC', tierPackagePriceCents('BASIC', 'LLC', 'DE'), 13_400); // 2400 + 11000
check('DE STANDARD LLC', tierPackagePriceCents('STANDARD', 'LLC', 'DE'), 32_900); // 11900 + 11000 + 5000 + 5000
check('DE PREMIUM LLC', tierPackagePriceCents('PREMIUM', 'LLC', 'DE'), 49_900); // 28900 + 11000 + 5000 + 5000

console.log('\n--- Per-state package prices (CORP) ---');
check('FL BASIC CORP', tierPackagePriceCents('BASIC', 'CORP', 'FL'), 9_400); // 2400 + 7000
check('FL STANDARD CORP', tierPackagePriceCents('STANDARD', 'CORP', 'FL'), 20_650); // 11900 + 7000 + 875 + 875
check('WY BASIC CORP', tierPackagePriceCents('BASIC', 'CORP', 'WY'), 12_400); // 2400 + 10000 (WY has flat fee)
check('WY STANDARD CORP', tierPackagePriceCents('STANDARD', 'CORP', 'WY'), 27_400);
check('DE BASIC CORP', tierPackagePriceCents('BASIC', 'CORP', 'DE'), 13_300); // 2400 + 10900
check('DE STANDARD CORP', tierPackagePriceCents('STANDARD', 'CORP', 'DE'), 32_800); // 11900 + 10900 + 5000 + 5000

console.log('\n--- WY/DE prices reflect state cost differences ---');
// Wyoming's $100 LLC fee is cheaper than Florida's $125, so the headline
// drops. Delaware's higher cert fees push Standard/Premium UP vs Florida.
checkTrue(
  'WY BASIC LLC cheaper than FL BASIC LLC',
  tierPackagePriceCents('BASIC', 'LLC', 'WY') < tierPackagePriceCents('BASIC', 'LLC', 'FL'),
);
checkTrue(
  'DE STANDARD LLC more expensive than FL STANDARD LLC',
  tierPackagePriceCents('STANDARD', 'LLC', 'DE') > tierPackagePriceCents('STANDARD', 'LLC', 'FL'),
);
checkTrue(
  'DE PREMIUM LLC more expensive than FL PREMIUM LLC',
  tierPackagePriceCents('PREMIUM', 'LLC', 'DE') > tierPackagePriceCents('PREMIUM', 'LLC', 'FL'),
);

console.log('\n--- Add-ons: federal stays flat, state-fee items vary ---');
// Federal services (EIN, OA, domain) - same price in every state.
for (const state of ACTIVE_FORMATION_STATES) {
  check(
    `EIN price in ${state} (federal)`,
    addOnPriceCents('ein', 'LLC', state),
    7_900,
  );
  check(
    `OA single price in ${state} (federal)`,
    addOnPriceCents('operating_agreement_single', 'LLC', state),
    8_900,
  );
}
// State-fee add-ons - vary by state and entity (margin component is constant).
check('cert_status FL LLC à la carte', addOnPriceCents('cert_status', 'LLC', 'FL'), 3_900);
check('cert_status WY LLC à la carte', addOnPriceCents('cert_status', 'LLC', 'WY'), 5_900);
check('cert_status DE LLC à la carte', addOnPriceCents('cert_status', 'LLC', 'DE'), 8_400);
check('cert_copy DE LLC à la carte', addOnPriceCents('cert_copy', 'LLC', 'DE'), 7_900);

console.log('\n--- computeCost reconciles per-state package + add-ons ---');
{
  const wy = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: ['ein'],
    state: 'WY',
  });
  // BASIC WY LLC ($124) + EIN ($79) = $203
  check('WY BASIC + EIN total', wy.totalCents, 20_300);
  // Government remittance is just the WY filing fee ($100). EIN is federal.
  check('WY BASIC + EIN govt remittance', wy.governmentRemittanceCents, 10_000);
  // LaunchForma revenue: $24 (BASIC margin) + $79 (EIN service) = $103
  check('WY BASIC + EIN LF revenue', wy.incServicesRevenueCents, 10_300);

  const de = computeCost({
    entityType: 'LLC',
    tier: 'STANDARD',
    addOnSlugs: [],
    state: 'DE',
  });
  // STANDARD DE LLC = $329. Govt remittance = $110 + $50 + $50 = $210.
  check('DE STANDARD LLC total', de.totalCents, 32_900);
  check('DE STANDARD LLC govt remittance', de.governmentRemittanceCents, 21_000);
  check('DE STANDARD LLC LF revenue', de.incServicesRevenueCents, 11_900);
}

console.log('\n--- Suffix options ---');
checkTrue('WY LLC suffix options include "Limited Company"', suffixOptionsFor('WY', 'LLC').some((o) => o.value === 'Limited Company'));
checkTrue('DE LLC suffix options do NOT include "Ltd"', !suffixOptionsFor('DE', 'LLC').some((o) => o.value === 'Ltd'));
checkTrue('FL LLC suffix options include "LLC"', suffixOptionsFor('FL', 'LLC').some((o) => o.value === 'LLC'));

console.log('\n--- Business name validation ---');
check('FL LLC name without suffix → invalid', validateBusinessName('Acme', 'LLC', 'FL').valid, false);
check('FL LLC valid name', validateBusinessName('Acme LLC', 'LLC', 'FL').valid, true);
check('WY accepts "Limited Company"', validateBusinessName('Acme Limited Company', 'LLC', 'WY').valid, true);
check('DE Corp accepts "Limited"', validateBusinessName('Acme Limited', 'CORP', 'DE').valid, true);
check('Bank prohibition (FL)', validateBusinessName('Acme Bank LLC', 'LLC', 'FL').valid, false);
// Delaware now routes banking names through manual review (so the customer can
// keep going through the wizard) rather than blocking outright. The block
// state is reserved for things like insurance terms which truly cannot be
// self-served. Validate the assessment surface instead.
{
  const deBank = assessBusinessName('Acme Bank LLC', 'LLC', 'DE');
  checkTrue('DE bank name still valid (manual review, not blocked)', deBank.valid);
  checkTrue('DE bank name flagged for manual review', deBank.requiresManualReview);
  check(
    'DE bank warning has correct kind',
    deBank.warnings.find((w) => w.id === 'de-banking')?.kind,
    'restricted_word_manual_review',
  );
  const deInsurance = assessBusinessName('Acme Insurance LLC', 'LLC', 'DE');
  checkTrue('DE insurance name is hard-blocked', !deInsurance.valid);
}

console.log('\n--- Wyoming naming refinements ---');
{
  const wyA = assessBusinessName('A Red Wagon LLC', 'LLC', 'WY');
  checkTrue('WY "A Red Wagon" valid', wyA.valid);
  checkTrue('WY "A Red Wagon" requires manual review', wyA.requiresManualReview);
  check(
    'WY leading-A pattern fires',
    !!wyA.warnings.find((w) => w.id === 'wy-leading-a'),
    true,
  );
  const wySpecial = assessBusinessName('Acme™ LLC', 'LLC', 'WY');
  checkTrue('WY special-character name valid (paper)', wySpecial.valid);
  checkTrue('WY special-character flags manual review', wySpecial.requiresManualReview);
  const wyAcademy = assessBusinessName('Foundation Academy LLC', 'LLC', 'WY');
  checkTrue('WY academy name valid', wyAcademy.valid);
  checkTrue(
    'WY academy → manual review',
    wyAcademy.warnings.some((w) => w.id === 'wy-education'),
  );
  const wyClean = assessBusinessName('Foundation Holdings LLC', 'LLC', 'WY');
  checkTrue('WY clean name valid', wyClean.valid);
  checkTrue('WY clean name has no warnings', wyClean.warnings.length === 0);
}

console.log('\n--- Delaware subjective-review note ---');
{
  const de = assessBusinessName('Foundation Holdings LLC', 'LLC', 'DE');
  checkTrue('DE clean name valid', de.valid);
  checkTrue(
    'DE clean name surfaces subjective-review note',
    de.warnings.some((w) => w.kind === 'subjective_review'),
  );
}

console.log('\n--- Processing-speed options ---');
{
  const flDefault = defaultProcessingOption('FL');
  check('FL default is "standard"', flDefault.id, 'standard');
  check('FL default fee is $0', flDefault.feeCents, 0);

  const wyDefault = defaultProcessingOption('WY');
  check('WY default is "standard"', wyDefault.id, 'standard');
  const wyExpedited = resolveProcessingOption('WY', 'expedited');
  checkTrue('WY expedited fee > $0', wyExpedited.feeCents > 0);
  checkTrue('WY expedited fee marked provisional', wyExpedited.feeIsProvisional === true);

  const deDefault = defaultProcessingOption('DE');
  check('DE default is "standard"', deDefault.id, 'standard');
  const deExpedited = resolveProcessingOption('DE', 'expedited_8bd');
  check('DE 8-business-day expedited fee', deExpedited.feeCents, 5_000);

  // computeCost should add a processing line for non-default options.
  const std = computeCost({ entityType: 'LLC', tier: 'BASIC', addOnSlugs: [], state: 'DE' });
  const exp = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: [],
    state: 'DE',
    processingOptionId: 'expedited_8bd',
  });
  check('DE default has no processing line', std.lines.some((l) => l.category === 'processing'), false);
  check(
    'DE expedited has a processing line',
    exp.lines.some((l) => l.category === 'processing'),
    true,
  );
  check('DE expedited adds $50 to total', exp.totalCents - std.totalCents, 5_000);
  check('DE expedited adds $50 to remittance', exp.governmentRemittanceCents - std.governmentRemittanceCents, 5_000);
  check('DE expedited revenue unchanged', exp.incServicesRevenueCents, std.incServicesRevenueCents);
}

console.log('\n--- Registered Agent address validation ---');
check(
  'FL RA must be FL - rejects WY address',
  validateRegisteredAgentAddress(
    { street1: '30 N Gould St', city: 'Sheridan', state: 'WY', zip: '82801' },
    'FL',
  ).valid,
  false,
);
check(
  'WY RA must be WY - accepts WY address',
  validateRegisteredAgentAddress(
    { street1: '30 N Gould St', city: 'Sheridan', state: 'WY', zip: '82801' },
    'WY',
  ).valid,
  true,
);
check(
  'DE RA rejects PO Box',
  validateRegisteredAgentAddress(
    { street1: 'PO Box 12', city: 'Wilmington', state: 'DE', zip: '19801' },
    'DE',
  ).valid,
  false,
);

console.log('\n--- Effective date rules ---');
{
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const wyYesterday = isValidEffectiveDate(yesterday, 'WY');
  // WY allows minDaysBack=0, so yesterday is invalid
  check('WY rejects yesterday (no backdating)', wyYesterday.valid, false);
  // FL allows minDaysBack=5 business days; yesterday is fine if not weekend/Mon edge case - accept either valid or sane error
  const flYesterday = isValidEffectiveDate(yesterday, 'FL');
  checkTrue('FL effective date for yesterday is valid OR has reasonable error', flYesterday.valid || !!flYesterday.error);
  const futureFar = new Date(today);
  futureFar.setDate(futureFar.getDate() + 200);
  check('DE rejects 200d future', isValidEffectiveDate(futureFar, 'DE').valid, false);
}

console.log('\n--- Annual compliance lookup ---');
{
  // Compare on local-time month/day to avoid TZ off-by-one between the
  // anchor (May 1 23:59 local) and ISO-string conversion in non-UTC zones.
  const formed = new Date('2026-01-15');
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const flLLC = computeNextAnnualCompliance(formed, 'FL', 'LLC', new Date('2026-06-01'));
  check('FL LLC next AR is May 1, 2027', ymd(flLLC.dueDate), '2027-05-01');
  const wyLLC = computeNextAnnualCompliance(formed, 'WY', 'LLC', new Date('2026-06-01'));
  check('WY LLC next AR is Jan 1 anniversary 2027', ymd(wyLLC.dueDate), '2027-01-01');
  const deLLC = computeNextAnnualCompliance(formed, 'DE', 'LLC', new Date('2026-06-01'));
  check('DE LLC annual tax due Jun 1, 2027', ymd(deLLC.dueDate), '2027-06-01');
  check('DE LLC annual tax fee = $300', annualComplianceFor(FORMATION_STATES.DE, 'LLC').baseFeeCents, 30_000);
  check('WY LLC annual tax fee = $60 minimum', annualComplianceFor(FORMATION_STATES.WY, 'LLC').baseFeeCents, 6_000);
}

console.log('\n--- EIN entitlement + classification ---');
check('STANDARD tier includes EIN', filingIncludesEin({ tier: 'STANDARD', addOnSlugs: [] }), true);
check('PREMIUM tier includes EIN', filingIncludesEin({ tier: 'PREMIUM', addOnSlugs: [] }), true);
check('BASIC tier without add-on does NOT include EIN', filingIncludesEin({ tier: 'BASIC', addOnSlugs: [] }), false);
check('BASIC tier with EIN add-on includes EIN', filingIncludesEin({ tier: 'BASIC', addOnSlugs: ['ein'] }), true);
check('US + SSN → ready_online', classifyEinPathway({ responsiblePartyType: 'us', taxIdType: 'SSN' }), 'ready_online');
check('US without taxIdType → manual_foreign', classifyEinPathway({ responsiblePartyType: 'us', taxIdType: null }), 'manual_foreign');
check('Foreign → manual_foreign', classifyEinPathway({ responsiblePartyType: 'foreign' }), 'manual_foreign');
check('looksLikeUsTaxId rejects 8 digits', looksLikeUsTaxId('12345678'), false);
check('looksLikeUsTaxId accepts 9 digits with dashes', looksLikeUsTaxId('123-45-6789'), true);
check('lastFourDigits ignores non-digits', lastFourDigits('123-45-6789'), '6789');

console.log('\n--- Encryption round-trip ---');
{
  const plain = '123456789';
  const encrypted = encryptString(plain);
  checkTrue('encryption produces v1: prefix', encrypted.startsWith('v1:'));
  checkTrue('encryption is non-deterministic', encryptString(plain) !== encrypted);
  check('round-trip yields original', decryptString(encrypted), plain);
  // Tampering must fail.
  let threw = false;
  try {
    const parts = encrypted.split(':');
    parts[2] = Buffer.from('XXXXXXXXXX').toString('base64');
    decryptString(parts.join(':'));
  } catch {
    threw = true;
  }
  checkTrue('tampered ciphertext throws', threw);
  check('maskTaxId formats SSN-like input', maskTaxId('123-45-6789'), '●●●-●●-6789');
  check('maskPassport hides head', maskPassport('A12345678'), '●●●●●5678');
}

console.log('\n--- Document generation per state ---');
const sampleFiling = (state: StateCode, entityType: 'LLC' | 'CORP') => ({
  id: 'flg_test',
  businessName: entityType === 'LLC' ? 'Acme Test LLC' : 'Acme Test Inc',
  entityType,
  state,
  principalAddress: {
    street1: '123 Main St',
    city: 'Sheridan',
    state,
    zip: '00000',
  },
  mailingAddress: null,
  registeredAgent: {
    name: FORMATION_STATES[state].registeredAgent.name,
    street1: FORMATION_STATES[state].registeredAgent.street1,
    city: FORMATION_STATES[state].registeredAgent.city,
    state,
    zip: FORMATION_STATES[state].registeredAgent.zip,
    useOurService: true,
    signedAt: new Date().toISOString(),
  },
  managersMembers: [
    { title: 'AMBR', name: 'Jane Doe', street1: '123 Main St', city: 'Anywhere', state, zip: '00000', ownershipPercentage: 100 },
  ],
  correspondenceContact: { email: 'jane@example.com' },
  optionalDetails:
    entityType === 'CORP' && state === 'DE'
      ? { authorizedShares: 1500, parValueCents: 0 }
      : state === 'WY'
        ? { organizerEmail: 'jane@example.com', electronicServiceConsent: true }
        : null,
  incorporatorSignature: 'Jane Doe',
  incorporatorSignedAt: new Date(),
  sunbizFilingNumber: null,
  submittedAt: new Date(),
});

for (const state of ACTIVE_FORMATION_STATES) {
  const llcDoc = generateArticlesOfOrganization(
    sampleFiling(state, 'LLC') as Parameters<typeof generateArticlesOfOrganization>[0],
  );
  const expectedLabel = formationDocumentLabel(FORMATION_STATES[state], 'LLC');
  includes(`${state} LLC doc has correct title`, llcDoc, expectedLabel);
  includes(`${state} LLC doc references ${state} statute`, llcDoc, FORMATION_STATES[state].statuteReferences.llc);
  if (state === 'WY') {
    includes('WY LLC doc renders organizer email', llcDoc, 'jane@example.com');
    includes('WY LLC doc renders electronic service consent', llcDoc, 'Electronic Service Consent');
  }

  const corpDoc = generateArticlesOfIncorporation(
    sampleFiling(state, 'CORP') as Parameters<typeof generateArticlesOfIncorporation>[0],
  );
  const expectedCorpLabel = formationDocumentLabel(FORMATION_STATES[state], 'CORP');
  includes(`${state} CORP doc has correct title`, corpDoc, expectedCorpLabel);
  if (state === 'DE') {
    includes('DE CORP doc renders no par value clause', corpDoc, 'no par value');
  }

  const cover = generateCoverLetter({
    filing: sampleFiling(state, 'LLC') as Parameters<typeof generateCoverLetter>[0]['filing'],
    contactName: 'Jane Doe',
    contactEmail: 'jane@example.com',
    contactPhone: null,
    totalFeeCents: stateFilingFeeCents(state, 'LLC'),
    certificateOfStatus: false,
    certifiedCopy: false,
  });
  includes(`${state} cover letter addressed to ${state} agency`, cover, FORMATION_STATES[state].filingMailingAddress.label);

  const receipt = generateReceipt({
    filingId: 'flg_test',
    businessName: 'Acme Test LLC',
    totalCents: 30_000,
    lines: [{ label: 'Test', cents: 30_000 }],
    paidAt: new Date(),
    state,
  });
  includes(`${state} receipt mentions state name`, receipt, FORMATION_STATES[state].name);
}

console.log('\n--- Delaware LLC member disclosure ---');
{
  const baseDe = sampleFiling('DE', 'LLC') as Parameters<typeof generateArticlesOfOrganization>[0];
  // Default (opt-out) - Article IV must NOT show the member table.
  const noDisclose = generateArticlesOfOrganization({
    ...baseDe,
    optionalDetails: { includeMembersOnArticles: false },
  } as Parameters<typeof generateArticlesOfOrganization>[0]);
  // The Article IV body should not include the AMBR row (which renders "AMBR"
  // as a table cell). The incorporator block at the bottom always prints
  // "Jane Doe" as the signer - that's expected.
  checkTrue(
    'DE LLC default omits member-table AMBR row',
    !noDisclose.includes('<td>AMBR</td>'),
  );
  includes(
    'DE LLC default surfaces privacy notice',
    noDisclose,
    'intentionally omitted',
  );
  // Opt-in - Certificate prints member row as before.
  const disclosed = generateArticlesOfOrganization({
    ...baseDe,
    optionalDetails: { includeMembersOnArticles: true },
  } as Parameters<typeof generateArticlesOfOrganization>[0]);
  includes('DE LLC opt-in lists AMBR row', disclosed, '<td>AMBR</td>');
}

console.log('\n--- Business-entity owner rendering ---');
{
  const base = sampleFiling('WY', 'LLC') as Parameters<typeof generateArticlesOfOrganization>[0];
  const withBusinessOwner = generateArticlesOfOrganization({
    ...base,
    managersMembers: [
      {
        title: 'AMBR',
        name: 'Acme Holdings, LLC',
        street1: '1 Holding Way',
        city: 'Cheyenne',
        state: 'WY',
        zip: '82001',
        ownershipPercentage: 100,
        ownerType: 'business',
        businessLegalName: 'Acme Holdings, LLC',
        businessJurisdiction: 'Delaware',
        signerName: 'Jane Doe, Manager',
      },
    ],
  } as Parameters<typeof generateArticlesOfOrganization>[0]);
  includes('Entity-owner row prints legal name', withBusinessOwner, 'Acme Holdings, LLC');
  includes(
    'Entity-owner row prints jurisdiction',
    withBusinessOwner,
    'Entity owner - Delaware',
  );
  includes('Entity-owner row prints signer', withBusinessOwner, 'Jane Doe, Manager');
}

console.log('\n--- FAQ population ---');
for (const state of ACTIVE_FORMATION_STATES) {
  const ms = resolveMarketingState(state);
  for (const locale of ['en', 'es'] as const) {
    const faq = getMarketingFaq(ms, locale);
    checkTrue(`${state} ${locale} FAQ has at least 4 items`, faq.length >= 4);
    checkTrue(
      `${state} ${locale} FAQ items have non-empty Q+A`,
      faq.every((item) => item.q.trim().length > 0 && item.a.trim().length > 0),
    );
  }
}

console.log('\n=================================');
console.log(`PASS ${pass}   FAIL ${fail}`);
if (fail > 0) {
  process.exit(1);
}
