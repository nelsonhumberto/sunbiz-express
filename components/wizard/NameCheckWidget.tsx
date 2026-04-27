'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, AlertTriangle, X, Loader2, Sparkles, Search } from 'lucide-react';
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
import {
  CORP_SUFFIX_OPTIONS,
  LLC_SUFFIX_OPTIONS,
  joinEntityName,
  splitEntityName,
} from '@/lib/florida';

export interface NameCheckResult {
  query: string;
  available: boolean;
  status: 'available' | 'exact_conflict' | 'similar_conflict' | 'restricted';
  message: string;
  conflicts: { name: string; documentNumber: string; status: string; filingDate: string }[];
  suggestions: string[];
}

interface NameCheckWidgetProps {
  initialName?: string | null;
  entityType: 'LLC' | 'CORP';
  /**
   * Fires whenever the visible name changes. The widget intentionally emits
   * `result: null` synchronously on every keystroke / suffix change so the
   * parent's "Continue" gate can update immediately, then re-emits with the
   * server result once the availability check resolves.
   */
  onChange: (name: string, result: NameCheckResult | null) => void;
}

export function NameCheckWidget({ initialName, entityType, onChange }: NameCheckWidgetProps) {
  const t = useTranslations('wizard');

  const suffixOptions = useMemo(
    () => (entityType === 'LLC' ? LLC_SUFFIX_OPTIONS : CORP_SUFFIX_OPTIONS),
    [entityType],
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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Always sync the latest combined name to the parent so the wizard's
    // Continue button doesn't lag behind the input. We send `null` for the
    // result; it will be replaced when the fetch (below) resolves. Without
    // this, a typed-but-not-yet-checked name would leave the parent state
    // stale, which is the original "button stays grayed out" bug.
    onChange(combinedName, null);

    if (trimmedBase.length < 2) {
      setResult(null);
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
          onChange(combinedName, data);
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
    // typed name or entity type changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedName, entityType]);

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
    </div>
  );
}
