import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

async function searchMusic(query, limit = 12) {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com/',
        'Origin': 'https://music.youtube.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
        query,
        params: 'Eg-KAQwIABAAGAAgACgB' // Songs
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) return [];
    const d = await res.json();
    const sections = d.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const tracks = [];

    for (const s of sections) {
      const list = s.itemSectionRenderer?.contents || s.musicShelfRenderer?.contents || [];
      for (const it of list) {
        const item = it.musicResponsiveListItemRenderer;
        if (!item) continue;
        const cols = item.flexColumns || [];
        const title = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
        const run0 = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0];
        const vid = item.playlistItemData?.videoId || run0?.navigationEndpoint?.watchEndpoint?.videoId || item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
        if (!vid) continue;

        const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        const artistNames = subRuns
          .map(r => r.text)
          .filter(t => !t.includes('•') && !/^\s*(Song|Video|Album|Single)\s*$/i.test(t) && !/^\s*\d+(\.\d+)?[MBK]?\s*(plays|views)?\s*$/i.test(t) && !/^\s*\d+:\d+\s*$/.test(t))
          .filter(Boolean);
        const uploader = artistNames.join(', ').trim() || 'Various Artists';

        const durRun = subRuns.find(r => /^\s*\d+:\d+\s*$/.test(r.text));
        let duration = 0;
        if (durRun) {
          const parts = durRun.text.trim().split(':').map(Number);
          if (parts.length === 2) duration = parts[0] * 60 + parts[1];
          else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';

        tracks.push({
          id: vid,
          title,
          uploader,
          duration,
          thumbnail: thumb.replace(/\?.*/, ''),
          url: `https://www.youtube.com/watch?v=${vid}`
        });

        if (tracks.length >= limit) break;
      }
      if (tracks.length >= limit) break;
    }
    return tracks;
  } catch (e) {
    return [];
  }
}

export async function GET() {
  try {
    const [trending, feelGood, chill, fresh] = await Promise.all([
      searchMusic('top songs', 12),
      searchMusic('feel good pop songs', 12),
      searchMusic('chill vibes songs', 12),
      searchMusic('new music songs', 12),
    ]);

    const sections = [
      trending.length && { kind: 'list', title: 'Quick picks', subtitle: 'Trending songs on YouTube Music', tracks: trending.slice(0, 8) },
      trending.length && { kind: 'cards', title: 'Trending now', subtitle: 'What everyone is playing', tracks: trending },
      feelGood.length && { kind: 'cards', title: 'Feel good', subtitle: 'Bright, easy songs', tracks: feelGood },
      chill.length && { kind: 'cards', title: 'Chill', subtitle: 'Slow it down', tracks: chill },
      fresh.length && { kind: 'cards', title: 'Fresh finds', subtitle: 'New tracks beyond your usual rotation', tracks: fresh },
    ].filter(Boolean);

    return NextResponse.json({ sections });
  } catch (err) {
    return NextResponse.json({ error: err.message, sections: [] }, { status: 500 });
  }
}
