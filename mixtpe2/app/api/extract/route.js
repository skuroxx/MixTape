import { NextResponse } from 'next/server';
import { getYtdl, extractVideoId } from '../../../lib/ytdl';
import { getHQArtwork } from '../../../lib/artwork';

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

    const info = await yt.getInfo(videoId);
    const details = info.videoDetails;

    const fmt = (searchParams.get('fmt') || 'opus').toLowerCase();

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
