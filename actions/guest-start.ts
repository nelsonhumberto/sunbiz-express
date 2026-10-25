'use server';

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hrefForLocale } from '@/lib/app-href';
import { englishPathname } from '@/lib/locale-paths';
import { redirectLocalized } from '@/lib/locale-redirect';
import { localeFromPathOrFiling } from '@/lib/request-locale';
import { TOTAL_STEPS } from '@/lib/wizard-constants';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { auth, signIn } from '@/lib/auth';
import { newGuestToken, setGuestCookie, clearGuestCookie, getGuestUser } from '@/lib/guest';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { isRedirectError, withActionTimeout } from '@/lib/action-timeout';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { PREFERRED_STATE_COOKIE } from '@/lib/constants';
import {
  ensureUserFirstTouchUtm,
  filingUtmCreateFields,
  userUtmCreateFields,
} from '@/lib/utm-attribution';
import { getTranslations } from 'next-intl/server';
import { storedEntryPath, storedLocale } from '@/lib/stored-locale';
import { syncSCorpElectionAddOn } from '@/actions/wizard';
import type { TierSlug } from '@/lib/pricing';
import { nameHasMinimumSubstance, normalizeNameCheckQuery } from '@/lib/name-check';
import { decideDraftNameResume } from '@/lib/start-draft';
import {
  isPlaceholderGuestEmail,
  placeholderGuestEmail,
  planStartGuestSession,
} from '@/lib/guest-identity';
import { checkActionRateLimit } from '@/lib/rate-limit';

const StartSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  state: z.enum(['FL', 'WY', 'DE']).optional(),
  // SCORP is a customer-facing label for Corporation + S-Corp tax election.
  entityType: z.enum(['LLC', 'CORP', 'SCORP']).optional(),
  // Preselected package from a pricing CTA. Defaults to STANDARD when absent
  // or invalid so the wizard's tier step still works.
  tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']).optional(),
  // Business name seeded by the assistant (?name=) so the draft starts further along.
  businessName: z.string().max(100).optional(),
  draftIntent: z.enum(['resume', 'new']).optional(),
  draftId: z.string().optional(),
});

async function alignFilingLocale(
  filingId: string,
  userId: string | null | undefined,
  pathLocale: 'en' | 'es' | null,
  current: string | null | undefined,
): Promise<'en' | 'es'> {
  const chosen = localeFromPathOrFiling(pathLocale, current);
  if (pathLocale && current !== pathLocale) {
    await prisma.filing.update({ where: { id: filingId }, data: { locale: pathLocale } });
    if (userId) {
      await prisma.user.update({ where: { id: userId }, data: { locale: pathLocale } });
    }
  }
  return chosen;
}

function resolveEntityChoice(choice: 'LLC' | 'CORP' | 'SCORP' | undefined): {
  entityType: 'LLC' | 'CORP';
  taxElection: 'S_CORP' | null;
} {
  if (choice === 'SCORP') return { entityType: 'CORP', taxElection: 'S_CORP' };
  if (choice === 'CORP') return { entityType: 'CORP', taxElection: null };
  return { entityType: 'LLC', taxElection: null };
}

export interface DraftNameChoice {
  draftId: string;
  existingName: string;
  proposedName: string;
  resumeHref: string;
}

export interface StartGuestResult {
  ok?: boolean;
  error?: string;
  /** Existing draft uses a different name. The form asks which one to keep. */
  choice?: DraftNameChoice;
}

/**
 * Begin a guest filing. Creates (or reuses) a shadow GUEST user, attaches a
 * fresh draft Filing in the chosen state, sets the guest cookie, and
 * redirects into the wizard.
 *
 * If an email already belongs to a normal ACTIVE user, we redirect to
 * /sign-in instead of silently merging - that prevents account-takeover.
 */
