// MixTape stream Worker: resolves a YouTube audio stream and proxies the bytes (with Range support).
//
// Why proxy instead of handing the browser the googlevideo URL? Those URLs are signed for the IP that asked for
// them. If Vercel/the Worker resolves the URL, a phone on another IP gets 403. Fetching the bytes from the same
// place that resolved the URL avoids that.
//
// Resolving: first `new Ytdl().getInfo(id)` from @distube/ytdl-core (same call as the original snippet). Only clients that need
// no player script can run here (Workers forbid the vm/eval its signature solver uses), so it is pinned to `visionos`.
// wrangler.toml defines import.meta.url (undefined in Workers) so the library can load. If ytdl-core fails, we fall back to
// asking YouTube's player endpoint directly as android_vr / android clients, which also return plain URLs.
//
//   GET /search?q=...                           -> [{ id, title, uploader, duration, thumbnail }]   (needs Bearer secret)
//   GET /resolve?v=ID&fmt=opus|aac&quality=..   -> metadata + chosen codec                         (needs Bearer secret)
//   GET /stream?v=ID&fmt=..&quality=..&t=TOKEN  -> audio bytes, Range/seek supported               (needs signed token)
import { Ytdl } from '@distube/ytdl-core';
import { searchSongs } from '../../lib/ytm.js';
import { verifyStream } from '../../lib/streamToken.js';

// Order matters. android_vr needs no PO token (but "made for kids" videos are unavailable and YouTube A/B-tests it).
// "ANDROID" is sent WITHOUT androidSdkVersion on purpose: with it YouTube demands a PO token for audio (403s).
// iOS usually needs a PO token, so it is only a last resort.
const CLIENTS = [
  { id: 28, ver: '1.60.19', ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    ctx: { clientName: 'ANDROID_VR', clientVersion: '1.60.19', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32 } },
  { id: 3, ver: '20.10.38', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', osName: 'Android', osVersion: '11' } },
  { id: 5, ver: '20.10.4', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' } },
];

const ID_RE = /^[\w-]{11}$/;
const cache = new Map(); // `${id}|${fmt}|${quality}` -> { exp, info }

function pick(formats, fmt, quality) {
  const audio = formats.filter((f) => f.url && /^audio\//.test(f.mimeType || ''));
  const by = (re) => audio.filter((f) => re.test(f.mimeType)).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const opus = by(/opus/i), aac = by(/mp4a/i);
  let pool = fmt === 'aac' ? (aac.length ? aac : opus) : (opus.length ? opus : aac);
  if (!pool.length) pool = audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (!pool.length) return null;
  if (quality === 'medium' || quality === 'low') {
    const cap = quality === 'low' ? 70000 : 130000;
    return pool.find((f) => (f.averageBitrate || f.bitrate || 0) <= cap) || pool[pool.length - 1];
  }
  return pool[0];
}

const YTDL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
let ytdl = null;
async function resolveYtdl(id, fmt, quality) {
  ytdl = ytdl || new Ytdl({ clients: ['visionos'] });
  const info = await ytdl.getInfo(id);                 // <- same as: const info = await yt.getInfo(videoId)
  const f = pick(info.formats, fmt, quality);          // audio-only, opus or aac, by bitrate
  if (!f) throw new Error('no direct audio format');
  const v = info.videoDetails || {}, thumbs = v.thumbnails || [];
  return {
    id, url: f.url, ua: YTDL_UA,
    mime: (f.mimeType || '').split(';')[0],
    codec: /opus/i.test(f.mimeType) ? 'opus' : /mp4a/i.test(f.mimeType) ? 'aac' : 'audio',
    bitrate: f.averageBitrate || f.bitrate || 0, size: +f.contentLength || 0,
    title: v.title || '', uploader: String(v.author?.name || '').replace(/ - Topic$/i, ''),
    duration: +v.lengthSeconds || 0, thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : '',
    client: `ytdl-core:${f.client || info.client || 'visionos'}`,
  };
}

async function resolveRaw(id, fmt, quality) {
  let lastErr = 'no playable audio stream';
  for (const c of CLIENTS) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': String(c.id), 'X-YouTube-Client-Version': c.ver, Origin: 'https://www.youtube.com' },
        body: JSON.stringify({
          videoId: id,
          context: { client: { ...c.ctx, hl: 'en', gl: 'US', utcOffsetMinutes: 0 } },
          playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
          contentCheckOk: true, racyCheckOk: true,
        }),
      });
      const d = await res.json();
      if (d?.playabilityStatus?.status !== 'OK') { lastErr = d?.playabilityStatus?.reason || `player ${res.status}`; continue; }
      const f = pick(d.streamingData?.adaptiveFormats || [], fmt, quality);
      if (!f) { lastErr = 'no direct audio format'; continue; }
      const v = d.videoDetails || {};
      const thumbs = v.thumbnail?.thumbnails || [];
      return {
        id, url: f.url, ua: c.ua,
        mime: (f.mimeType || '').split(';')[0],
        codec: /opus/i.test(f.mimeType) ? 'opus' : /mp4a/i.test(f.mimeType) ? 'aac' : 'audio',
        bitrate: f.averageBitrate || f.bitrate || 0,
        size: +f.contentLength || 0,
        title: v.title || '', uploader: String(v.author || '').replace(/ - Topic$/i, ''),
        duration: +v.lengthSeconds || 0, thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : '',
        client: c.ctx.clientName,
      };
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}

async function resolveFresh(id, fmt, quality) {
  let first = '';
  try { return await resolveYtdl(id, fmt, quality); } catch (e) { first = `ytdl-core: ${e.message}`; }
  try { return await resolveRaw(id, fmt, quality); } catch (e) { throw new Error(`${first} | direct: ${e.message}`); }
}

async function getInfo(id, fmt, quality, force = false) {
  const key = `${id}|${fmt}|${quality}`, hit = cache.get(key);
  if (!force && hit && hit.exp > Date.now()) return hit.info;
  const info = await resolveFresh(id, fmt, quality);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, { exp: Date.now() + 20 * 60e3, info });
  return info;
}

