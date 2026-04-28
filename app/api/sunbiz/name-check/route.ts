import { NextRequest, NextResponse } from 'next/server';
import { checkNameAvailability, SunbizError } from '@/lib/sunbiz';

// Real (non-mock) Sunbiz lookup. Primary source is the sunbizdaily.com JSON
// API (set SUNBIZDAILY_API_KEY in env). Falls back to a CF-bypass scrape
// proxy if SUNBIZ_SCRAPER_PROXY is set. See lib/sunbiz.ts for details.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') ?? '').trim();
  const typeRaw = (searchParams.get('type') ?? 'LLC').toUpperCase();
  const type: 'LLC' | 'CORP' = typeRaw === 'CORP' ? 'CORP' : 'LLC';

  if (!name || name.length < 2) {
    return NextResponse.json(
      {
        available: false,
        status: 'available',
        message: 'Enter at least 2 characters.',
        conflicts: [],
        suggestions: [],
      },
      { status: 400 },
    );
  }

  if (name.length > 100) {
    return NextResponse.json(
      {
        available: false,
        status: 'available',
        message: 'Name is too long (maximum 100 characters).',
        conflicts: [],
        suggestions: [],
      },
      { status: 400 },
    );
  }

  try {
    const result = await checkNameAvailability(name, type);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SunbizError) {
      const httpStatus = errorCodeToHttp(err.code);
      const message = errorCodeToUserMessage(err.code);
      return NextResponse.json(
        {
          query: name,
          available: false,
          status: 'available',
          error: err.code,
          message,
          conflicts: [],
          suggestions: [],
        },
        { status: httpStatus },
      );
    }
    return NextResponse.json(
      {
        query: name,
        available: false,
        status: 'available',
        error: 'unknown',
        message: 'Unexpected error checking name availability.',
        conflicts: [],
        suggestions: [],
      },
      { status: 500 },
    );
  }
}

function errorCodeToHttp(code: SunbizError['code']): number {
  switch (code) {
    case 'cloudflare':
      return 503;
    case 'timeout':
      return 504;
    case 'rate_limit':
      return 429;
    case 'auth':
    case 'not_configured':
      return 503;
    case 'http':
    case 'parse':
      return 502;
    case 'not_found':
      return 404;
    default:
      return 500;
  }
}

function errorCodeToUserMessage(code: SunbizError['code']): string {
  switch (code) {
    case 'cloudflare':
      return 'Sunbiz is temporarily blocking automated lookups. Please try again or contact support.';
    case 'timeout':
      return 'The Sunbiz lookup took too long. Please try again.';
    case 'rate_limit':
      return 'Too many name-availability lookups in a short window. Please wait a moment and try again.';
    case 'auth':
    case 'not_configured':
      return 'Name-availability service is not yet configured. Please try again shortly.';
    case 'http':
    case 'parse':
      return 'Could not reach the Florida Sunbiz registry right now. Please try again.';
    case 'not_found':
      return 'No matching records.';
    default:
      return 'Unexpected error checking name availability.';
  }
}
