import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ songs: [], suggestions: [] });

  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/music/get_search_suggestions', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com/',
        'Origin': 'https://music.youtube.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US'
          }
        },
        input: q
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data = await res.json();
      const songs = [];
      const suggestions = [];
      const seen = new Set();
      const contents = data.contents || [];

      for (const section of contents) {
        const items = section.searchSuggestionsSectionRenderer?.contents || [];
        for (const it of items) {
          // 1. Text search query suggestions (Filtered to pure music, no video junk)
          if (it.searchSuggestionRenderer) {
            const text = (it.searchSuggestionRenderer.suggestion?.runs || []).map(r => r.text).join('').trim();
            if (text && !seen.has(text.toLowerCase())) {
              // Strip video clutter keywords
              if (!/\b(full video|video song|status video|visualizer|reaction|trailer|reaction video)\b/i.test(text)) {
                seen.add(text.toLowerCase());
                suggestions.push(text);
              }
            }
          }

          // 2. Music Entity Suggestions (Songs, Albums, Playlists, Artists ONLY - NO videos, NO view counts)
          if (it.musicResponsiveListItemRenderer) {
            const item = it.musicResponsiveListItemRenderer;
            const cols = item.flexColumns || [];
            const title = (cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('').trim();
            const subtitle = (cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('').trim();

            // REJECT ALL VIDEOS (Show only pure music)
            if (/^Video\b/i.test(subtitle)) continue;
            const musicVideoType = item.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
            if (musicVideoType === 'MUSIC_VIDEO_TYPE_UGC') continue;

            const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
            let thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
            if (thumb.includes('googleusercontent.com') || thumb.includes('ggpht.com')) {
              thumb = thumb.replace(/=w\d+-h\d+[^=]*$/, '=w300-h300-l90-rj');
            }

            const run0 = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0];
            const vid = item.playlistItemData?.videoId || item.navigationEndpoint?.watchEndpoint?.videoId || run0?.navigationEndpoint?.watchEndpoint?.videoId;
            const plId = item.navigationEndpoint?.watchPlaylistEndpoint?.playlistId || item.navigationEndpoint?.browseEndpoint?.browseId?.replace(/^VL/, '');

            let type = 'Song';
            if (/^Playlist/i.test(subtitle) || plId) type = 'Playlist';
            else if (/^Album/i.test(subtitle)) type = 'Album';
            else if (/^Artist/i.test(subtitle) || !vid) type = 'Artist';

            // STRIP OUT ALL VIEWS, PLAYS, SUBSCRIBERS, LIKES
            let cleanSub = subtitle
              .replace(/•\s*[\d\.,]+[MBK]?\s*(plays|views|subscribers|monthly audience|likes)?\s*$/i, '')
              .replace(/•\s*[\d\.,]+[MBK]?\s*(plays|views)?/i, '')
              .replace(/[\d\.,]+[MBK]?\s*(plays|views|subscribers|monthly audience|likes)/i, '')
              .replace(/•\s*$/, '')
              .trim();

            if (!cleanSub || cleanSub === '•') {
              cleanSub = type;
            }

            if (title && (vid || plId)) {
              songs.push({
                id: vid || plId,
                title,
                subtitle: cleanSub,
                thumbnail: thumb,
                type,
                url: vid ? `https://www.youtube.com/watch?v=${vid}` : `https://music.youtube.com/playlist?list=${plId}`
              });
            }
          }
        }
      }

      return NextResponse.json({
        songs: songs.slice(0, 5),
        suggestions: suggestions.slice(0, 6)
      });
    }
  } catch (err) {
    // fallback
  }

  return NextResponse.json({ songs: [], suggestions: [] });
}
