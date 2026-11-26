// Shared YouTube Music (WEB_REMIX) helpers: song search, album search, album browse, and "radio", with in-memory caching.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SONGS_FILTER = 'Eg-KAQwIABAAGAAgACgB';
const ALBUMS_FILTER = 'Eg-KAQwIABAAGAEgACgB';

const store = new Map();     // key -> { exp, val }
const inflight = new Map();  // key -> Promise
export function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.val);
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().then((val) => {
    if (store.size > 400) store.delete(store.keys().next().value);
    store.set(key, { exp: Date.now() + ttlMs, val });
    return val;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function ytm(endpoint, body, gl = 'US') {
  const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Referer: 'https://music.youtube.com/', Origin: 'https://music.youtube.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl } }, ...body }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`YT Music ${endpoint} ${res.status}`);
  return res.json();
}

const toSec = (s) => {
  const p = String(s || '').trim().split(':').map(Number);
  if (!p.length || p.some(Number.isNaN)) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
};
export const cleanArtist = (s) => String(s || '').replace(/\s*-\s*topic$/i, '').replace(/VEVO$/i, '').trim();

export function upscale(url, px = 544) {
  if (!url) return '';
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return /=w\d+-h\d+/.test(url) ? url.replace(/=w\d+-h\d+[^=]*$/, `=w${px}-h${px}-l90-rj`) : `${url}=w${px}-h${px}-l90-rj`;
  }
  return url.replace(/\?.*/, '');
}

const track = (id, title, uploader, duration, thumb) => ({
  id, title, uploader: cleanArtist(uploader) || 'Various Artists', duration,
  thumbnail: upscale(thumb), url: `https://www.youtube.com/watch?v=${id}`,
});

export function parseSearch(d) {
  const sections = d?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const out = [];
  for (const s of sections) {
    for (const it of s.itemSectionRenderer?.contents || s.musicShelfRenderer?.contents || []) {
      const item = it.musicResponsiveListItemRenderer; if (!item) continue;
      const cols = item.flexColumns || [];
      const run0 = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0];
      const id = item.playlistItemData?.videoId || run0?.navigationEndpoint?.watchEndpoint?.videoId
        || item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
      if (!id) continue;
      const title = (cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x) => x.text).join('');
      const sub = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const durRun = sub.find((r) => /^\s*\d+:\d+(:\d+)?\s*$/.test(r.text));
      const segs = []; let cur = '';
      for (const r of sub) { if (r.text.trim() === '•') { segs.push(cur); cur = ''; } else cur += r.text; }
      segs.push(cur);
      const artist = segs.map((x) => x.trim()).find((x) => x && !/^(Song|Video|Album|Single|EP)$/i.test(x) && !/^[\d.]+[MBK]?\s*(plays|views)?$/i.test(x) && !/^\d+:\d+(:\d+)?$/.test(x)) || '';
      const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      out.push(track(id, title, artist, toSec(durRun?.text), thumbs.at(-1)?.url));
    }
  }
  return out;
}

export function parseAlbums(d) {
  const sections = d?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const out = [];
  const seen = new Set();
  for (const s of sections) {
    for (const it of s.itemSectionRenderer?.contents || s.musicShelfRenderer?.contents || []) {
      const item = it.musicResponsiveListItemRenderer; if (!item) continue;
      const browseId = item.navigationEndpoint?.browseEndpoint?.browseId || '';
      if (!browseId || seen.has(browseId)) continue;
      seen.add(browseId);
      const cols = item.flexColumns || [];
      const title = (cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x) => x.text).join('').trim();
      if (!title) continue;
      const sub = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const segs = []; let cur = '';
      for (const r of sub) { if (r.text.trim() === '•') { segs.push(cur.trim()); cur = ''; } else cur += r.text; }
      if (cur.trim()) segs.push(cur.trim());
      const year = segs.find((x) => /^(19|20)\d{2}$/.test(x)) || '';
      const kind = segs.find((x) => /^(Album|Single|EP)$/i.test(x)) || 'Album';
      const artist = segs.find((x) => x && x !== year && !/^(Album|Single|EP)$/i.test(x)) || '';
      const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      out.push({
        id: browseId,
        browseId,
        title,
        artist: cleanArtist(artist) || 'Various Artists',
        year,
        kind,
        thumbnail: upscale(thumbs.at(-1)?.url, 544),
      });
    }
  }
  return out;
}

export function parseRadio(d) {
  const list = d?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]
    ?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents || [];
  const out = [];
  for (const c of list) {
    const r = c.playlistPanelVideoRenderer || c.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
    if (!r?.videoId) continue;
    const runs = r.longBylineText?.runs || r.shortBylineText?.runs || [];
    const first = []; for (const x of runs) { if (x.text.trim() === '•') break; first.push(x.text); }
    out.push(track(r.videoId, (r.title?.runs || []).map((x) => x.text).join(''), first.join('').trim(), toSec(r.lengthText?.runs?.[0]?.text), r.thumbnail?.thumbnails?.at(-1)?.url));
  }
  return out;
}

function collectAlbumItems(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) collectAlbumItems(x, out); return out; }
  if (node.musicResponsiveListItemRenderer) { out.push(node.musicResponsiveListItemRenderer); return out; }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectAlbumItems(v, out);
  }
  return out;
}

