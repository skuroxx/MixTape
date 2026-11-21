// Usage:
//   node scripts/test-stream.mjs "Get Lucky Daft Punk"              # via your Worker (STREAM_WORKER_URL / STREAM_SECRET env)
//   node scripts/test-stream.mjs dQw4w9WgXcQ --local                # same flow, resolving with @distube/ytdl-core (local machine only)
// Step 1  search -> videoId   (YouTube Music search via the Worker; replaces the python ytmusicapi call)
// Step 2  resolve -> audio    (Worker /resolve, or --local: new Ytdl().getInfo like your original snippet)
// Step 3  fetch the first KB of the stream and check it really is audio
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';

const args = process.argv.slice(2), query = args.find((a) => !a.startsWith('--')) || 'Get Lucky Daft Punk';
const local = args.includes('--local');
const base = (process.env.STREAM_WORKER_URL || '').replace(/\/$/, ''), secret = process.env.STREAM_SECRET || '';
const auth = secret ? { Authorization: `Bearer ${secret}` } : {};
if (!base) { console.error('Set STREAM_WORKER_URL (https://mixtape-stream.<you>.workers.dev) first.'); process.exit(1); }

try {
  let id = /^[\w-]{11}$/.test(query) ? query : '';
  if (!id) {
    console.log('Searching for:', query);
    const r = await fetch(`${base}/search?q=${encodeURIComponent(query)}`, { headers: auth });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || `search ${r.status}`);
    id = d.tracks?.[0]?.id; if (!id) throw new Error('no results');
    console.log('Found videoId:', id, '-', d.tracks[0].title, '/', d.tracks[0].uploader);
  }
  if (local) {
    const { Ytdl } = createRequire(import.meta.url)('@distube/ytdl-core');
    const info = await new Ytdl().getInfo(id);
    console.log('Title:', info.videoDetails.title);
    const audio = info.formats.find((f) => f.hasAudio && !f.hasVideo && /opus/.test(f.mimeType || '')) || info.formats.find((f) => f.mimeType?.includes('audio'));
    console.log(audio ? `Audio URL: ${audio.url.slice(0, 90)}...` : `No audio format found. Formats: ${info.formats.length}`);
  } else {
    const r = await fetch(`${base}/resolve?v=${id}&fmt=opus`, { headers: auth });
    const w = await r.json(); if (!r.ok) throw new Error(w.error || `resolve ${r.status}`);
    console.log(`Title: ${w.title}\nCodec: ${w.codec} @ ${Math.round(w.bitrate / 1000)} kbps via ${w.client}`);
    const exp = Math.floor(Date.now() / 1000) + 600;
    const t = secret ? `&t=${exp}.${createHmac('sha256', secret).update(`${id}.opus.high.${exp}`).digest('hex')}` : '';
    const s = await fetch(`${base}/stream?v=${id}&fmt=opus&quality=high${t}`, { headers: { Range: 'bytes=0-4095' } });
    const buf = new Uint8Array(await s.arrayBuffer());
    console.log(`Stream: HTTP ${s.status}, ${s.headers.get('content-type')}, got ${buf.length} bytes, range ${s.headers.get('content-range')}`);
    if (!/^audio\//.test(s.headers.get('content-type') || '') || !buf.length) throw new Error('stream did not return audio');
  }
  console.log('OK');
} catch (err) { console.error('Failed:', err.message); process.exit(1); }
