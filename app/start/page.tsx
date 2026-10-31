import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/navigation';
import { withLocaleMeta } from '@/lib/locale-seo';
import { DoNotSellLink } from '@/components/legal/DoNotSellLink';
import { Logo } from '@/components/marketing/Logo';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import { COPYRIGHT_YEAR } from '@/lib/constants';
import { adsActorForUser } from '@/lib/ads-actor';
import { GuestStartLaunch } from './guest-start-launch';
import { ACTIVE_MARKETING_STATES, localizedStateName } from '@/lib/marketing-states';
import {
  floridaOnlyNote,
  resolveRequestedFormationState,
} from '@/lib/formation-states';
import { pageTitle } from '@/lib/seo-title';
import { normalizeNameCheckQuery } from '@/lib/name-check';
import { shouldPreselectFloridaLlc } from '@/lib/florida-llc-preselect';
import { getServerUtmAttribution } from '@/lib/utm-server';

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

function resolveTier(raw: string | undefined): 'BASIC' | 'STANDARD' | 'PREMIUM' | undefined {
  const upper = (raw ?? '').trim().toUpperCase();
  if (!VALID_TIERS.has(upper)) return undefined;
  return upper as 'BASIC' | 'STANDARD' | 'PREMIUM';
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
  searchParams?: {
    state?: string;
    entity?: string;
    tier?: string;
    name?: string;
    utm_source?: string;
  };
}

export default async function StartPage({ searchParams }: StartPageProps) {
  const t = await getTranslations('start');
  const tDisc = await getTranslations('disclosure');
  const locale = await getLocale();
  const preselectFloridaLlc = shouldPreselectFloridaLlc({
    referer: headers().get('referer'),
    utmSource: searchParams?.utm_source || getServerUtmAttribution()?.utm_source,
  });
  const resolved = resolveRequestedFormationState(searchParams?.state);
  const stateCode = preselectFloridaLlc ? 'FL' : resolved.stateCode;
  const stateNote =
    !preselectFloridaLlc && resolved.fellBackFromInactive ? floridaOnlyNote(locale) : null;
  const { choice: entityChoice } = resolveEntityParam(
    preselectFloridaLlc ? 'LLC' : searchParams?.entity,
  );
  const marketingState = ACTIVE_MARKETING_STATES.find((state) => state.code === stateCode);
  const stateName = marketingState ? localizedStateName(marketingState, locale) : stateCode;
  const session = await auth();
  const actor = await adsActorForUser(session?.user?.id, session?.user?.email);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="container py-2 sm:py-6 flex items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="text-sm text-ink-muted hover:text-primary">
          {t('signInLink')}
        </Link>
      </header>

      <main className="flex-1 container max-w-lg py-2 sm:py-10">
        {stateNote ? (
          <p role="status" className="mb-2 text-sm text-ink-muted text-center">
            {stateNote}
          </p>
        ) : null}
        <GuestStartLaunch
          defaultState={stateCode}
          defaultEntity={entityChoice}
          defaultTier={resolveTier(searchParams?.tier)}
          defaultBusinessName={normalizeNameCheckQuery(searchParams?.name) || undefined}
          stateName={stateName}
          showOptionalEmail={!session?.user?.id}
          accountEmail={actor.email}
          isTester={actor.isTester}
          preselectFloridaLlc={preselectFloridaLlc}
        />

        <div className="mt-4">
          <GovDisclosure variant="prominent" text={tDisc('notAffiliated')} />
        </div>

        <p className="text-xs text-ink-subtle text-center mt-4 max-w-md mx-auto leading-relaxed">
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

      <footer className="container py-6 text-center space-y-2">
        <p className="text-xs text-ink-subtle">
          <DoNotSellLink className="underline hover:text-ink-muted" />
        </p>
        <p className="text-xs text-ink-subtle">© {COPYRIGHT_YEAR} LaunchForma</p>
      </footer>
    </div>
  );
}
