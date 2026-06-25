import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWizardFiling } from '@/actions/wizard';
import { TOTAL_STEPS } from '@/lib/wizard-constants';
import { WizardShell } from '@/components/wizard/WizardShell';
import { Step1Entity } from '@/components/wizard/steps/Step1Entity';
import { Step2Name } from '@/components/wizard/steps/Step2Name';
import { Step3Tier } from '@/components/wizard/steps/Step3Tier';
import { Step4Address } from '@/components/wizard/steps/Step4Address';
import { Step5Mailing } from '@/components/wizard/steps/Step5Mailing';
import { Step6RegisteredAgent } from '@/components/wizard/steps/Step6RegisteredAgent';
import { Step7Members } from '@/components/wizard/steps/Step7Members';
import { Step9Optional } from '@/components/wizard/steps/Step9Optional';
import { Step10Review } from '@/components/wizard/steps/Step10Review';
import { Step11AddOns } from '@/components/wizard/steps/Step11AddOns';
import { Step12Payment } from '@/components/wizard/steps/Step12Payment';
import type { AddOnSlug, TierSlug } from '@/lib/pricing';
import { isActiveFormationState, type StateCode } from '@/lib/formation-states';
import { safeParseJson } from '@/lib/utils';
import { getWizardActor } from '@/lib/guest';
import { GuestAccountPrompt } from '@/components/wizard/GuestAccountPrompt';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { filingId: string; step: string };
}

export default async function WizardStepPage({ params }: PageProps) {
  const stepNum = parseInt(params.step, 10);
  if (isNaN(stepNum) || stepNum < 1) redirect(`/wizard/${params.filingId}/1`);

  if (stepNum > TOTAL_STEPS) {
    redirect(`/wizard/${params.filingId}/${TOTAL_STEPS}`);
  }

  const filing = await getWizardFiling(params.filingId);
  if (filing.status !== 'DRAFT') {
    // Submitted filings always go to the dashboard. Guests get sent through
    // sign-in first since the dashboard is account-only.
    redirect(`/dashboard/filings/${filing.id}`);
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

  // Identify the current actor (auth user OR guest). Used to gate the EIN
  // tester bypass and to prefill the payment-step email/name fields.
  const session = await auth();
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  const isGuest = actor?.kind === 'guest';

  // Compute the actor's display name once for use across multiple steps
  // (Step 7 first-member prefill, Step 11 EIN responsible-party prefill).
  let actorDisplayName: string | undefined;
  let isTester = false;
  if (actor?.kind === 'user') {
    const u = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { isTester: true, firstName: true, lastName: true },
    });
    isTester = u?.isTester ?? false;
    if (u?.firstName || u?.lastName) {
      actorDisplayName = [u?.firstName, u?.lastName].filter(Boolean).join(' ');
    }
  } else if (actor?.kind === 'guest') {
    actorDisplayName = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  }
  const actorEmail = actor?.email ?? undefined;

  let einInitial: import('@/components/wizard/EinResponsiblePartyPanel').EinPanelInitialState = {
    collected: false,
  };
  let defaultEmail: string | undefined;
  let defaultName: string | undefined;

  // The EIN responsible-party panel now lives on the add-ons step (10) — the
  // last screen before payment — so the SSN/ITIN is collected before checkout.
  // The payment step (11) keeps it only as a fallback when it wasn't completed.
  if (stepNum === 10 || stepNum === 11) {
    defaultEmail = actorEmail;
    defaultName = actorDisplayName ?? filing.managersMembers[0]?.name ?? undefined;

    const ein = await prisma.einApplication.findUnique({
      where: { filingId: filing.id },
    });
    if (ein) {
      einInitial = {
        collected:
          ein.status === 'ready_online' ||
          ein.status === 'manual_foreign' ||
          ein.status === 'submitted' ||
          ein.status === 'delivered',
        pathway: ein.responsiblePartyType as 'us' | 'foreign',
        legalName: ein.legalName ?? undefined,
        title: ein.title ?? undefined,
        phone: ein.phone ?? undefined,
        email: ein.email ?? undefined,
        taxIdLast4: ein.taxIdLast4,
        taxIdType: ein.taxIdType,
        passportLast4: ein.passportLast4,
        countryOfCitizenship: ein.countryOfCitizenship,
      };
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
        {stepNum === 1 && <Step1Entity filing={filing} />}
        {stepNum === 2 && <Step2Name filing={filing} />}
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
        {stepNum === 10 && (
          <Step11AddOns
            filing={filing}
            einInitial={einInitial}
            defaultEmail={defaultEmail}
            defaultName={defaultName}
          />
        )}
        {stepNum === 11 && (
          <Step12Payment
            filing={filing}
            einInitial={einInitial}
            defaultEmail={defaultEmail}
            defaultName={defaultName}
            isTester={isTester}
          />
        )}
      </WizardShell>

      {/* Guest-only popup: appears after Step 1 (entity choice) so we have
          collected enough info to position the offer. The popup is dismissable
          and persists its dismissal in localStorage. */}
      {isGuest && actor && stepNum >= 1 && (
        <GuestAccountPrompt
          firstName={actor.firstName}
          email={actor.email}
        />
      )}
    </>
  );
}
