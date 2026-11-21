import { NextResponse } from 'next/server';
import { radio } from '../../../lib/ytm.js';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const v = (searchParams.get('v') || '').trim();
  if (!v) return NextResponse.json({ tracks: [] });

  try {
    // Preferred: YouTube Music's own radio (songs only, square covers). Falls back to scraping the watch page below.
    const ytm = (await radio(v, { limit: 25 })).filter((t) => t.id !== v);
    if (ytm.length >= 5) return NextResponse.json({ tracks: ytm }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } });
  } catch (e) {}

  try {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(v)}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    });
    const html = await r.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (!match) return NextResponse.json({ tracks: [] });

    const data = JSON.parse(match[1]);
    const results = data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];

    const tracks = [];
    for (const item of results) {
      const cr = item.compactVideoRenderer;
      if (!cr || !cr.videoId || cr.videoId === v) continue;
      let duration = 0;
      const durText = cr.lengthText?.simpleText || '';
      if (durText) {
        const parts = durText.split(':').map(Number);
        if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) duration = parts[0] * 60 + parts[1];
      }
      tracks.push({
        id: cr.videoId,
        title: cr.title?.simpleText || '',
        uploader: (cr.longBylineText?.runs?.[0]?.text || '').replace(/ - Topic$/, ''),
        duration,
        thumbnail: (cr.thumbnail?.thumbnails || []).pop()?.url?.replace(/\?.*/, '') || '',
        url: `https://www.youtube.com/watch?v=${cr.videoId}`,
      });
      if (tracks.length >= 25) break;
    }

    return NextResponse.json({ tracks });
  } catch (err) {
    return NextResponse.json({ error: err.message, tracks: [] }, { status: 500 });
  }
}