export async function startGuestFiling(
  _prev: StartGuestResult,
  formData: FormData,
): Promise<StartGuestResult> {
  const parsed = StartSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    state: formData.get('state') ?? undefined,
    entityType: formData.get('entityType') ?? undefined,
    tier: (formData.get('tier') as string)?.toUpperCase() || undefined,
    businessName: (formData.get('businessName') as string)?.trim() || undefined,
    draftIntent: formData.get('draftIntent') || undefined,
    draftId: (formData.get('draftId') as string) || undefined,
  });
  const t = await getTranslations('start');
  if (!parsed.success) {
    return { error: t('errorInvalid') };
  }

  const { firstName, lastName } = parsed.data;
  const { entityType, taxElection } = resolveEntityChoice(parsed.data.entityType);
  const serviceTier = parsed.data.tier ?? 'STANDARD';
  const seededName = normalizeNameCheckQuery(parsed.data.businessName) || null;
  const email = parsed.data.email.toLowerCase().trim();
  const locale = await storedLocale();
  const localeData = locale ? { locale } : {};
  const entryPath = storedEntryPath();
  const entryData = entryPath ? { entryPath } : {};
  const stateCode: StateCode = (parsed.data.state ?? 'FL') as StateCode;
  if (!ACTIVE_FORMATION_STATES.includes(stateCode)) {
    return { error: t('errorStateUnavailable') };
  }

  // Authed users skip guest entirely - go straight to filing creation.
  const session = await auth();
  if (session?.user?.id) {
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType,
        taxElection,
        state: stateCode,
        serviceTier,
        businessName: seededName,
        currentStep: 2,
        completedSteps: JSON.stringify([1]),
        ...localeData,
        ...entryData,
        ...filingUtmCreateFields(),
      },
    });
    await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);
    return await redirectLocalized(`/wizard/${filing.id}/2`, locale);
  }

  // An email that already belongs to anyone does not hand over that session.
  // Accounts go to sign-in. Another guest gets a separate guest for this browser.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, accountStatus: true },
  });
  const ownerKind = !existing ? 'free' : existing.accountStatus === 'GUEST' ? 'guest' : 'account';
  const sessionPlan = planStartGuestSession(ownerKind);
  if (sessionPlan === 'sign_in') {
    const siteLocale = locale === 'es' ? 'es' : 'en';
    const next = encodeURIComponent(hrefForLocale('/dashboard', siteLocale));
    return await redirectLocalized(
      `/sign-in?email=${encodeURIComponent(email)}&from=start&next=${next}`,
      locale,
    );
  }

  const token = newGuestToken();
  const placeholderPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  const guestUser = await prisma.user.create({
    data: {
      email: sessionPlan === 'separate' ? placeholderGuestEmail(token) : email,
      firstName,
      lastName,
      passwordHash: placeholderPassword,
      accountStatus: 'GUEST',
      guestToken: token,
      ...localeData,
      ...userUtmCreateFields(),
    },
  });

  setGuestCookie(token);

  cookies().set(PREFERRED_STATE_COOKIE, stateCode, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  const filing = await prisma.filing.create({
    data: {
      userId: guestUser.id,
      entityType,
      taxElection,
      state: stateCode,
      serviceTier,
      businessName: seededName,
      currentStep: 2,
      completedSteps: JSON.stringify([1]),
      ...localeData,
      ...entryData,
      ...filingUtmCreateFields(),
      ...(sessionPlan === 'separate'
        ? { optionalDetails: JSON.stringify({ typedGuestEmail: email }) }
        : {}),
    },
  });
  await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);

  return await redirectLocalized(`/wizard/${filing.id}/2`, locale);
}

/**
 * Open the wizard for a logged-out visitor without asking for a name or email.
 * A guest row and draft are created on the first call. The email is collected
 * on the entity step or the name check, then written to User.email.
 * A later visit with the guest cookie resumes the same draft.
 */
