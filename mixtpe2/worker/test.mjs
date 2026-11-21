import { build } from 'esbuild';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';

await build({ entryPoints: ['worker/src/index.js'], bundle: true, format: 'esm', platform: 'neutral', alias: { '@distube/ytdl-core': new URL('./mock-ytdl.mjs', import.meta.url).pathname }, outfile: '/tmp/mixtape-worker.mjs', logLevel: 'silent' });
const worker = (await import('/tmp/mixtape-worker.mjs?' + Date.now())).default;

const ID = 'dQw4w9WgXcQ', SECRET = 's3cret', env = { STREAM_SECRET: SECRET, ALLOWED_ORIGINS: 'https://my.site' };
const AUDIO = new Uint8Array(10000).map((_, i) => i % 251);
let playerCalls = 0, expireNext = false; const seen = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('/youtubei/v1/player')) {
    playerCalls++;
    const body = JSON.parse(init.body);
    if (body.context.client.clientName === 'ANDROID_VR' && globalThis.__vrFails) return Response.json({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'bot' } });
    return Response.json({ playabilityStatus: { status: 'OK' }, videoDetails: { title: 'Mock Song', author: 'Mock Artist - Topic', lengthSeconds: '200', thumbnail: { thumbnails: [{ url: 'https://t/a.jpg' }] } },
      streamingData: { adaptiveFormats: [
        { url: 'https://gv/video', mimeType: 'video/mp4; codecs="avc1"', bitrate: 900000 },
        { url: 'https://gv/aac', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 130000, contentLength: '10000' },
        { url: `https://gv/opus-${playerCalls}`, mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, averageBitrate: 150000, contentLength: '10000' },
        { url: 'https://gv/opus-low', mimeType: 'audio/webm; codecs="opus"', bitrate: 50000, averageBitrate: 48000, contentLength: '10000' } ] } });
  }
  if (url.startsWith('https://gv/')) {
    seen.push({ url, range: init.headers?.Range, ua: init.headers?.['User-Agent'] });
    if (expireNext) { expireNext = false; return new Response('gone', { status: 403 }); }
    const m = /bytes=(\d+)-(\d*)/.exec(init.headers?.Range || 'bytes=0-'); const a = +m[1], b = m[2] ? +m[2] : AUDIO.length - 1;
    return new Response(AUDIO.slice(a, b + 1), { status: 206, headers: { 'Content-Type': 'audio/webm', 'Content-Length': String(b - a + 1), 'Content-Range': `bytes ${a}-${b}/${AUDIO.length}` } });
  }
  if (url.includes('music.youtube.com')) return Response.json({});
  throw new Error('unexpected fetch ' + url);
};

const tok = (fmt = 'opus', q = 'high', ttl = 600, id = ID) => { const e = Math.floor(Date.now() / 1000) + ttl; return `${e}.${createHmac('sha256', SECRET).update(`${id}.${fmt}.${q}.${e}`).digest('hex')}`; };
globalThis.__ytdlFails = true; // sections below exercise the direct-client fallback; the ytdl-core path is tested at the end
const call = (path, headers = {}) => worker.fetch(new Request('https://w.test' + path, { headers }), env);

