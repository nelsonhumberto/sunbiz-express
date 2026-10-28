export const SCROLL_DEPTHS = [25, 50, 75, 100] as const;
export type ScrollDepth = (typeof SCROLL_DEPTHS)[number];

/** Milestones crossed by this percent that have not been recorded yet. */
export function newlyReachedScrollDepths(
  percent: number,
  seen: ReadonlySet<number>,
): ScrollDepth[] {
  if (!Number.isFinite(percent) || percent < 0) return [];
  const capped = Math.min(100, percent);
  return SCROLL_DEPTHS.filter((depth) => capped >= depth && !seen.has(depth));
}
