import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

async function searchTrack(query) {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
    const r = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (!match) return null;
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    for (const item of contents) {
      const v = item.videoRenderer;
      if (!v || !v.videoId) continue;
      let duration = 0;
      const durText = v.lengthText?.simpleText || '';
      if (durText) {
        const parts = durText.split(':').map(Number);
        if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) duration = parts[0] * 60 + parts[1];
      }
      return {
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || '',
        uploader: (v.ownerText?.runs?.[0]?.text || '').replace(/ - Topic$/, ''),
        duration,
        thumbnail: (v.thumbnail?.thumbnails || []).pop()?.url?.replace(/\?.*/, '') || '',
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      };
    }
  } catch (e) { }
  return null;
}

async function importSpotify(url) {
  const m = url.match(/(playlist|album)[/:]([A-Za-z0-9]+)/);
  if (!m) throw new Error('Only Spotify playlist and album links are supported.');
  const [, kind, sid] = m;
  const r = await fetch(`https://open.spotify.com/embed/${kind}/${sid}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(12000)
  });
  const html = await r.text();
  const dm = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!dm) throw new Error("Couldn't read that Spotify link.");
  const ent = JSON.parse(dm[1]).props.pageProps.state.data.entity;
  const items = ent.trackList || [];

  const tracks = [];
  for (let i = 0; i < Math.min(items.length, 60); i += 5) {
    const batch = items.slice(i, i + 5);
    const resolved = await Promise.all(
      batch.map(it => searchTrack(`${it.title || ''} ${it.subtitle || ''}`.trim()))
    );
    tracks.push(...resolved.filter(Boolean));
  }
  return { name: ent.name || ent.title || 'Spotify import', tracks };
}

async function importYouTube(url) {
  const m = url.match(/[?&]list=([\w-]+)/);
  if (!m) throw new Error('Paste a YouTube Music or Spotify playlist link.');
  const listId = m[1];
  const r = await fetch(`https://www.youtube.com/playlist?list=${listId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(12000)
  });
  const html = await r.text();
  const dm = html.match(/var ytInitialData = ({.*?});<\/script>/s);
  if (!dm) throw new Error("Couldn't read that playlist link.");
  const data = JSON.parse(dm[1]);
  const header = data?.header?.playlistHeaderRenderer;
  const name = header?.title?.simpleText || 'Imported playlist';
  const vids = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || [];

  const tracks = [];
  for (const item of vids) {
    const v = item.playlistVideoRenderer;
    if (!v || !v.videoId) continue;
    let duration = 0;
    const durText = v.lengthText?.simpleText || '';
    if (durText) {
      const parts = durText.split(':').map(Number);
      if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) duration = parts[0] * 60 + parts[1];
    }
    tracks.push({
      id: v.videoId,
      title: v.title?.runs?.[0]?.text || '',
      uploader: (v.shortBylineText?.runs?.[0]?.text || '').replace(/ - Topic$/, ''),
      duration,
      thumbnail: (v.thumbnail?.thumbnails || []).pop()?.url?.replace(/\?.*/, '') || '',
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
    });
    if (tracks.length >= 200) break;
  }
  return { name, tracks };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const url = (body.url || '').trim();
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const result = url.includes('spotify') ? await importSpotify(url) : await importYouTube(url);
    if (!result.tracks.length) {
      return NextResponse.json({ error: 'No songs could be imported from that link.' }, { status: 422 });
    }
    return NextResponse.json({ playlist: result }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
