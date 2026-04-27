'use client';

import { useEffect, useState, useRef } from 'react';
import { Check, AlertTriangle, X, Loader2, Sparkles, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { hasLLCSuffix, hasCorpSuffix } from '@/lib/florida';

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
  onChange: (name: string, result: NameCheckResult | null) => void;
}

export function NameCheckWidget({ initialName, entityType, onChange }: NameCheckWidgetProps) {
  const [name, setName] = useState(initialName ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NameCheckResult | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!name || name.trim().length < 2) {
      setResult(null);
      onChange(name, null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const id = ++fetchIdRef.current;
      setLoading(true);
      try {
        const url = `/api/sunbiz/name-check?name=${encodeURIComponent(name)}&type=${entityType}`;
        const res = await fetch(url);
        const data = (await res.json()) as NameCheckResult;
        if (id === fetchIdRef.current) {
          setResult(data);
          onChange(name, data);
        }
      } catch (e) {
        // ignore
      } finally {
        if (id === fetchIdRef.current) setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, entityType]);

  const suffixOk = entityType === 'LLC' ? hasLLCSuffix(name) : hasCorpSuffix(name);
  const trimmed = name.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="businessName" className="text-base">
          Business name <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle pointer-events-none" />
          <Input
            id="businessName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={entityType === 'LLC' ? 'e.g., Sunshine Coast Ventures LLC' : 'e.g., Atlantic Holdings Inc.'}
            className="pl-10 pr-32 h-14 text-lg"
            autoComplete="organization"
            autoFocus
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {loading ? (
              <Badge variant="outline">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking…
              </Badge>
            ) : result ? (
              result.available ? (
                <Badge variant="success">
                  <Check className="h-3 w-3" strokeWidth={3} />
                  Available
                </Badge>
              ) : result.status === 'exact_conflict' ? (
                <Badge variant="danger">
                  <X className="h-3 w-3" />
                  Taken
                </Badge>
              ) : (
                <Badge variant="warn">
                  <AlertTriangle className="h-3 w-3" />
                  Similar
                </Badge>
              )
            ) : null}
          </div>
        </div>
        {trimmed.length > 1 && !suffixOk && (
          <p className="text-xs text-warn flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {entityType === 'LLC'
              ? 'Florida LLC names must end with LLC, L.L.C., or Limited Liability Company.'
              : 'Florida corporation names must end with Corp, Corporation, Inc, Incorporated, Co, or Company.'}
          </p>
        )}
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
            {result.message}
          </p>

          {result.available && (
            <p className="mt-2 text-xs text-success/90 leading-relaxed">
              Florida won't reserve this name until your formation is filed. Lock it in by
              continuing now — we submit the same business day.
            </p>
          )}

          {result.conflicts.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-ink uppercase tracking-wider">
                Conflicting entities on Sunbiz
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
                Try these instead
              </p>
              <div className="flex flex-wrap gap-2">
                {result.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setName(s)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-border hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
