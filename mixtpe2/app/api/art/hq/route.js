import { NextResponse } from 'next/server';
import { getHQArtwork } from '../../../../lib/artwork';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || '';
  const artist = searchParams.get('artist') || '';
  const thumb = searchParams.get('thumb') || '';

  if (!title && !thumb) {
    return NextResponse.json({ artworkUrl: thumb });
  }

  try {
    const artworkUrl = await getHQArtwork(title, artist, thumb);
    return NextResponse.json({ artworkUrl: artworkUrl || thumb });
  } catch (err) {
    return NextResponse.json({ artworkUrl: thumb });
  }
}
