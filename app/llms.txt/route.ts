import { buildLlmsTxt } from '@/lib/llms';

// Static: content derives from compile-time marketing data. Regenerated on
// each deploy; revalidated daily as a safety net.
export const dynamic = 'force-static';
export const revalidate = 86400;

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
