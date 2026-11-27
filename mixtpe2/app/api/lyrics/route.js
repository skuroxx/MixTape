import { NextResponse } from 'next/server';
import { fetchLyrics } from '../../../lib/lyrics';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || '').trim();
  if (!title) return NextResponse.json({ synced: [], plain: '', kind: 'none' });

  try {
    const result = await fetchLyrics(
      title,
      searchParams.get('artist') || '',
      searchParams.get('duration') || 0,
      searchParams.get('vid') || '',
      searchParams.get('source') || 'auto',
      searchParams.get('strict') === '1',
      searchParams.get('prefer') || 'word'
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ synced: [], plain: '', kind: 'none' });
  }
}
