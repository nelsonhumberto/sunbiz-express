import { NextRequest, NextResponse } from 'next/server';
import { checkNameAvailability } from '@/lib/sunbiz-mock';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') ?? '').trim();
  const type = (searchParams.get('type') ?? 'LLC').toUpperCase() as 'LLC' | 'CORP';

  if (!name || name.length < 2) {
    return NextResponse.json(
      { available: false, status: 'available', message: 'Enter at least 2 characters.' },
      { status: 400 }
    );
  }

  const result = await checkNameAvailability(name, type);
  return NextResponse.json(result);
}
