import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ tracks: [] });

  const n = Math.min(Math.max(parseInt(searchParams.get('n') || '12'), 1), 30);

  try {
    // 1. YouTube Music Songs search (WEB_REMIX)
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
        query: q,
        params: 'Eg-KAQwIABAAGAAgACgB' // Songs filter
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
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
          let thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
          if (thumb.includes('googleusercontent.com') || thumb.includes('ggpht.com')) {
            thumb = thumb.replace(/=w\d+-h\d+[^=]*$/, '=w800-h800-l90-rj');
          } else if (thumb.includes('i.ytimg.com/vi/')) {
            thumb = thumb.replace(/\/(default|mqdefault|sddefault)\.jpg/, '/hqdefault.jpg');
          }

          tracks.push({
            id: vid,
            title,
            uploader,
            duration,
            thumbnail: thumb.replace(/\?.*/, ''),
            url: `https://www.youtube.com/watch?v=${vid}`
          });

          if (tracks.length >= n) break;
        }
        if (tracks.length >= n) break;
      }

      if (tracks.length > 0) {
        return NextResponse.json({ tracks });
      }
    }
  } catch (err) {
    // fallback
  }

  // 2. Fallback: query with audio song keywords on YouTube
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' song')}&sp=EgIQAQ%3D%3D`;
    const r = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (!match) return NextResponse.json({ tracks: [] });
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
    return NextResponse.json({ tracks });
  } catch (err) {
    return NextResponse.json({ error: err.message, tracks: [] }, { status: 500 });
  }
}
