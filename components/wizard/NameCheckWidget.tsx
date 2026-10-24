'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check,
  AlertTriangle,
  X,
  Loader2,
  Sparkles,
  Search,
  Info,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { joinEntityName, splitEntityName } from '@/lib/florida';
import {
  assessBusinessName,
  suffixOptionsFor,
  type BusinessNameAssessment,
} from '@/lib/formation-validation';
import { FORMATION_STATES, type StateCode } from '@/lib/formation-states';
import { trackEvent } from '@/lib/analytics';
import {
  isRateLimitError,
  nameCheckDelayMs,
  nameCheckErrorEvent,
  nameCheckRequestUrl,
  nameCheckResultEvent,
  nameCheckSubmittedEvent,
  peelTypedSuffix,
  rateLimitCooldownUntil,
  readNameCheckCache,
  realNameCharacterCount,
  requestNameCheck,
  seededBusinessName,
  trailingAmbiguousSuffix,
  writeNameCheckCache,
  type NameCheckResult,
} from '@/lib/name-check';

export type { NameCheckResult };

export type { BusinessNameAssessment };

interface NameCheckWidgetProps {
  initialName?: string | null;
  /** Name passed in from /start (?name=) when the filing row is still blank. */
  defaultBusinessName?: string | null;
  entityType: 'LLC' | 'CORP';
  /** Formation state code; controls suffix list + whether live name search runs. */
  formationState?: StateCode;
  /**
   * Fires whenever the visible name changes. The widget intentionally emits
   * `result: null` synchronously on every keystroke / suffix change so the
   * parent's "Continue" gate can update immediately, then re-emits with the
   * server result once the availability check resolves.
   *
   * The third argument is the rule-based assessment (state-specific
   * warnings / manual-review flags) computed locally from the typed name.
   */
  onChange: (
    name: string,
    result: NameCheckResult | null,
    assessment: BusinessNameAssessment | null,
  ) => void;
}

