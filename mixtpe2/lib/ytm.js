// Shared YouTube Music (WEB_REMIX) helpers: song search + "radio" (similar songs), with in-memory caching.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SONGS_FILTER = 'Eg-KAQwIABAAGAAgACgB';

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

async function ytm(endpoint, body, gl = 'US') {
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

// googleusercontent covers carry a size suffix (=w226-h226...). Ask for a crisp square instead of the tiny default.
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
      // subtitle runs look like: [Song •] Artist [• Album] • 3:45  -> keep only the artist segment
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

export const searchSongs = (query, { limit = 12, gl = 'US' } = {}) =>
  cached(`s|${gl}|${query}`, 10 * 60e3, async () => {
    try { return parseSearch(await ytm('search', { query, params: SONGS_FILTER }, gl)); } catch { return []; }
  }).then((a) => a.slice(0, limit));

// First item is the seed song itself; the rest are YouTube Music's "radio" for it.
export const radio = (videoId, { limit = 25, gl = 'US' } = {}) =>
  cached(`r|${gl}|${videoId}`, 20 * 60e3, async () => {
    try { return parseRadio(await ytm('next', { videoId, playlistId: `RDAMVM${videoId}`, params: 'wAEB', isAudioOnly: true }, gl)); } catch { return []; }
  }).then((a) => a.slice(0, limit + 1));
