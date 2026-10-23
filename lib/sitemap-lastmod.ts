import snapshot from '@/data/sitemap-lastmod.json';

/**
 * Sitemap `lastModified` dates.
 *
 * The committed map is the source of truth. It was generated from
 * `git log -1 --format=%cI` on each English page file (23 Oct 2026).
 * Spanish URLs that were already translated use the messages/es.json
 * commit. Spanish URLs translated in this change use that authoring time.
 * A build does not stamp `new Date()`, so the dates stay stable when git
 * history is shallow.
 */

const DATES = snapshot as Record<string, string>;

export function contentLastModified(urlPath: string): Date {
  const iso = DATES[urlPath];
  if (!iso) return new Date('2026-05-27T00:00:00.000Z');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date('2026-05-27T00:00:00.000Z') : date;
}
