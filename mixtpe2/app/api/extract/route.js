import { NextResponse } from 'next/server';
import { getYtdl, extractVideoId } from '../../../lib/ytdl';
import { getHQArtwork } from '../../../lib/artwork';
import { signStream } from '../../../lib/streamToken.js';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ error: "Missing query parameter 'q'." }, { status: 400 });

  try {
    const yt = getYtdl();
    const videoId = extractVideoId(q);

    if (!videoId) {
      return NextResponse.json({ error: 'Could not extract video ID from query.' }, { status: 400 });
    }

    const fmt = (searchParams.get('fmt') || 'opus').toLowerCase();
    const quality = ['low', 'medium', 'high'].includes(searchParams.get('quality')) ? searchParams.get('quality') : 'high';

    // Preferred path: Cloudflare Worker resolves AND proxies the audio, so the URL isn't tied to Vercel's IP.
    const worker = (process.env.STREAM_WORKER_URL || '').replace(/\/$/, '');
    if (worker) {
      try {
        const secret = process.env.STREAM_SECRET || '';
        const r = await fetch(`${worker}/resolve?v=${videoId}&fmt=${fmt === 'aac' ? 'aac' : 'opus'}&quality=${quality}`, {
          headers: secret ? { Authorization: `Bearer ${secret}` } : {},
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) {
          const w = await r.json();
          const wfmt = fmt === 'aac' ? 'aac' : 'opus';
          const token = secret ? `&t=${await signStream(secret, videoId, wfmt, quality)}` : '';
          const thumbnail = await getHQArtwork(w.title, w.uploader, w.thumbnail || '');
          return NextResponse.json({
            id: videoId, title: w.title, uploader: w.uploader, duration: w.duration, thumbnail,
            audioUrl: `${worker}/stream?v=${videoId}&fmt=${wfmt}&quality=${quality}${token}`,
            codec: w.codec === 'opus' ? 'opus' : 'mp4a.40.2', bitrate: w.bitrate, via: 'worker',
            webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
          });
        }
        console.warn('Stream worker said', r.status, '- falling back to local extraction');
      } catch (e) { console.warn('Stream worker failed:', e.message, '- falling back to local extraction'); }
    }

    const info = await yt.getInfo(videoId);
    const details = info.videoDetails;

    // Filter audio formats
    const audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo);

    // If opus is requested, find the highest bitrate Opus stream (itag 251 at ~160kbps)
    let best = null;
    if (fmt === 'opus') {
      const opusFormats = audioFormats
        .filter(f => f.mimeType?.includes('opus') || f.codecs?.includes('opus'))
        .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      best = opusFormats[0];
    } else if (fmt === 'aac') {
      const aacFormats = audioFormats
        .filter(f => f.mimeType?.includes('mp4') || f.codecs?.includes('mp4a'))
        .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      best = aacFormats[0];
    }

    if (!best) {
      best = audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0]
        || info.formats.find(f => f.hasAudio);
    }

    if (!best || !best.url) {
      return NextResponse.json({ error: 'No audio stream found for this video.' }, { status: 404 });
    }

    const thumbs = details.thumbnails || [];
    const rawThumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : '';
    const title = details.title || 'Unknown Track';
    const uploader = (details.author?.name || details.ownerChannelName || '').replace(/ - Topic$/, '');

    // Resolve high-resolution 1200x1200px artwork from Apple Music / iTunes
    const thumbnail = await getHQArtwork(title, uploader, rawThumbnail);

    return NextResponse.json({
      id: videoId,
      title,
      uploader,
      duration: parseInt(details.lengthSeconds || '0'),
      thumbnail,
      audioUrl: best.url,
      codec: (best.codecs || best.mimeType || 'audio').split(';')[0],
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  } catch (err) {
    console.error('Extract error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
