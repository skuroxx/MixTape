import { NextResponse } from 'next/server';
import { searchSongs, radio } from '../../../lib/ytm.js';

export const runtime = 'nodejs';
export const maxDuration = 20;

const ok = (t) => !t.duration || (t.duration >= 45 && t.duration <= 720); // songs, not mixes / podcasts / live streams
const firstArtist = (s) => String(s || '').split(/,|&| feat\.?| ft\.?| x /i)[0].trim();

function moment(h) {
  if (h >= 5 && h < 11) return { sub: 'Start your day', title: 'Morning boost', q: 'morning feel good songs' };
  if (h >= 11 && h < 17) return { sub: 'Keep the momentum', title: 'Daytime energy', q: 'upbeat focus songs' };
  if (h >= 17 && h < 22) return { sub: 'Wind down', title: 'Evening chill', q: 'evening chill songs' };
  return { sub: 'Late night', title: 'After hours', q: 'late night lofi songs' };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const gl = /^[a-z]{2}$/i.test(sp.get('gl') || '') ? sp.get('gl').toUpperCase() : 'US';
  const hour = Math.min(23, Math.max(0, parseInt(sp.get('h') || '12', 10) || 12));
  const seeds = (sp.get('seeds') || '').split(',').filter((v) => /^[\w-]{11}$/.test(v)).slice(0, 3);
  const favArtists = (sp.get('artists') || '').split('|').map((s) => s.trim()).filter((s) => s && s.length < 60).slice(0, 2);
  const region = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(gl); } catch { return ''; } })();
  const mo = moment(hour), year = new Date().getFullYear();
  const opt = { gl, limit: 14 };

  try {
    const [seedRadios, artistSets, trending, mood, fresh, hits, chill] = await Promise.all([
      Promise.all(seeds.map((id) => radio(id, { gl, limit: 14 }))),
      Promise.all(favArtists.map((a) => searchSongs(a, opt))),
      searchSongs('trending songs', opt),
      searchSongs(mo.q, opt),
      searchSongs('new songs this week', opt),
      searchSongs(`top hits ${year}`, opt),
      searchSongs('chill vibes songs', opt),
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

    // Quick picks: a seed song's radio if we know the listener's taste, else what's trending
    const quickSrc = seedRadios[0]?.length ? seedRadios[0].slice(1) : trending;
    add('list', 'Quick picks', 'Start radio from a song', take(quickSrc, 12, 4));

    seedRadios.forEach((r, i) => {
      if (i === 0 && r.length < 2) return;
      const seed = r[0];
      if (seed) add('cards', seed.title, i === 0 ? 'Because you listened to' : 'More like', take(r.slice(1), 14));
    });

    add('cards', mo.title, mo.sub, take(mood));
    favArtists.forEach((a, i) => add('cards', a, 'More from', take(artistSets[i])));
    add('cards', region ? `Trending in ${region}` : 'Trending now', 'Charts', take(trending));
    add('cards', 'New releases', 'Fresh this week', take(fresh));
    add('cards', `Top hits ${year}`, 'Everyone is playing', take(hits));
    add('cards', 'Chill', 'Slow it down', take(chill));

    // Artists row (circular covers), built from whoever shows up most across the shelves
    const counts = new Map();
    for (const s of shelves) for (const t of s.tracks) {
      const name = firstArtist(t.uploader); if (!name || /various/i.test(name)) continue;
      const e = counts.get(name) || { name, thumbnail: t.thumbnail, n: 0 }; e.n++; counts.set(name, e);
    }
    const artists = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 12).map(({ name, thumbnail }) => ({ name, thumbnail }));
    if (artists.length >= 5) shelves.splice(Math.min(3, shelves.length), 0, { kind: 'artists', title: 'Artists for you', subtitle: 'Popular right now', tracks: artists });

    return NextResponse.json({ sections: shelves }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load home feed.', sections: [] }, { status: 500 });
  }
}
