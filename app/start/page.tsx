import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/navigation';
import { withLocaleMeta } from '@/lib/locale-seo';
import { DoNotSellLink } from '@/components/legal/DoNotSellLink';
import { Logo } from '@/components/marketing/Logo';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import { COPYRIGHT_YEAR } from '@/lib/constants';
import { GuestStartLaunch } from './guest-start-launch';
import { ACTIVE_MARKETING_STATES, localizedStateName } from '@/lib/marketing-states';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
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
  const session = await auth();

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="container py-3 sm:py-6 flex items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="text-sm text-ink-muted hover:text-primary">
          {t('signInLink')}
        </Link>
      </header>

      <div className="container max-w-lg">
        <GovDisclosure variant="prominent" text={tDisc('notAffiliated')} />
      </div>

      <main className="flex-1 container max-w-lg py-4 sm:py-10">
        <GuestStartLaunch
          defaultState={stateCode}
          defaultEntity={entityChoice}
          defaultTier={resolveTier(searchParams?.tier)}
          defaultBusinessName={normalizeNameCheckQuery(searchParams?.name) || undefined}
          stateName={stateName}
          showOptionalEmail={!session?.user?.id}
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

      <footer className="container py-6 text-center space-y-2">
        <p className="text-xs text-ink-subtle">
          <DoNotSellLink className="underline hover:text-ink-muted" />
        </p>
        <p className="text-xs text-ink-subtle">© {COPYRIGHT_YEAR} LaunchForma</p>
      </footer>
    </div>
  );
}
