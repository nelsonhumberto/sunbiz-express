'use client';

import { useEffect, useState } from 'react';
import { greetingText } from '@/lib/greeting';

/**
 * Morning, afternoon, and evening follow the browser clock.
 * The first paint omits the greeting so server UTC cannot mismatch
 * the user's timezone. A missing name has no trailing comma.
 */
export function DashboardGreeting({
  name,
  morning,
  afternoon,
  evening,
}: {
  name: string;
  morning: string;
  afternoon: string;
  evening: string;
}) {
  const [part, setPart] = useState<string | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    setPart(hour < 12 ? morning : hour < 18 ? afternoon : evening);
  }, [morning, afternoon, evening]);

  const trimmed = name.trim();
  const text = greetingText(part, trimmed);

  return (
    <p className="text-sm text-ink-subtle">
      {text ? (
        trimmed && part ? (
          <>
            {part}, <span className="text-ink font-medium">{trimmed}</span>
          </>
        ) : (
          <span className={trimmed ? 'text-ink font-medium' : undefined}>{text}</span>
        )
      ) : (
        <span className="inline-block min-h-[1.25rem]" />
      )}
    </p>
  );
}

export { greetingText };
