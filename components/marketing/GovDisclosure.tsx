import { Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Slim, understated "we are not the government" disclosure.
 *
 * Presentational only - the caller passes the already-translated string so this
 * works in both server components (getTranslations) and client components
 * (useTranslations). Placed on ad landing pages and the guest/wizard funnel to
 * satisfy Google Ads' "Government documents and services" policy, which expects
 * a clearly visible non-affiliation notice on the destination page.
 */
export function GovDisclosure({
  text,
  className,
  align = 'center',
}: {
  text: string;
  className?: string;
  align?: 'center' | 'left';
}) {
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