export function NameCheckWidget({
  initialName,
  defaultBusinessName,
  entityType,
  formationState = 'FL',
  onChange,
}: NameCheckWidgetProps) {
  const t = useTranslations('wizard');
  const stateRule = FORMATION_STATES[formationState] ?? FORMATION_STATES.FL;

  const suffixOptions = useMemo(
    () => suffixOptionsFor(formationState, entityType),
    [entityType, formationState],
  );

  const seededName = seededBusinessName(initialName, defaultBusinessName);
  const initialSplit = useMemo(() => {
    const split = splitEntityName(seededName, entityType);
    return { base: peelTypedSuffix(split.base).trim(), suffix: split.suffix };
  }, [seededName, entityType]);
  const [baseName, setBaseName] = useState(initialSplit.base);
  const [suffix, setSuffix] = useState<string>(initialSplit.suffix);
  const seededCombinedRef = useRef(
    initialSplit.base.trim() ? joinEntityName(initialSplit.base, initialSplit.suffix) : '',
  );
  const editedRef = useRef(false);

  // If the user toggles entity type elsewhere (rare - Step 1) we may end up
  // with a suffix that no longer belongs to this entity type. Snap back to
  // the first valid option in that case.
  useEffect(() => {
    if (!suffixOptions.some((o) => o.value === suffix)) {
      setSuffix(suffixOptions[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NameCheckResult | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const fetchIdRef = useRef(0);
  const retryTokenRef = useRef(0);
  const consumedRetryRef = useRef(0);
  const heldNameRef = useRef<string | null>(null);

  // A typed ending ("Name LLC" plus the LLC dropdown) is stripped so the
  // filed name is not "Name LLC LLC". Trailing spaces stay until an ending
  // actually matches.
  const peeledBase = peelTypedSuffix(baseName);
  const trimmedBase = peeledBase.trim();
  const combinedName = trimmedBase ? joinEntityName(trimmedBase, suffix) : '';
  const baseIsSubstantive = realNameCharacterCount(trimmedBase) >= 2;

  // The filed name already drops a typed ending. Warn while the field still
  // shows one, until blur moves it out of the input.
  const ambiguousSuffix = trailingAmbiguousSuffix(baseName);
  const retryLocked = cooldownUntil !== null && Date.now() < cooldownUntil;

  useEffect(() => {
    if (cooldownUntil === null) return;
    const wait = cooldownUntil - Date.now();
    if (wait <= 0) {
      setCooldownUntil(null);
      return;
    }
    const timer = setTimeout(() => setCooldownUntil(null), wait);
    return () => clearTimeout(timer);
  }, [cooldownUntil]);

  const baseHasSuffix = useMemo(() => {
    const raw = baseName.trim();
    if (!raw) return false;
    return (
      splitEntityName(raw, entityType).matched ||
      splitEntityName(raw, entityType === 'LLC' ? 'CORP' : 'LLC').matched
    );
  }, [baseName, entityType]);

  // Assess the combined name against the state-specific rules (manual-review
  // patterns, restricted-word groups, subjective-review notes). This runs
  // client-side and is independent of the live name search - even Florida
  // names need this to surface restricted-word warnings.
  const assessment: BusinessNameAssessment | null = useMemo(() => {
    if (!combinedName || !baseIsSubstantive) return null;
    return assessBusinessName(combinedName, entityType, formationState);
  }, [combinedName, baseIsSubstantive, entityType, formationState]);

  // Adopt a seeded name that arrives after mount, until the visitor edits.
  useEffect(() => {
    if (editedRef.current) return;
    const nextSeed = seededBusinessName(initialName, defaultBusinessName);
    if (!nextSeed) return;
    const split = splitEntityName(nextSeed, entityType);
    const base = peelTypedSuffix(split.base).trim();
    const combined = base ? joinEntityName(base, split.suffix) : '';
    seededCombinedRef.current = combined;
    setBaseName((current) => (current === base ? current : base));
    setSuffix((current) => (current === split.suffix ? current : split.suffix));
  }, [initialName, defaultBusinessName, entityType]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Always sync the latest combined name to the parent so the wizard's
    // Continue button doesn't lag behind the input. We send `null` for the
    // result; it will be replaced when the fetch (below) resolves. Without
    // this, a typed-but-not-yet-checked name would leave the parent state
    // stale, which is the original "button stays grayed out" bug.
    onChange(combinedName, null, assessment);

    if (!baseIsSubstantive) {
      setResult(null);
      setCheckFailed(false);
      setRateLimited(false);
      setLoading(false);
      return;
    }

    // Only Florida has a live name-search endpoint wired up. For other states
    // we surface a "we'll verify with the state at submission" notice instead
    // of pretending an instant result. Wyoming customers get an extra hint to
    // run the official search themselves, since it's the most accurate way
    // to spot conflicts before submission.
    if (!stateRule.hasLiveNameSearch) {
      setCheckFailed(false);
      setLoading(false);
      const baseMessage =
        stateRule.code === 'WY'
          ? `We'll verify availability with the Wyoming Secretary of State at submission. We strongly recommend running the WyoBiz "Contains" search yourself first - see the link below.`
          : `We'll verify availability with ${stateRule.name} at submission. Names that conflict with an existing ${stateRule.name} entity will be rejected; we'll contact you to choose an alternative.`;
      setResult({
        query: combinedName,
        available: true,
        status: 'available',
        message: baseMessage,
        conflicts: [],
        suggestions: [],
      });
      onChange(
        combinedName,
        {
          query: combinedName,
          available: true,
          status: 'available',
          message: '',
          conflicts: [],
          suggestions: [],
        },
        assessment,
      );
      return;
    }

    // A seeded name checks immediately so the badge (or the failure note)
    // is on screen when step 2 opens. Edits wait out the debounce.
    // Retry bumps retryNonce. That token is consumed only when the request
    // actually starts, so a fresh lookup still runs if a previous result is
    // sitting in state or in the cache.
    const bypassCache = retryNonce !== consumedRetryRef.current;
    if (heldNameRef.current && heldNameRef.current !== combinedName) {
      heldNameRef.current = null;
    }
    const heldForRetry =
      heldNameRef.current !== null && heldNameRef.current === combinedName && !bypassCache;
    if (heldForRetry) {
      setLoading(false);
      setCheckFailed(true);
      setRateLimited(true);
      return;
    }
    if (bypassCache) heldNameRef.current = null;
    const delay = bypassCache ? 0 : nameCheckDelayMs(combinedName, seededCombinedRef.current);
    if (delay === 0) {
      setLoading(true);
    }

    debounceRef.current = setTimeout(async () => {
      if (bypassCache) consumedRetryRef.current = retryNonce;
      const cached = bypassCache ? null : readNameCheckCache(combinedName, entityType);
      if (cached) {
        setRateLimited(false);
        setCheckFailed(false);
        setResult(cached);
        onChange(combinedName, cached, assessment);
        setLoading(false);
        return;
      }
      const id = ++fetchIdRef.current;
      setLoading(true);
      const submitted = nameCheckSubmittedEvent('wizard');
      trackEvent(submitted.event, submitted.properties);
      const outcome = await requestNameCheck(
        nameCheckRequestUrl(combinedName, entityType, { fresh: bypassCache }),
      );
      const recorded = nameCheckResultEvent({
        status: outcome.status,
        ms: outcome.ms,
        error: outcome.error,
      });
      trackEvent(recorded.event, recorded.properties);
      if (outcome.deferred || !outcome.result) {
        const failed = nameCheckErrorEvent({
          source: 'wizard',
          error: outcome.error,
          ms: outcome.ms,
        });
        trackEvent(failed.event, failed.properties);
      }
      if (id !== fetchIdRef.current) return;
      // A failed or timed-out lookup must not block Continue. Keep the
      // warning on screen, with Retry, instead of clearing the badge quietly.
      if (outcome.deferred || !outcome.result) {
        const limited = isRateLimitError(outcome.error);
        setResult(null);
        setCheckFailed(true);
        setRateLimited(limited);
        if (limited) {
          heldNameRef.current = combinedName;
          setCooldownUntil(rateLimitCooldownUntil(Date.now()));
        }
        setLoading(false);
        return;
      }
      writeNameCheckCache(combinedName, entityType, outcome.result);
      setRateLimited(false);
      setCheckFailed(false);
      setResult(outcome.result);
      onChange(combinedName, outcome.result, assessment);
      setLoading(false);
    }, delay);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // onChange is intentionally excluded - it's expected to be stable from
    // the parent's perspective and we only want the effect to fire when the
    // typed name, entity type, or formation state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedName, entityType, formationState, assessment, retryNonce, baseIsSubstantive, cooldownUntil]);

  // Localized status banner - see previous version for rationale.
  const statusMessage = (() => {
    if (!result) return '';
    if (result.available) return t('nameStatusAvailable');
    if (result.status === 'exact_conflict') return t('nameStatusExactConflict');
    if (result.status === 'similar_conflict') return t('nameStatusSimilar');
    return result.message || t('nameStatusError');
  })();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="businessName" className="text-base">
          {t('businessName')} <span className="text-destructive">*</span>
        </Label>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle pointer-events-none" />
            <Input
              id="businessName"
              value={baseName}
              onChange={(e) => {
                editedRef.current = true;
                setBaseName(e.target.value);
              }}
              onBlur={() => {
                const peeled = peelTypedSuffix(baseName).trim();
                if (peeled !== baseName) setBaseName(peeled);
              }}
              placeholder={
                entityType === 'LLC'
                  ? t('namePlaceholderLLC')
                  : t('namePlaceholderCorp')
              }
              className="pl-10 pr-3 h-14 text-lg"
              autoComplete="organization"
              autoFocus
            />
          </div>
          <div className="sm:w-64 shrink-0">
            <Select
              value={suffix}
              onValueChange={(value) => {
                editedRef.current = true;
                setSuffix(value);
              }}
            >
              <SelectTrigger
                id="businessSuffix"
                aria-label={t('suffixLabel')}
                className="h-14 text-base"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suffixOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {ambiguousSuffix === 'co' && (
          <p className="text-xs text-ink-muted flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {t('nameSuffixCoHint')}
          </p>
        )}
        {ambiguousSuffix === 'company' && (
          <p className="text-xs text-ink-muted flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {t('nameSuffixCompanyHint')}
          </p>
        )}
        {baseHasSuffix && !ambiguousSuffix && (
          <p className="text-xs text-warn flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('suffixDuplicateWarn')}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-ink-subtle">
            {t('namePreviewLabel')}{' '}
            <span className="font-medium text-ink">
              {combinedName.trim() || '-'}
            </span>
          </p>
          <div>
            {loading ? (
              <Badge variant="outline">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('checking')}
              </Badge>
            ) : result ? (
              result.available ? (
                <Badge variant="success">
                  <Check className="h-3 w-3" strokeWidth={3} />
                  {t('available')}
                </Badge>
              ) : result.status === 'exact_conflict' ? (
                <Badge variant="danger">
                  <X className="h-3 w-3" />
                  {t('taken')}
                </Badge>
              ) : (
                <Badge variant="warn">
                  <AlertTriangle className="h-3 w-3" />
                  {t('similar')}
                </Badge>
              )
            ) : null}
          </div>
        </div>
      </div>

      {checkFailed && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-ink-muted leading-relaxed flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{rateLimited ? t('nameCheckRateLimit') : t('nameCheckDeferred')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={retryLocked}
            onClick={() => {
              if (retryLocked) return;
              retryTokenRef.current += 1;
              setRetryNonce(retryTokenRef.current);
            }}
          >
            {t('nameCheckRetry')}
          </Button>
        </div>
      )}

      {result && (
        <div
          className={cn(
            'rounded-lg border p-4',
            result.available
              ? 'border-success/30 bg-success-subtle/40'
              : result.status === 'exact_conflict'
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-warn/30 bg-warn-subtle/40'
          )}
        >
          <p
            className={cn(
              'text-sm font-medium',
              result.available
                ? 'text-success'
                : result.status === 'exact_conflict'
                  ? 'text-destructive'
                  : 'text-warn'
            )}
          >
            {statusMessage}
          </p>

          {result.available && (
            <p className="mt-2 text-xs text-success/90 leading-relaxed">
              {t('nameLockUrgency', { state: stateRule.name })}
            </p>
          )}

          {result.conflicts.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-ink uppercase tracking-wider">
                {t('conflictsHeader')}
              </p>
              <ul className="space-y-1">
                {result.conflicts.map((c) => (
                  <li
                    key={c.documentNumber}
                    className="flex items-baseline justify-between text-xs gap-3 py-1 border-b border-border last:border-b-0"
                  >
                    <span className="font-medium text-ink truncate">{c.name}</span>
                    <span className="text-ink-subtle font-mono shrink-0">
                      #{c.documentNumber} · {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-ink uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                {t('tryInstead')}
              </p>
              <div className="flex flex-wrap gap-2">
                {result.suggestions.map((s) => {
                  const split = splitEntityName(s, entityType);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        editedRef.current = true;
                        setBaseName(split.base);
                        if (split.matched) setSuffix(split.suffix);
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-border hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        Manual-review and restricted-word warnings produced by
        assessBusinessName. These are independent of the live name search and
        explain when a name will need paper / admin review (Wyoming "A" rule,
        special characters, regulated words) or when the state may refuse the
        name on subjective grounds (Delaware Division of Corporations).
      */}
      {assessment && assessment.warnings.length > 0 && (
        <div className="space-y-2">
          {assessment.warnings.map((w) => {
            const tone =
              w.kind === 'subjective_review'
                ? 'border-border bg-muted/40 text-ink-muted'
                : w.kind === 'restricted_word_block'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-warn/30 bg-warn-subtle/40 text-ink';
            const Icon =
              w.kind === 'subjective_review'
                ? Info
                : w.kind === 'restricted_word_block'
                  ? X
                  : AlertTriangle;
            return (
              <div
                key={`${w.kind}-${w.id}`}
                className={cn('rounded-lg border p-3 flex items-start gap-2.5 text-xs leading-relaxed', tone)}
              >
                <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{w.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/*
        Wyoming-only: link to the official WyoBiz search and naming PDF so the
        customer can do their own diligence before we submit.
      */}
      {stateRule.code === 'WY' && (
        <div className="rounded-lg border border-border bg-white p-3 text-xs text-ink-muted leading-relaxed">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>
                Wyoming uses a strict <strong>"distinguishable"</strong> rule and reviews many
                names manually. We&apos;ll cross-check your name against the state registry
                before we submit so there are no surprises.
              </p>
              <p className="text-[11px] text-ink-subtle">
                Names that begin with &quot;A&quot; or use special characters are paper-filed
                for manual review by the Wyoming Secretary of State.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
