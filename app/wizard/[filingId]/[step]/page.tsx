import nextDynamic from 'next/dynamic';
import { redirectLocalized } from '@/lib/locale-redirect';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWizardFiling } from '@/actions/wizard';
import { TOTAL_STEPS } from '@/lib/wizard-constants';
import { WizardShell } from '@/components/wizard/WizardShell';
import { Step1Entity } from '@/components/wizard/steps/Step1Entity';
import { Step2Name } from '@/components/wizard/steps/Step2Name';
// Heavier downstream steps are code-split so each step only ships its own JS
// (the wizard route previously bundled all 12 steps + Stripe into one chunk).
// ssr is kept on so there's no loading flash for the active step.
const Step3Tier = nextDynamic(() =>
  import('@/components/wizard/steps/Step3Tier').then((m) => m.Step3Tier),
);
const Step4Address = nextDynamic(() =>
  import('@/components/wizard/steps/Step4Address').then((m) => m.Step4Address),
);
const Step5Mailing = nextDynamic(() =>
  import('@/components/wizard/steps/Step5Mailing').then((m) => m.Step5Mailing),
);
const Step6RegisteredAgent = nextDynamic(() =>
  import('@/components/wizard/steps/Step6RegisteredAgent').then((m) => m.Step6RegisteredAgent),
);
const Step7Members = nextDynamic(() =>
  import('@/components/wizard/steps/Step7Members').then((m) => m.Step7Members),
);
const Step9Optional = nextDynamic(() =>
  import('@/components/wizard/steps/Step9Optional').then((m) => m.Step9Optional),
);
const Step10Review = nextDynamic(() =>
  import('@/components/wizard/steps/Step10Review').then((m) => m.Step10Review),
);
const Step11AddOns = nextDynamic(() =>
  import('@/components/wizard/steps/Step11AddOns').then((m) => m.Step11AddOns),
);
const Step12Payment = nextDynamic(() =>
  import('@/components/wizard/steps/Step12Payment').then((m) => m.Step12Payment),
);
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import { guestWizardStep } from '@/lib/start-draft';
import { isActiveFormationState, type StateCode } from '@/lib/formation-states';
import { safeParseJson } from '@/lib/utils';
import { getWizardActor } from '@/lib/guest';
import { GuestAccountPrompt } from '@/components/wizard/GuestAccountPrompt';
import { isCheckoutTestMode } from '@/lib/checkout-test-mode';
import { isPlaceholderGuestEmail, showPendingAccountBanner } from '@/lib/guest-identity';
import { submittedFilingHref } from '@/lib/guest-checkout';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { filingId: string; step: string };
}