// resolve: needs the secret, never leaks the googlevideo URL, picks opus
assert.equal((await call(`/resolve?v=${ID}`)).status, 401);
let r = await call(`/resolve?v=${ID}`, { Authorization: `Bearer ${SECRET}` }); let j = await r.json();
assert.equal(r.status, 200); assert.equal(j.codec, 'opus'); assert.equal(j.uploader, 'Mock Artist'); assert.ok(!('url' in j)); assert.equal(j.bitrate, 150000);
// aac + data saver selection
j = await (await call(`/resolve?v=${ID}&fmt=aac`, { Authorization: `Bearer ${SECRET}` })).json(); assert.equal(j.codec, 'aac');
j = await (await call(`/resolve?v=${ID}&quality=low`, { Authorization: `Bearer ${SECRET}` })).json(); assert.equal(j.bitrate, 48000);
// stream: token required
assert.equal((await call(`/stream?v=${ID}&fmt=opus&quality=high`)).status, 403);
assert.equal((await call(`/stream?v=${ID}&fmt=opus&quality=high&t=${tok('aac')}`)).status, 403, 'token for another format must fail');
assert.equal((await call(`/stream?v=${ID}&fmt=opus&quality=high&t=${tok('opus', 'high', -5)}`)).status, 403, 'expired token must fail');
// ranged request -> 206 with Content-Range, CORS for the allowed origin only
r = await call(`/stream?v=${ID}&fmt=opus&quality=high&t=${tok()}`, { Range: 'bytes=100-199', Origin: 'https://my.site' });
assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 100-199/10000'); assert.equal(r.headers.get('access-control-allow-origin'), 'https://my.site');
assert.equal(r.headers.get('x-audio-codec'), 'opus'); assert.equal((await r.arrayBuffer()).byteLength, 100);
assert.ok(seen.at(-1).ua.includes('oculus'), 'must reuse the client UA that resolved the URL');
r = await call(`/stream?v=${ID}&fmt=opus&quality=high&t=${tok()}`, { Origin: 'https://evil.site' }); assert.equal(r.headers.get('access-control-allow-origin'), null);
// no Range header -> plain 200 with the whole file
r = await call(`/stream?v=${ID}&fmt=opus&quality=high&t=${tok()}`); assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, 10000); assert.equal(seen.at(-1).range, 'bytes=0-');
// expired googlevideo link -> resolves again once and recovers
const before = playerCalls; expireNext = true;
r = await call(`/stream?v=${ID}&fmt=opus&quality=high&t=${tok()}`, { Range: 'bytes=0-9' }); assert.equal(r.status, 206); assert.ok(playerCalls > before, 're-resolved after 403');
// first client blocked -> falls through to the next client
globalThis.__vrFails = true; const c0 = playerCalls;
j = await (await call(`/resolve?v=nnnnnnnnnnn`, { Authorization: `Bearer ${SECRET}` })).json(); assert.equal(j.client, 'ANDROID'); assert.equal(playerCalls - c0, 2);
assert.equal((await call(`/resolve?v=bad`, { Authorization: `Bearer ${SECRET}` })).status, 400);
assert.equal((await call('/stream?v=x&t=1')).status, 400);
const pre = await worker.fetch(new Request('https://w.test/stream', { method: 'OPTIONS', headers: { Origin: 'https://my.site' } }), env); assert.equal(pre.status, 204);

// ---- ytdl-core is the primary resolver (like `new Ytdl().getInfo(id)`) ----
globalThis.__ytdlFails = false; const Y = 'yyyyyyyyyyy', auth = { Authorization: `Bearer ${SECRET}` };
const p0 = playerCalls;
j = await (await call(`/resolve?v=${Y}`, auth)).json();
assert.equal(j.client, 'ytdl-core:visionos'); assert.equal(j.codec, 'opus'); assert.equal(j.bitrate, 140000); assert.equal(j.title, 'Ytdl Song'); assert.equal(j.uploader, 'Ytdl Artist'); assert.equal(j.duration, 123);
assert.equal(playerCalls, p0, 'direct clients must not be called when ytdl-core works'); assert.deepEqual(globalThis.__ytdlOpts.clients, ['visionos']);
assert.equal((await (await call(`/resolve?v=${Y}&fmt=aac`, auth)).json()).codec, 'aac');
r = await call(`/stream?v=${Y}&fmt=opus&quality=high&t=${tok('opus', 'high', 600, Y)}`, { Range: 'bytes=0-49' });
assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 50); assert.equal(seen.at(-1).url, 'https://gv/y-opus'); assert.ok(seen.at(-1).ua.includes('Safari'));
// ytdl-core fails -> falls back to the direct clients
globalThis.__ytdlFails = true; globalThis.__vrFails = false; const Z = 'zzzzzzzzzzz';
j = await (await call(`/resolve?v=${Z}`, auth)).json(); assert.equal(j.client, 'ANDROID_VR'); assert.equal(j.title, 'Mock Song');
// both fail -> one error that names both reasons
globalThis.__vrFails = true; const realFetch = globalThis.fetch; globalThis.fetch = async (u, i) => (String(u).includes('/player') ? Response.json({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm' } }) : realFetch(u, i));
r = await call(`/resolve?v=qqqqqqqqqqq`, auth); j = await r.json(); assert.equal(r.status, 502); assert.match(j.error, /ytdl-core: .*visitor data.*\| direct: Sign in to confirm/);
globalThis.fetch = realFetch;
console.log('worker tests passed');
