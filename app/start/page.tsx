import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { withLocaleMeta } from '@/lib/locale-seo';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Logo } from '@/components/marketing/Logo';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import { COPYRIGHT_YEAR } from '@/lib/constants';
import { GuestStartLaunch } from './guest-start-launch';
import { ACTIVE_MARKETING_STATES, localizedStateName } from '@/lib/marketing-states';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { filingUtmCreateFields } from '@/lib/utm-attribution';
import { syncSCorpElectionAddOn } from '@/actions/wizard';
import type { TierSlug } from '@/lib/pricing';
import { pageTitle } from '@/lib/seo-title';
import { normalizeNameCheckQuery } from '@/lib/name-check';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('startMeta');
    const title = t('title');
    const description = t('description');
    return withLocaleMeta(
      '/start',
      {
        title,
        description,
        openGraph: { title, description, type: 'website' },
      },
      locale,
    );
  }
  return withLocaleMeta(
    '/start',
    {
      title: pageTitle('LaunchForma | Form a Florida LLC & Incorporate Your Business'),
    },
    locale,
  );
}

const VALID_TIERS = new Set(['BASIC', 'STANDARD', 'PREMIUM']);

function resolveTier(raw: string | undefined): 'BASIC' | 'STANDARD' | 'PREMIUM' {
  const upper = (raw ?? '').toUpperCase();
  return (VALID_TIERS.has(upper) ? upper : 'STANDARD') as
    | 'BASIC'
    | 'STANDARD'
    | 'PREMIUM';
}

function resolveEntityParam(raw: string | undefined): {
  choice: 'LLC' | 'CORP' | 'SCORP';
  entityType: 'LLC' | 'CORP';
  taxElection: 'S_CORP' | null;
} {
  const upper = (raw ?? 'LLC').toUpperCase();
  if (upper === 'SCORP' || upper === 'S-CORP' || upper === 'S_CORP') {
    return { choice: 'SCORP', entityType: 'CORP', taxElection: 'S_CORP' };
  }
  if (upper === 'CORP' || upper === 'CORPORATION') {
    return { choice: 'CORP', entityType: 'CORP', taxElection: null };
  }
  return { choice: 'LLC', entityType: 'LLC', taxElection: null };
}

interface StartPageProps {
  searchParams?: { state?: string; entity?: string; tier?: string; name?: string };
}

export default async function StartPage({ searchParams }: StartPageProps) {
  const session = await auth();
  // If already signed in, skip the guest form: spin up a draft directly in
  // the chosen state and jump them straight into the wizard.
  if (session?.user?.id) {
    const requested = (searchParams?.state ?? 'FL').toUpperCase();
    const stateCode = (ACTIVE_FORMATION_STATES.includes(requested as StateCode)
      ? requested
      : 'FL') as StateCode;
    const { entityType, taxElection } = resolveEntityParam(searchParams?.entity);
    const seededName = normalizeNameCheckQuery(searchParams?.name) || null;
    const serviceTier = resolveTier(searchParams?.tier);
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType,
        taxElection,
        state: stateCode,
        serviceTier,
        // Step 1 (entity + state) is already done. A name from ?name= is
        // saved so step 2 can check it on arrival instead of skipping ahead.
        businessName: seededName,
        currentStep: 2,
        completedSteps: JSON.stringify([1]),
        ...filingUtmCreateFields(),
      },
    });
    await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);
    redirect(`/wizard/${filing.id}/2`);
  }

  const t = await getTranslations('start');
  const tDisc = await getTranslations('disclosure');
  const locale = await getLocale();
  const requested = (searchParams?.state ?? 'FL').toUpperCase();
  const stateCode: StateCode = ACTIVE_FORMATION_STATES.includes(requested as StateCode)
    ? (requested as StateCode)
    : 'FL';
  const { choice: entityChoice } = resolveEntityParam(searchParams?.entity);
  const marketingState = ACTIVE_MARKETING_STATES.find((state) => state.code === stateCode);
  const stateName = marketingState ? localizedStateName(marketingState, locale) : stateCode;
  const entityLabel =
    entityChoice === 'SCORP' ? t('entitySCorp') : entityChoice === 'CORP' ? t('entityCorp') : t('entityLLC');

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="container py-6 flex items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="text-sm text-ink-muted hover:text-primary">
          {t('signInLink')}
        </Link>
      </header>

      <div className="container max-w-3xl">
        <GovDisclosure variant="prominent" text={tDisc('notAffiliated')} />
      </div>

      <main className="flex-1 container max-w-3xl py-10">
        <GuestStartLaunch
          defaultState={stateCode}
          defaultEntity={entityChoice}
          defaultTier={resolveTier(searchParams?.tier)}
          defaultBusinessName={normalizeNameCheckQuery(searchParams?.name) || undefined}
          stateName={stateName}
          entityLabel={entityLabel}
        />

        <p className="text-xs text-ink-subtle text-center mt-6 max-w-md mx-auto leading-relaxed">
          {t('termsPrefix')}{' '}
          <Link href="/terms" className="underline hover:text-ink-muted">
            {t('terms')}
          </Link>{' '}
          {t('and')}{' '}
          <Link href="/privacy" className="underline hover:text-ink-muted">
            {t('privacy')}
          </Link>
          .
        </p>
      </main>

      <footer className="container py-6 text-center">
        <p className="text-xs text-ink-subtle">© {COPYRIGHT_YEAR} LaunchForma</p>
      </footer>
    </div>
  );
}
