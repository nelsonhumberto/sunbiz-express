import { Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "We are not the government" disclosure.
 *
 * Presentational only - the caller passes the already-translated string so this
 * works in both server components (getTranslations) and client components
 * (useTranslations).
 *
 * `prominent` is the ad-landing treatment: a high-contrast notice near the top
 * of the page. `subtle` stays available for secondary placements such as the
 * wizard footer.
 */
export function GovDisclosure({
  text,
  className,
  align = 'center',
  variant = 'subtle',
}: {
  text: string;
  className?: string;
  align?: 'center' | 'left';
  variant?: 'subtle' | 'prominent';
}) {
  if (variant === 'prominent') {
    return (
      <div
        role="note"
        className={cn(
          'flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-left text-sm font-medium leading-relaxed text-amber-950 shadow-sm',
          className,
        )}
      >
        <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden />
        <p>{text}</p>
      </div>
    );
  }

  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-subtle',
        align === 'center' ? 'justify-center text-center max-w-xl mx-auto' : 'text-left',
        className,
      )}
    >
      <Landmark className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
