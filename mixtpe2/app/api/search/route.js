import { NextResponse } from 'next/server';
import { searchSongs, searchAlbums } from '../../../lib/ytm.js';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ tracks: [], albums: [] });

  const n = Math.min(Math.max(parseInt(searchParams.get('n') || '12', 10) || 12, 1), 30);
  const gl = /^[a-z]{2}$/i.test(searchParams.get('gl') || '') ? searchParams.get('gl').toUpperCase() : 'US';

  try {
    const [tracks, albums] = await Promise.all([
      searchSongs(q, { limit: n, gl }),
      n > 1 ? searchAlbums(q, { limit: 8, gl }) : Promise.resolve([]),
    ]);

    if (tracks.length > 0 || albums.length > 0) {
      return NextResponse.json({ tracks, albums });
    }
  } catch {}

  // Fallback: YouTube HTML search
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' song')}&sp=EgIQAQ%3D%3D`;
    const r = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (!match) return NextResponse.json({ tracks: [], albums: [] });
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    const tracks = [];
    for (const item of contents) {
      const v = item.videoRenderer;
      if (!v || !v.videoId) continue;
      const title = v.title?.runs?.[0]?.text || '';
      const uploader = v.ownerText?.runs?.[0]?.text || '';
      const thumbs = v.thumbnail?.thumbnails || [];
      const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
      let duration = 0;
      const durText = v.lengthText?.simpleText || '';
      if (durText) {
        const parts = durText.split(':').map(Number);
        if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) duration = parts[0] * 60 + parts[1];
      }
      tracks.push({
        id: v.videoId,
        title,
        uploader: uploader.replace(/ - Topic$/, ''),
        duration,
        thumbnail: thumb.replace(/\?.*/, ''),
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
      if (tracks.length >= n) break;
    }
    return NextResponse.json({ tracks, albums: [] });
  } catch {
    return NextResponse.json({ error: 'Search failed.', tracks: [], albums: [] }, { status: 500 });
  }
}
