'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { trackCtaClicked, trackEvent } from '@/lib/analytics';
import { newlyReachedScrollDepths } from '@/lib/scroll-depth';

/** Same scroll milestones as the Florida LLC landing page, tagged with the guide. */
export function GuideScrollDepth({ source }: { source: string }) {
  const seen = useRef(new Set<number>());

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const percent = max <= 0 ? 100 : (window.scrollY / max) * 100;
      for (const depth of newlyReachedScrollDepths(percent, seen.current)) {
        seen.current.add(depth);
        trackEvent('scroll_depth', { depth, path: window.location.pathname, source });
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [source]);

  return null;
}

/**
 * Guide CTA. `location` is `hero` on the first button and `repeat` on the
 * closing button, matching the landing page `cta_clicked` locations.
 */
export function GuideTrackedCta({
  href,
  label,
  className,
  location,
  source,
}: {
  href: string;
  label: string;
  className: string;
  location: 'hero' | 'repeat';
  source: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      data-testid={`guide-cta-${location}`}
      onClick={() => trackCtaClicked('guide_start', { location, source })}
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
