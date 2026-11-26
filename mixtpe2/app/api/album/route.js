import { NextResponse } from 'next/server';
import { getAlbum, searchAlbums, searchSongs } from '../../../lib/ytm.js';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const id = (sp.get('id') || '').trim();
  const title = (sp.get('title') || '').trim();
  const artist = (sp.get('artist') || '').trim();
  const gl = /^[a-z]{2}$/i.test(sp.get('gl') || '') ? sp.get('gl').toUpperCase() : 'US';

  if (!id && !title) {
    return NextResponse.json({ error: 'Missing album id or title.' }, { status: 400 });
  }

  try {
    let album = null;
    if (id) {
      album = await getAlbum(id, { gl });
    }
    if ((!album || !album.tracks?.length) && title) {
      const found = await searchAlbums(`${title} ${artist}`.trim(), { limit: 3, gl });
      if (found[0]?.browseId) {
        album = await getAlbum(found[0].browseId, { gl });
        if (album) {
          if (!album.title || album.title === 'Album') album.title = found[0].title;
          if (!album.artist || album.artist === 'Various Artists') album.artist = found[0].artist;
          if (!album.thumbnail) album.thumbnail = found[0].thumbnail;
          if (!album.year) album.year = found[0].year;
        }
      }
    }
    if (!album || !album.tracks?.length) {
      const q = `${title} ${artist} full album`.trim() || id;
      const tracks = await searchSongs(q, { limit: 16, gl });
      if (!tracks.length) {
        return NextResponse.json({ error: 'Album tracks unavailable.' }, { status: 404 });
      }
      album = {
        id: id || `alb_${Date.now().toString(36)}`,
        title: title || 'Album',
        artist: artist || tracks[0]?.uploader || 'Various Artists',
        year: '',
        thumbnail: tracks[0]?.thumbnail || '',
        tracks,
      };
    }

    return NextResponse.json(album, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load album.' }, { status: 500 });
  }
}
