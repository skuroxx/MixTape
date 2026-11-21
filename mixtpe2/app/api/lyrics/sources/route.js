import { NextResponse } from 'next/server';
import { listSources } from '../../../../lib/lyrics';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ sources: listSources() });
}
