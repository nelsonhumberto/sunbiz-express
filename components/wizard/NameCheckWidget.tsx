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

export interface NameCheckResult {
  query: string;
  available: boolean;
  status: 'available' | 'exact_conflict' | 'similar_conflict' | 'restricted';
  message: string;
  conflicts: { name: string; documentNumber: string; status: string; filingDate: string }[];
  suggestions: string[];
}

export type { BusinessNameAssessment };

interface NameCheckWidgetProps {
  initialName?: string | null;
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

  const initialSplit = useMemo(
    () => splitEntityName(initialName ?? '', entityType),
    [initialName, entityType],
  );
  const [baseName, setBaseName] = useState(initialSplit.base);
  const [suffix, setSuffix] = useState<string>(initialSplit.suffix);

  // If the user toggles entity type elsewhere (rare — Step 1) we may end up
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
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const fetchIdRef = useRef(0);

  const trimmedBase = baseName.trim();
  // When the base is empty we emit an empty combined name. That keeps the
  // parent's `name.trim().length >= 2` gate honest — a bare suffix like
  // "LLC" should never count as a valid business name.
  const combinedName = trimmedBase ? joinEntityName(baseName, suffix) : '';

  // Surface a soft warning when the user typed a suffix into the base field
  // (e.g. "Acme LLC" with the LLC dropdown) so the canonical name doesn't
  // double up ("Acme LLC LLC").
  const baseHasSuffix = useMemo(() => {
    if (!trimmedBase) return false;
    return splitEntityName(trimmedBase, entityType).matched;
  }, [trimmedBase, entityType]);

  // Assess the combined name against the state-specific rules (manual-review
  // patterns, restricted-word groups, subjective-review notes). This runs
  // client-side and is independent of the live name search — even Florida
  // names need this to surface restricted-word warnings.
  const assessment: BusinessNameAssessment | null = useMemo(() => {
    if (!combinedName || trimmedBase.length < 2) return null;
    return assessBusinessName(combinedName, entityType, formationState);
  }, [combinedName, trimmedBase, entityType, formationState]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Always sync the latest combined name to the parent so the wizard's
    // Continue button doesn't lag behind the input. We send `null` for the
    // result; it will be replaced when the fetch (below) resolves. Without
    // this, a typed-but-not-yet-checked name would leave the parent state
    // stale, which is the original "button stays grayed out" bug.
    onChange(combinedName, null, assessment);

    if (trimmedBase.length < 2) {
      setResult(null);
      return;
    }

    // Only Florida has a live name-search endpoint wired up. For other states
    // we surface a "we'll verify with the state at submission" notice instead
    // of pretending an instant result. Wyoming customers get an extra hint to
    // run the official search themselves, since it's the most accurate way
    // to spot conflicts before submission.
    if (!stateRule.hasLiveNameSearch) {
      const baseMessage =
        stateRule.code === 'WY'
          ? `We'll verify availability with the Wyoming Secretary of State at submission. We strongly recommend running the WyoBiz "Contains" search yourself first — see the link below.`
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

    debounceRef.current = setTimeout(async () => {
      const id = ++fetchIdRef.current;
      setLoading(true);
      try {
        const url = `/api/sunbiz/name-check?name=${encodeURIComponent(combinedName)}&type=${entityType}`;
        const res = await fetch(url);
        if (!res.ok) {
          // Server signalled an error. We deliberately do NOT block the
          // wizard's Continue button — server-side validation will still
          // run on submit. Just clear the local availability badge.
          if (id === fetchIdRef.current) setResult(null);
          return;
        }
        const data = (await res.json()) as NameCheckResult;
        if (id === fetchIdRef.current) {
          setResult(data);
          onChange(combinedName, data, assessment);
        }
      } catch {
        if (id === fetchIdRef.current) setResult(null);
      } finally {
        if (id === fetchIdRef.current) setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // onChange is intentionally excluded — it's expected to be stable from
    // the parent's perspective and we only want the effect to fire when the
    // typed name, entity type, or formation state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedName, entityType, formationState, assessment]);

  // Localized status banner — see previous version for rationale.
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
              onChange={(e) => setBaseName(e.target.value)}
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
            <Select value={suffix} onValueChange={setSuffix}>
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

        {baseHasSuffix && (
          <p className="text-xs text-warn flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('suffixDuplicateWarn')}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-ink-subtle">
            {t('namePreviewLabel')}{' '}
            <span className="font-medium text-ink">
              {combinedName.trim() || '—'}
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
              {t('nameLockUrgency')}
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