function corsHeaders(request, env) {
  const allow = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const h = new Headers({
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Authorization, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    'Access-Control-Max-Age': '86400', Vary: 'Origin',
  });
  if (allow.includes('*')) h.set('Access-Control-Allow-Origin', '*');
  else if (origin && allow.includes(origin)) h.set('Access-Control-Allow-Origin', origin);
  return h;
}

const json = (data, status, cors) => { const h = new Headers(cors); h.set('Content-Type', 'application/json'); h.set('Cache-Control', 'no-store'); return new Response(JSON.stringify(data), { status, headers: h }); };

async function stream(request, env, id, fmt, quality, cors) {
  let info = await getInfo(id, fmt, quality);
  const range = request.headers.get('Range');
  const go = () => fetch(info.url, { headers: { 'User-Agent': info.ua, Range: range || 'bytes=0-' } });
  let up = await go();
  if (up.status === 403 || up.status === 410 || up.status === 404) { // expired or IP-rotated link: resolve again once
    try { up.body && up.body.cancel(); } catch (e) {}
    info = await getInfo(id, fmt, quality, true); up = await go();
  }
  if (!up.ok && up.status !== 206) return json({ error: `upstream ${up.status}` }, 502, cors);

  const h = new Headers(cors);
  h.set('Content-Type', up.headers.get('Content-Type') || info.mime || 'audio/webm');
  h.set('Accept-Ranges', 'bytes');
  h.set('Cache-Control', 'private, max-age=3600');
  h.set('X-Audio-Codec', info.codec); h.set('X-Audio-Bitrate', String(info.bitrate)); h.set('Access-Control-Expose-Headers', `${h.get('Access-Control-Expose-Headers')}, X-Audio-Codec, X-Audio-Bitrate`);
  const len = up.headers.get('Content-Length'), cr = up.headers.get('Content-Range');
  if (len) h.set('Content-Length', len);
  let status = up.status;
  if (range && cr) h.set('Content-Range', cr);
  else if (!range) { status = 200; } // we asked upstream for bytes=0- on the client's behalf: present it as a plain 200
  return new Response(request.method === 'HEAD' ? null : up.body, { status, headers: h });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method not allowed' }, 405, cors);

    const url = new URL(request.url), p = url.pathname;
    const secret = env.STREAM_SECRET || '';
    const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const authed = !secret || bearer === secret;
    const id = url.searchParams.get('v') || '';
    const fmt = url.searchParams.get('fmt') === 'aac' ? 'aac' : 'opus';
    const quality = ['low', 'medium', 'high'].includes(url.searchParams.get('quality')) ? url.searchParams.get('quality') : 'high';

    try {
      if (p === '/') return new Response('mixtape stream worker ok', { headers: cors });

      if (p === '/search') {
        if (!authed) return json({ error: 'unauthorized' }, 401, cors);
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json({ error: 'missing q' }, 400, cors);
        return json({ tracks: await searchSongs(q, { limit: 10 }) }, 200, cors);
      }

      if (p === '/resolve') {
        if (!authed) return json({ error: 'unauthorized' }, 401, cors);
        if (!ID_RE.test(id)) return json({ error: 'bad video id' }, 400, cors);
        const { url: _u, ua: _ua, ...safe } = await getInfo(id, fmt, quality); // never expose the googlevideo URL
        return json(safe, 200, cors);
      }

      if (p === '/stream') {
        if (!ID_RE.test(id)) return json({ error: 'bad video id' }, 400, cors);
        if (secret && !(await verifyStream(secret, id, fmt, quality, url.searchParams.get('t')))) return json({ error: 'invalid or expired token' }, 403, cors);
        return await stream(request, env, id, fmt, quality, cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: e.message || 'failed' }, 502, cors);
    }
  },
};