export async function openGuestDraft(input: {
  state?: string;
  entityType?: string;
  tier?: string;
  businessName?: string;
  draftIntent?: 'resume' | 'new';
  draftId?: string;
  /** `window.location.pathname`. The address bar wins over the rewrite. */
  browserPath?: string;
}): Promise<StartGuestResult> {
  const t = await getTranslations('start');
  const requestedState = (input.state ?? 'FL').toUpperCase();
  const stateCode = (
    ACTIVE_FORMATION_STATES.includes(requestedState as StateCode) ? requestedState : 'FL'
  ) as StateCode;
  const entityChoice = (['LLC', 'CORP', 'SCORP'].includes((input.entityType ?? '').toUpperCase())
    ? (input.entityType ?? 'LLC').toUpperCase()
    : 'LLC') as 'LLC' | 'CORP' | 'SCORP';
  const { entityType, taxElection } = resolveEntityChoice(entityChoice);
  const tierRaw = (input.tier ?? 'STANDARD').toUpperCase();
  const serviceTier = (['BASIC', 'STANDARD', 'PREMIUM'].includes(tierRaw) ? tierRaw : 'STANDARD') as
    | 'BASIC'
    | 'STANDARD'
    | 'PREMIUM';
  const seededName = normalizeNameCheckQuery(input.businessName) || null;
  if (input.businessName && !seededName) {
    return { error: t('companyNameInvalid') };
  }
  if (seededName && !nameHasMinimumSubstance(seededName)) {
    return { error: t('companyNameInvalid') };
  }
  const locale = await storedLocale(input.browserPath);
  const localeData = locale ? { locale } : {};
  const entryPath = storedEntryPath();
  const entryData = entryPath ? { entryPath } : {};

  const session = await auth();
  if (session?.user?.id) {
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType,
        taxElection,
        state: stateCode,
        serviceTier,
        businessName: seededName,
        currentStep: seededName ? 2 : 1,
        completedSteps: JSON.stringify(seededName ? [1] : []),
        ...localeData,
        ...entryData,
        ...filingUtmCreateFields(),
      },
    });
    await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);
    const step = seededName ? 2 : 1;
    return await redirectLocalized(`/wizard/${filing.id}/${step}`, locale);
  }

  const guest = await getGuestUser();
  if (guest && input.draftIntent !== 'new') {
    const draft = await prisma.filing.findFirst({
      where: { userId: guest.id, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, currentStep: true, businessName: true, locale: true, userId: true },
    });
    if (draft && (!input.draftId || input.draftId === draft.id)) {
      const decision = decideDraftNameResume({
        existingName: draft.businessName,
        proposedName: input.draftIntent === 'resume' ? null : seededName,
        currentStep: draft.currentStep,
      });
      const chosenLocale = await alignFilingLocale(draft.id, draft.userId, locale, draft.locale);
      if (decision.action === 'apply' && seededName) {
        await prisma.filing.update({
          where: { id: draft.id },
          data: { businessName: seededName, nameAvailable: null, nameCheckedAt: null },
        });
        return await redirectLocalized(`/wizard/${draft.id}/2`, chosenLocale);
      }
      if (decision.action === 'choose' && seededName) {
        const step = draft.currentStep && draft.currentStep >= 1 ? draft.currentStep : 2;
        return {
          choice: {
            draftId: draft.id,
            existingName: draft.businessName?.trim() || '',
            proposedName: seededName,
            resumeHref: hrefForLocale(`/wizard/${draft.id}/${step}`, chosenLocale),
          },
        };
      }
      const step = decision.action === 'resume' ? decision.step : 2;
      return await redirectLocalized(`/wizard/${draft.id}/${step}`, chosenLocale);
    }
  }

  if (!guest) {
    const limited = checkActionRateLimit('guest-open', 30, 60 * 60 * 1000);
    if (limited) return { error: limited };
  }

  const initialStep = seededName ? 2 : 1;
  let filingId = '';
  try {
    let userId = guest?.id ?? null;
    if (!userId) {
      const token = newGuestToken();
      const placeholderPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const created = await prisma.user.create({
        data: {
          email: placeholderGuestEmail(token),
          firstName: '',
          lastName: '',
          passwordHash: placeholderPassword,
          accountStatus: 'GUEST',
          guestToken: token,
          ...localeData,
          ...userUtmCreateFields(),
        },
      });
      userId = created.id;
      setGuestCookie(token);
    } else {
      await ensureUserFirstTouchUtm(userId);
    }

    cookies().set(PREFERRED_STATE_COOKIE, stateCode, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });

    const filing = await prisma.filing.create({
      data: {
        userId,
        entityType,
        taxElection,
        state: stateCode,
        serviceTier,
        businessName: seededName,
        currentStep: initialStep,
        completedSteps: JSON.stringify(seededName ? [1] : []),
        ...localeData,
        ...entryData,
        ...filingUtmCreateFields(),
      },
    });
    filingId = filing.id;
    await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    logger.error('guest draft open failed', { area: 'guest', tag: 'open-draft' }, err);
    return { error: t('errorStart') };
  }

  return await redirectLocalized(`/wizard/${filingId}/${initialStep}`, locale);
}

// ─── Claim Account (popup → real account) ────────────────────────────────

const ClaimSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
  filingId: z.string().optional(),
  returnStep: z.preprocess(
    (value) => (value === '' || value == null ? undefined : value),
    z.coerce.number().int().min(1).max(TOTAL_STEPS).optional(),
  ),
});

export interface ClaimResult {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Wizard (or dashboard) path that still has this draft. */
  resumeHref?: string;
  /** Same-origin sign-in URL when the email already has an account. */
  signInHref?: string;
  signedIn?: boolean;
  fieldErrors?: Record<string, string>;
  /** The email belongs to an existing account. Sign in to attach the draft. */
  needsSignIn?: boolean;
}

/**
 * Convert the current GUEST user into an ACTIVE account. The customer sets
 * the password in the form. We keep them a guest until sign-in succeeds so a
 * failed sign-in does not dump them on /sign-in without the draft. The welcome
 * email does not include a temporary password.
 */