export default async function WizardStepPage({ params }: PageProps) {
  const stepNum = parseInt(params.step, 10);
  const filingLocale = (
    await prisma.filing.findUnique({
      where: { id: params.filingId },
      select: { locale: true },
    })
  )?.locale;
  if (isNaN(stepNum) || stepNum < 1) {
    return await redirectLocalized(`/wizard/${params.filingId}/1`, filingLocale);
  }

  if (stepNum > TOTAL_STEPS) {
    return await redirectLocalized(`/wizard/${params.filingId}/${TOTAL_STEPS}`, filingLocale);
  }

  const filing = await getWizardFiling(params.filingId);
  if (filing.status !== 'DRAFT') {
    // Paying leaves the draft, and this page re-renders as part of checkout.
    // That redirect used to replace /checkout/success?setPassword=1 with the
    // filing dashboard, so the guest never saw the set-password prompt.
    // Guests with that prompt stay on the success page. Everyone else still
    // goes to the filing dashboard.
    const submittedDetails = safeParseJson<Record<string, unknown> | null>(
      filing.optionalDetails,
      null,
    );
    return await redirectLocalized(
      submittedFilingHref(filing.id, submittedDetails),
      filing.locale,
    );
  }

  // Step-order guard: don't let anyone land on Payment (11) with a draft that's
  // missing core data - they'd otherwise only discover it when the charge is
  // rejected. Send them to the earliest incomplete step instead.
  if (stepNum === 11) {
    const ra = safeParseJson<{ useOurService?: boolean; name?: string; street1?: string } | null>(
      filing.registeredAgent,
      null,
    );
    const principal = safeParseJson<{ street1?: string; city?: string } | null>(
      filing.principalAddress,
      null,
    );
    const peopleCount = filing.managersMembers?.length ?? 0;
    let gotoStep: number | null = null;
    if (!filing.businessName?.trim()) gotoStep = 2;
    else if (!principal?.street1?.trim() || !principal?.city?.trim()) gotoStep = 4;
    else if (!(ra?.useOurService === true || (ra?.name?.trim() && ra?.street1?.trim()))) gotoStep = 6;
    else if (peopleCount < 1) gotoStep = 7;
    else if (!filing.incorporatorSignature?.trim()) gotoStep = 9;
    if (gotoStep) {
      return await redirectLocalized(`/wizard/${filing.id}/${gotoStep}?incomplete=1`, filing.locale);
    }
  }

  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug
  );

  const optional = safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null);
  const processingOptionId =
    optional && typeof optional.processingOption === 'string'
      ? (optional.processingOption as string)
      : null;

  const cost = {
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
    state: (isActiveFormationState(filing.state) ? filing.state : 'FL') as StateCode,
    processingOptionId,
  };

  // Identify the current actor (auth user OR guest). Used for the tester
  // payment bypass and to prefill member name/email fields.
  const session = await auth();
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  const isGuest = actor?.kind === 'guest';

  // Compute the actor's display name once (Step 7 first-member prefill).
  let actorDisplayName: string | undefined;
  let isTester = false;
  let signedInEmail: string | null = actor?.kind === 'user' ? (actor.email ?? null) : null;
  if (actor?.kind === 'user') {
    const u = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { isTester: true, firstName: true, lastName: true, email: true },
    });
    isTester = u?.isTester ?? false;
    signedInEmail = u?.email ?? signedInEmail;
    if (u?.firstName || u?.lastName) {
      actorDisplayName = [u?.firstName, u?.lastName].filter(Boolean).join(' ');
    }
  } else if (actor?.kind === 'guest') {
    actorDisplayName = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  }
  const actorEmail =
    actor?.kind === 'guest' ? (actor.email ?? undefined) : (signedInEmail ?? undefined);
  const realGuestEmail =
    actor?.kind === 'guest' && !isPlaceholderGuestEmail(actor.email) ? actor.email : '';
  const needsGuestEmail = actor?.kind === 'guest' && !realGuestEmail;
  const storedPendingAccountEmail =
    optional && typeof optional.pendingAccountEmail === 'string'
      ? optional.pendingAccountEmail
      : '';
  const pendingAccountEmail = showPendingAccountBanner({
    pendingAccountEmail: storedPendingAccountEmail,
    actorKind: actor?.kind ?? null,
    actorEmail,
  })
    ? storedPendingAccountEmail
    : '';
  const typedGuestEmail =
    optional && typeof optional.typedGuestEmail === 'string' ? optional.typedGuestEmail : '';
  const guestEmailPrefill = storedPendingAccountEmail || typedGuestEmail;
  const testMode = isCheckoutTestMode({
    vercelEnv: process.env.VERCEL_ENV,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
  const serverTotalCents = computeCost({
    entityType: cost.entityType,
    tier: cost.tier,
    addOnSlugs: cost.addOnSlugs,
    state: cost.state,
    processingOptionId: cost.processingOptionId,
  }).totalCents;

  if (isGuest && stepNum === 1) {
    const landing = guestWizardStep({
      businessName: filing.businessName,
      currentStep: 1,
    });
    if (landing !== 1) {
      if ((filing.currentStep ?? 1) < 2) {
        await prisma.filing.update({
          where: { id: filing.id },
          data: { currentStep: landing },
        });
      }
      return await redirectLocalized(`/wizard/${filing.id}/${landing}`, filing.locale);
    }
  }

  return (
    <>
      <WizardShell
        filingId={filing.id}
        step={stepNum}
        costData={cost}
        isGuest={isGuest}
        guestEmail={actor?.kind === 'guest' ? actor.email : undefined}
      >
        {stepNum === 1 && (
          <Step1Entity
            filing={filing}
            needsGuestEmail={needsGuestEmail}
            initialGuestEmail={guestEmailPrefill}
            pendingAccountEmail={pendingAccountEmail}
          />
        )}
        {stepNum === 2 && (
          <Step2Name
            filing={filing}
            needsGuestEmail={needsGuestEmail}
            initialGuestEmail={guestEmailPrefill}
            pendingAccountEmail={pendingAccountEmail}
          />
        )}
        {stepNum === 3 && <Step3Tier filing={filing} />}
        {stepNum === 4 && <Step4Address filing={filing} />}
        {stepNum === 5 && <Step5Mailing filing={filing} />}
        {stepNum === 6 && <Step6RegisteredAgent filing={filing} />}
        {stepNum === 7 && (
          <Step7Members
            filing={filing}
            defaultMemberName={actorDisplayName}
            defaultEmail={actorEmail}
          />
        )}
        {stepNum === 8 && <Step9Optional filing={filing} />}
        {stepNum === 9 && <Step10Review filing={filing} />}
        {stepNum === 10 && <Step11AddOns filing={filing} />}
        {stepNum === 11 && (
          <Step12Payment
            filing={filing}
            isTester={isTester}
            testMode={testMode}
            isGuest={isGuest}
            guestEmail={realGuestEmail ?? ''}
            pendingAccountEmail={pendingAccountEmail || undefined}
            serverTotalCents={serverTotalCents}
          />
        )}
      </WizardShell>

      {/* Guest-only popup: appears after Step 1 (entity choice) so we have
          collected enough info to position the offer. The popup is dismissable
          and persists its dismissal in localStorage. */}
      {isGuest && actor?.kind === 'guest' && realGuestEmail && stepNum >= 2 && (
        <GuestAccountPrompt
          firstName={actor.firstName}
          email={realGuestEmail}
          filingId={filing.id}
          returnStep={stepNum}
        />
      )}
    </>
  );
}