export function parseAlbumBrowse(d, browseId) {
  // Handle both twoColumnBrowseResultsRenderer (modern YTM) and singleColumnBrowseResultsRenderer
  const header =
    d?.header?.musicDetailHeaderRenderer ||
    d?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer ||
    d?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer ||
    {};

  const title = (header.title?.runs || []).map((x) => x.text).join('').trim() || 'Album';
  const subRuns = [
    ...(header.straplineTextOne?.runs || []),
    ...(header.subtitle?.runs || []),
  ];
  const segs = []; let cur = '';
  for (const r of subRuns) { if (r.text.trim() === '•') { segs.push(cur.trim()); cur = ''; } else cur += r.text; }
  if (cur.trim()) segs.push(cur.trim());
  const year = segs.find((x) => /^(19|20)\d{2}$/.test(x)) || '';
  const artist = cleanArtist(segs.find((x) => x && x !== year && !/^(Album|Single|EP|Playlist)$/i.test(x) && !/^\d+\s*songs?/i.test(x)) || '');

  const hThumbs =
    header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    header.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
    [];
  const cover = upscale(hThumbs.at(-1)?.url, 544);

  const secondary =
    d?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents ||
    d?.contents?.singleColumnBrowseResultsRenderer ||
    d?.contents;
  const items = collectAlbumItems(secondary);

  const tracks = [];
  const seen = new Set();
  for (const item of items) {
    const cols = item.flexColumns || [];
    const run0 = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0];
    const vid =
      item.playlistItemData?.videoId ||
      run0?.navigationEndpoint?.watchEndpoint?.videoId ||
      item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
    if (!vid || seen.has(vid)) continue;
    seen.add(vid);

    const tTitle = (cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x) => x.text).join('').trim();
    if (!tTitle) continue;

    const sub = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    const fixed = item.fixedColumns || [];
    const durRun =
      fixed.flatMap((c) => c.musicResponsiveListItemFixedColumnRenderer?.text?.runs || []).find((r) => /^\s*\d+:\d+(:\d+)?\s*$/.test(r.text)) ||
      sub.find((r) => /^\s*\d+:\d+(:\d+)?\s*$/.test(r.text));

    const tSegs = []; let tc = '';
    for (const r of sub) { if (r.text.trim() === '•') { tSegs.push(tc.trim()); tc = ''; } else tc += r.text; }
    if (tc.trim()) tSegs.push(tc.trim());
    const tArtist = tSegs.find((x) => x && !/^[\d.,]+[MBK]?\s*(plays|views)?$/i.test(x) && !/^\d+:\d+(:\d+)?$/.test(x)) || artist;

    const tThumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const thumb = tThumbs.length ? tThumbs.at(-1)?.url : cover;
    tracks.push(track(vid, tTitle, tArtist || artist || 'Various Artists', toSec(durRun?.text), thumb));
  }

  return { id: browseId, browseId, title, artist: artist || 'Various Artists', year, thumbnail: cover || tracks[0]?.thumbnail || '', tracks };
}

export const searchSongs = (query, { limit = 12, gl = 'US' } = {}) =>
  cached(`s|${gl}|${query}`, 10 * 60e3, async () => {
    try { return parseSearch(await ytm('search', { query, params: SONGS_FILTER }, gl)); } catch { return []; }
  }).then((a) => a.slice(0, limit));

export const searchAlbums = (query, { limit = 8, gl = 'US' } = {}) =>
  cached(`al|${gl}|${query}`, 15 * 60e3, async () => {
    try { return parseAlbums(await ytm('search', { query, params: ALBUMS_FILTER }, gl)); } catch { return []; }
  }).then((a) => a.slice(0, limit));

export const getAlbum = (browseId, { gl = 'US' } = {}) =>
  cached(`ab|${gl}|${browseId}`, 20 * 60e3, async () => {
    const id = String(browseId || '').trim();
    if (!id) return null;
    // If given a playlist ID (OLAK5uy_ / PL / RDCLAK), fetch via browse VL<id> or next
    const bid = /^(MPREb_|VL|FEmusic)/.test(id) ? id : `VL${id}`;
    try {
      const data = await ytm('browse', { browseId: bid }, gl);
      const parsed = parseAlbumBrowse(data, id);
      if (parsed.tracks.length) return parsed;
    } catch {}
    // Fallback: try `next` with playlistId
    try {
      const plId = id.replace(/^VL/, '');
      const data = await ytm('next', { playlistId: plId, isAudioOnly: true }, gl);
      const tracks = parseRadio(data);
      if (tracks.length) {
        return { id, browseId: id, title: 'Album', artist: tracks[0]?.uploader || 'Various Artists', year: '', thumbnail: tracks[0]?.thumbnail || '', tracks };
      }
    } catch {}
    return null;
  });

export const radio = (videoId, { limit = 25, gl = 'US' } = {}) =>
  cached(`r|${gl}|${videoId}`, 20 * 60e3, async () => {
    try { return parseRadio(await ytm('next', { videoId, playlistId: `RDAMVM${videoId}`, params: 'wAEB', isAudioOnly: true }, gl)); } catch { return []; }
  }).then((a) => a.slice(0, limit + 1));