export async function claimGuestAccount(
  _prev: ClaimResult,
  formData: FormData,
): Promise<ClaimResult> {
  const uiLocale = (await storedLocale()) === 'es' ? 'es' : 'en';
  const t = await getTranslations({ locale: uiLocale, namespace: 'wizard' });
  const parsed = ClaimSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    filingId: (formData.get('filingId') as string) || undefined,
    returnStep: formData.get('returnStep') || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (!fieldErrors[k]) {
        fieldErrors[k] =
          k === 'password'
            ? t('saveExitPasswordInvalid')
            : k === 'email'
              ? t('guestEmailInvalid')
              : t('guestCheckDetails');
      }
    }
    return {
      error: fieldErrors.password ?? fieldErrors.email ?? t('guestCheckDetails'),
      fieldErrors,
    };
  }
  const newEmail = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;
  if (isPlaceholderGuestEmail(newEmail)) {
    return { error: t('guestEmailInvalid'), fieldErrors: { email: t('guestEmailInvalid') } };
  }

  const guest = await getGuestUser();
  if (!guest) return { error: t('guestSessionExpired') };

  // If the customer typed a different email than the one already on the
  // guest record, check that it is not already taken by an ACTIVE account.
  if (newEmail !== guest.email) {
    const collision = await prisma.user.findUnique({ where: { email: newEmail } });
    if (collision && collision.id !== guest.id) {
      const next = hrefForLocale(
        englishPathname(await draftResumeHref(guest.id, parsed.data.filingId, parsed.data.returnStep)),
        uiLocale,
      );
      return {
        needsSignIn: true,
        signInHref: hrefForLocale(
          `/sign-in?email=${encodeURIComponent(newEmail)}&next=${encodeURIComponent(next)}`,
          uiLocale,
        ),
        error: t('guestEmailHasAccount'),
      };
    }
  }

  const resumeHref = await draftResumeHref(
    guest.id,
    parsed.data.filingId,
    parsed.data.returnStep,
  );

  // Set the password they chose, but stay a GUEST until sign-in succeeds.
  // Clearing the guest session first is what dropped people on /sign-in and
  // detached the browser from the draft.
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: guest.id },
    data: {
      email: newEmail,
      passwordHash,
    },
  });

  let signedIn = false;
  try {
    await withActionTimeout(
      signIn('credentials', {
        email: newEmail,
        password,
        redirect: false,
      }),
      8_000,
    );
    signedIn = true;
  } catch (err) {
    if (isRedirectError(err)) {
      signedIn = true;
    } else {
      logger.error(
        'guest account claim: sign-in failed',
        { area: 'guest', entityId: guest.id, tag: 'claim-signin' },
        err,
      );
    }
  }

  if (signedIn) {
    await prisma.user.update({
      where: { id: guest.id },
      data: {
        accountStatus: 'ACTIVE',
        emailVerified: false,
        guestToken: null,
      },
    });
    clearGuestCookie();
  }

  // Welcome email has no temporary password. Don't block the draft on delivery.
  try {
    await withActionTimeout(
      sendEmail({
        type: 'WELCOME',
        to: newEmail,
        userId: guest.id,
        context: { firstName: guest.firstName },
      }),
      4_000,
    );
  } catch (err) {
    logger.error(
      'guest account claim: welcome email failed',
      { area: 'guest', entityId: guest.id, tag: 'claim-email' },
      err,
    );
  }

  return {
    ok: true,
    signedIn,
    resumeHref,
    message: signedIn
      ? 'Account created. Your draft is saved to this account.'
      : 'Password saved. Your draft is still open. Continue it below or sign in with that password.',
  };
}

async function draftResumeHref(
  userId: string,
  filingId?: string,
  returnStep?: number,
): Promise<string> {
  const visibleStep =
    returnStep && returnStep >= 1 && returnStep <= TOTAL_STEPS ? returnStep : null;
  if (filingId) {
    const owned = await prisma.filing.findFirst({
      where: { id: filingId, userId, status: 'DRAFT' },
      select: { id: true, currentStep: true, locale: true },
    });
    if (owned) {
      const step =
        visibleStep ?? (owned.currentStep && owned.currentStep >= 1 ? owned.currentStep : 2);
      return hrefForLocale(
        `/wizard/${owned.id}/${step}`,
        localeFromPathOrFiling(await storedLocale(), owned.locale),
      );
    }
  }
  const draft = await prisma.filing.findFirst({
    where: { userId, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, currentStep: true, locale: true },
  });
  if (!draft) {
    return hrefForLocale('/dashboard', localeFromPathOrFiling(await storedLocale(), null));
  }
  const step =
    visibleStep ?? (draft.currentStep && draft.currentStep >= 1 ? draft.currentStep : 2);
  return hrefForLocale(
    `/wizard/${draft.id}/${step}`,
    localeFromPathOrFiling(await storedLocale(), draft.locale),
  );
}
