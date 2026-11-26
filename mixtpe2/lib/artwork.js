// Known record labels and distribution channels that are NOT artist names
const LABELS = /\b(t-series|tseries|sony music|zee music|yrf|tips official|speed records|saregama|eros now|geet mp3|white hill music|aditya music|lahari music|anand audio|muzik247|satyam audios|think music|times music|universal music|warner music|def jam|interscope|atlantic records|columbia records|vevo|official|records|entertainment|channel|music)\b/gi;

function cleanSearchArtist(artist) {
  let a = (artist || '').replace(/\s*-\s*topic/gi, '').trim();
  a = a.replace(LABELS, '').trim();
  return a.split(/,|&| feat\.?| ft\.?/i)[0].trim();
}

function cleanSearchTitle(title) {
  let t = (title || '').replace(/[\(\[].*?[\)\]]/g, '');
  t = t.replace(/\b(official|video|audio|lyrical|lyrics|hd|4k|music video|visualizer|remastered|full video|song|video song)\b/gi, '');
  t = t.replace(LABELS, '');
  return t.split('|')[0].replace(/\s+/g, ' ').trim().replace(/^[\s-]+|[\s-]+$/g, '');
}

function isStrongMatch(searchTitle, searchArtist, resultTitle, resultArtist) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sT = norm(searchTitle), rT = norm(resultTitle);
  if (!sT || !rT) return false;
  // Title must match strongly (either identical or containing full key phrase)
  const titleMatch = sT === rT || sT.includes(rT) || rT.includes(sT);
  if (!titleMatch) return false;

  // If search artist is available, verify it
  const sA = norm(searchArtist), rA = norm(resultArtist);
  if (sA && rA) {
    const artistMatch = sA === rA || sA.includes(rA) || rA.includes(sA);
    if (!artistMatch) return false;
  }
  return true;
}

export async function getHQArtwork(title, artist = '', defaultThumb = '') {
  // 1. If defaultThumb is directly upgradeable (YouTube Music / Google User Content),
  // upgrade it directly to 1200x1200px lossless studio artwork - 100% accurate, no mismatches possible!
  if (defaultThumb) {
    if (defaultThumb.includes('googleusercontent.com') || defaultThumb.includes('ggpht.com')) {
      return defaultThumb.replace(/=w\d+-h\d+[^=]*$/, '=w1200-h1200-l90-rj');
    }
  }

  const cleanTitle = cleanSearchTitle(title);
  const cleanArtist = cleanSearchArtist(artist);

  // 2. If we have a clean title, try searching iTunes with STRICT verification
  if (cleanTitle) {
    try {
      const q = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=5`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3500)
      });
      if (r.ok) {
        const d = await r.json();
        const results = d.results || [];
        // Strictly find a result that matches both title and artist
        const match = results.find(item => isStrongMatch(cleanTitle, cleanArtist, item.trackName, item.artistName));
        if (match && match.artworkUrl100) {
          return match.artworkUrl100.replace(/100x100bb/, '1200x1200bb');
        }
      }
    } catch (e) {}

    // 3. Deezer with strict match
    try {
      const q = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
      const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3500)
      });
      if (r.ok) {
        const d = await r.json();
        const results = d.data || [];
        const match = results.find(item => isStrongMatch(cleanTitle, cleanArtist, item.title, item.artist?.name));
        if (match) {
          const cover = match.album?.cover_xl || match.album?.cover_big;
          if (cover) return cover;
        }
      }
    } catch (e) {}
  }

  // 4. Fallback to upgraded YouTube thumbnail
  if (defaultThumb) {
    if (defaultThumb.includes('i.ytimg.com/vi/')) {
      return defaultThumb.replace(/\/(default|hqdefault|mqdefault|sddefault)\.jpg/, '/maxresdefault.jpg');
    }
    return defaultThumb;
  }

  return defaultThumb || '';
}
