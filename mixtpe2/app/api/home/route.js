import { NextResponse } from 'next/server';
import { searchSongs, radio } from '../../../lib/ytm.js';

export const runtime = 'nodejs';
export const maxDuration = 20;

const ok = (t) => !t.duration || (t.duration >= 45 && t.duration <= 720);
const firstArtist = (s) => String(s || '').split(/,|&| feat\.?| ft\.?| x /i)[0].trim();

function moment(h) {
  if (h >= 5 && h < 11) return { sub: 'Start your day', title: 'Morning boost', q: 'morning feel good songs' };
  if (h >= 11 && h < 17) return { sub: 'Keep the momentum', title: 'Daytime energy', q: 'upbeat focus songs' };
  if (h >= 17 && h < 22) return { sub: 'Wind down', title: 'Evening chill', q: 'evening chill songs' };
  return { sub: 'Late night', title: 'After hours', q: 'late night lofi songs' };
}

function dedupe(arr, limit = 18) {
  const seen = new Set();
  const out = [];
  for (const t of arr) {
    if (!t?.id || seen.has(t.id) || !ok(t)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const gl = /^[a-z]{2}$/i.test(sp.get('gl') || '') ? sp.get('gl').toUpperCase() : 'US';
  const hour = Math.min(23, Math.max(0, parseInt(sp.get('h') || '12', 10) || 12));
  const seeds = (sp.get('seeds') || '').split(',').filter((v) => /^[\w-]{11}$/.test(v)).slice(0, 3);
  const favArtists = (sp.get('artists') || '').split('|').map((s) => s.trim()).filter((s) => s && s.length < 60).slice(0, 4);
  const region = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(gl); } catch { return ''; } })();
  const mo = moment(hour), year = new Date().getFullYear();
  const opt = { gl, limit: 14 };

  try {
    const [seedRadios, artistSets, trending, mood, fresh, hits, chill, focus] = await Promise.all([
      Promise.all(seeds.map((id) => radio(id, { gl, limit: 16 }))),
      Promise.all(favArtists.map((a) => searchSongs(a, opt))),
      searchSongs('trending songs', opt),
      searchSongs(mo.q, opt),
      searchSongs('new songs this week', opt),
      searchSongs(`top hits ${year}`, opt),
      searchSongs('chill vibes songs', opt),
      searchSongs('deep focus instrumental lo-fi', opt),
    ]);

    const seen = new Set();
    const take = (arr, n = 14, min = 4) => {
      const out = [];
      for (const t of arr) { if (!t?.id || seen.has(t.id) || !ok(t)) continue; out.push(t); if (out.length >= n) break; }
      if (out.length < min) return [];
      out.forEach((t) => seen.add(t.id));
      return out;
    };

    const shelves = [];
    const add = (kind, title, subtitle, tracks) => { if (tracks.length) shelves.push({ kind, title, subtitle, tracks }); };

    const quickSrc = seedRadios[0]?.length ? seedRadios[0].slice(1) : trending;
    add('list', 'Quick picks', seeds.length ? 'Tailored to your taste' : 'Start radio from a song', take(quickSrc, 12, 4));

    const curatedPlaylists = [];
    const pushPl = (id, name, subtitle, pool) => {
      const tracks = dedupe(pool, 20);
      if (tracks.length >= 4) {
        curatedPlaylists.push({ id, name, subtitle, thumbnail: tracks[0].thumbnail || '', tracks });
      }
    };

    if (seedRadios.some((r) => r.length > 2) || artistSets.some((a) => a.length > 2)) {
      const mix1Pool = [
        ...seedRadios.flatMap((r) => r.slice(1, 7)),
        ...artistSets.flatMap((a) => a.slice(0, 5)),
      ];
      const mix1Sub = favArtists.length ? `${favArtists.slice(0, 3).join(', ')} and more` : 'Based on your recent listens';
      pushPl('mix_daily', 'Daily Mix 1', mix1Sub, mix1Pool);
    }

    if (favArtists.length >= 1 && artistSets[0]?.length) {
      pushPl('mix_artist_radio', `${favArtists[0]} Radio`, 'Top tracks & similar vibes', [
        ...artistSets[0].slice(0, 10),
        ...(seedRadios[0] ? seedRadios[0].slice(1, 8) : []),
      ]);
    }

    pushPl('mix_moment', mo.title, `${mo.sub} • Personalized mix`, [...mood, ...chill.slice(0, 6)]);
    pushPl('mix_fresh', 'Fresh Finds', `New releases • ${year}`, fresh);
    pushPl('mix_hits', region ? `${region} Top Hits` : `Top Hits ${year}`, 'Most played right now', [...hits, ...trending.slice(0, 6)]);
    pushPl('mix_focus', 'Focus & Flow', 'Deep work & late-night sessions', [...focus, ...chill.slice(0, 6)]);

    if (curatedPlaylists.length) {
      shelves.push({
        kind: 'playlists',
        title: seeds.length || favArtists.length ? 'Made for you' : 'Featured playlists',
        subtitle: seeds.length || favArtists.length ? 'Personalized mixes' : 'Curated playlists',
        tracks: curatedPlaylists,
      });
    }

    seedRadios.forEach((r, i) => {
      if (i === 0 && r.length < 2) return;
      const seed = r[0];
      if (seed) add('cards', seed.title, i === 0 ? 'Because you listened to' : 'More like', take(r.slice(1), 14));
    });

    add('cards', mo.title, mo.sub, take(mood));
    favArtists.slice(0, 2).forEach((a, i) => add('cards', a, 'More from your top artist', take(artistSets[i] || [])));
    add('cards', region ? `Trending in ${region}` : 'Trending now', 'Charts', take(trending));
    add('cards', 'New releases', 'Fresh this week', take(fresh));
    add('cards', `Top hits ${year}`, 'Everyone is playing', take(hits));
    add('cards', 'Chill', 'Slow it down', take(chill));

    const counts = new Map();
    favArtists.forEach((name, idx) => {
      const thumb = artistSets[idx]?.[0]?.thumbnail || '';
      if (thumb) counts.set(name.toLowerCase(), { name, thumbnail: thumb, n: 100 - idx });
    });
    for (const s of shelves) {
      if (s.kind === 'playlists') continue;
      for (const t of s.tracks) {
        const name = firstArtist(t.uploader);
        if (!name || /various/i.test(name)) continue;
        const key = name.toLowerCase();
        const e = counts.get(key) || { name, thumbnail: t.thumbnail, n: 0 };
        e.n++;
        if (!e.thumbnail && t.thumbnail) e.thumbnail = t.thumbnail;
        counts.set(key, e);
      }
    }
    const artists = [...counts.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 14)
      .map(({ name, thumbnail }) => ({ name, thumbnail }));

    if (artists.length >= 4) {
      shelves.splice(Math.min(2, shelves.length), 0, {
        kind: 'artists',
        title: favArtists.length ? 'Your favorite artists' : 'Artists for you',
        subtitle: 'Tap to explore tracks',
        tracks: artists,
      });
    }

    return NextResponse.json(
      { sections: shelves },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to load home feed.', sections: [] }, { status: 500 });
  }
}
