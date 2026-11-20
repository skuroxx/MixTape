const UA = 'Mozilla/5.0 (MixTape/1.0; AppleMusicDuet/2.0)';

function cleanTitle(title) {
  let t = (title || '').replace(/[\(\[].*?[\)\]]/g, '');
  t = t.replace(/\b(official|video|audio|lyrical|lyrics|hd|4k|music video|visualizer|remastered)\b/gi, '');
  return t.split('|')[0].replace(/\s+/g, ' ').trim().replace(/^[\s-]+|[\s-]+$/g, '');
}

function cleanArtist(artist) {
  return (artist || '').replace(/\s*-\s*topic|vevo/gi, '').trim();
}

function parseTimestamp(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  val = String(val).trim();
  if (val.endsWith('ms')) return parseFloat(val) / 1000;
  if (val.endsWith('s')) val = val.slice(0, -1);
  const parts = val.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(val) || 0;
}

function parseLrc(text) {
  if (!text) return [];
  // Parse [offset: +/- ms] header (positive delays lyrics, negative advances them)
  const offM = text.match(/\[offset:\s*([+-]?\d+)\]/i);
  const lrcOffset = offM ? parseInt(offM[1], 10) / 1000 : 0;

  const LRC = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  const lines = [];

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Skip metadata tags
    if (/^\[(ti|ar|al|by|hash|offset|id|re|ve|length):/i.test(trimmed)) continue;

    let m;
    const stamps = [];
    while ((m = LRC.exec(raw)) !== null) {
      stamps.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
    }
    LRC.lastIndex = 0;
    if (!stamps.length) continue;

    let body = raw.replace(LRC, '').trim();
    if (!body) continue;

    // Filter non-lyric intro credit lines at start (e.g. [00:00.00]Composer: ...)
    if (stamps[0] < 0.6 && /^(written|composed|lyrics|arranger|produced|作词|作曲|编曲|制作|演唱)\s*[:：]/i.test(body)) {
      continue;
    }

    // Check for word-level sync tags e.g. <00:12.34>word or <12.34>word
    const words = [];
    const wordRegex = /<(\d+(?::\d+)?(?:\.\d+)?)>([^<]+)/g;
    let wm;
    while ((wm = wordRegex.exec(body)) !== null) {
      const wt = parseTimestamp(wm[1]) + lrcOffset;
      const wtxt = wm[2].trim();
      if (wtxt) {
        words.push({ t: Math.round(wt * 1000) / 1000, text: wtxt, sp: true });
      }
    }
    wordRegex.lastIndex = 0;

    if (words.length) {
      body = body.replace(/<[^>]+>/g, '').trim();
      for (let k = 0; k < words.length; k++) {
        const nextW = words[k + 1];
        words[k].e = nextW ? Math.max(words[k].t + 0.08, nextW.t) : words[k].t + 0.4;
      }
    }

    for (const s of stamps) {
      const t = Math.round((s + lrcOffset) * 1000) / 1000;
      lines.push({
        t: Math.max(0, t),
        text: body,
        words: words.length ? words : undefined
      });
    }
  }

  lines.sort((a, b) => a.t - b.t);

  // Compute end time 'e' for each line so line boundaries and scrolling are locked on beat
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const nxt = lines[i + 1];
    if (nxt) {
      cur.e = Math.max(cur.t + 0.5, Math.min(nxt.t, cur.t + 8.0));
    } else {
      cur.e = cur.t + 4.5;
    }
  }

  return lines;
}

// 1. BetterLyrics (Apple Music style syllable timing from community API)
async function pBetterLyrics(ctx) {
  for (const path of ['/getLyrics', '/ttml/getLyrics']) {
    try {
      const url = `https://lyrics-api.boidu.dev${path}?s=${encodeURIComponent(ctx.title)}&a=${encodeURIComponent(ctx.artist)}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const text = await res.text();
      let ttml = text;
      try {
        const j = JSON.parse(text);
        ttml = j.ttml || j.lyrics || '';
      } catch (e) {}

      if (ttml && ttml.trim().startsWith('<')) {
        const lines = parseTtml(ttml);
        if (lines && lines.length) {
          return { synced: lines, plain: '', kind: 'word', isDuet: lines.some(l => l.agent === 1) };
        }
      }
    } catch (e) {}
  }
  return null;
}

// Helper to parse Apple Music TTML with millisecond-exact syllable timing & duets
function parseTtml(xml) {
  if (!xml) return [];
  const lines = [];
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let pMatch;
  let agents = [];

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const attrs = pMatch[1];
    const body = pMatch[2];

    const beginMatch = attrs.match(/begin="([^"]+)"/i);
    const endMatch = attrs.match(/end="([^"]+)"/i);
    const durMatch = attrs.match(/dur="([^"]+)"/i);
    const agentMatch = attrs.match(/agent="([^"]+)"/i);
    const agentName = agentMatch ? agentMatch[1] : 'v1';
    if (!agents.includes(agentName)) agents.push(agentName);
    const agent = agents.length > 1 ? (agentName === agents[0] ? 0 : 1) : 0;

    const lineStart = beginMatch ? parseTimestamp(beginMatch[1]) : 0;
    const lineEnd = endMatch ? parseTimestamp(endMatch[1]) : (durMatch ? lineStart + parseTimestamp(durMatch[1]) : 0);

    const words = [];
    const bgWords = [];
    const spanRegex = /<span\b([^>]*)>([\s\S]*?)<\/span>([\s\S]*?)(?=<span|$)/gi;
    let sMatch;
    while ((sMatch = spanRegex.exec(body)) !== null) {
      const sAttrs = sMatch[1];
      const sRaw = sMatch[2];
      const sTail = sMatch[3] || '';
      const sText = sRaw.replace(/<[^>]+>/g, '').trim();
      if (!sText) continue;

      const sBegin = sAttrs.match(/begin="([^"]+)"/i);
      const sEnd = sAttrs.match(/end="([^"]+)"/i);
      const sDur = sAttrs.match(/dur="([^"]+)"/i);

      let st = sBegin ? parseTimestamp(sBegin[1]) : lineStart;
      let en = sEnd ? parseTimestamp(sEnd[1]) : (sDur ? st + parseTimestamp(sDur[1]) : st + 0.35);
      if (en <= st) en = st + 0.25;

      const hasTrailingSpace = /\s$/.test(sRaw) || /\s/.test(sTail);
      const isBg = /role="x-bg"|agent="v2"|type="background"/i.test(sAttrs) || (sText.startsWith('(') && sText.endsWith(')'));
      const target = isBg ? bgWords : words;

      target.push({
        t: Math.round(st * 1000) / 1000,
        e: Math.round(en * 1000) / 1000,
        text: isBg ? sText.replace(/^\(|\)$/g, '') : sText,
        sp: hasTrailingSpace
      });
    }

    // Safety fallback: if all words in a line lack spaces (common TTML bug where spaces outside tags were lost),
    // restore spaces between distinct words for non-CJK lines
    const anyWordSp = words.some(w => w.sp);
    if (!anyWordSp && words.length > 1) {
      words.forEach((w, idx) => {
        if (idx < words.length - 1 && !w.text.endsWith('-')) {
          w.sp = true;
        }
      });
    }
    const anyBgSp = bgWords.some(w => w.sp);
    if (!anyBgSp && bgWords.length > 1) {
      bgWords.forEach((w, idx) => {
        if (idx < bgWords.length - 1 && !w.text.endsWith('-')) {
          w.sp = true;
        }
      });
    }

    let plainText = body.replace(/<[^>]+>/g, '').trim();
    if (words.length && (!plainText || !plainText.includes(' '))) {
      plainText = words.map((w, idx) => w.text + (w.sp && idx < words.length - 1 ? ' ' : '')).join('');
    }
    if (words.length || bgWords.length || plainText) {
      const lt = words.length ? words[0].t : (bgWords.length ? bgWords[0].t : lineStart);
      const computedEnd = lineEnd || Math.max(
        words.length ? words[words.length - 1].e : 0,
        bgWords.length ? bgWords[bgWords.length - 1].e : 0,
        lt + 2.5
      );

      const lineObj = {
        t: Math.round(lt * 1000) / 1000,
        e: Math.round(computedEnd * 1000) / 1000,
        text: plainText,
        agent,
        words: words.length ? words : undefined
      };
      if (bgWords.length) {
        lineObj.bg = [{ words: bgWords }];
      }
      lines.push(lineObj);
    }
  }

  lines.sort((a, b) => a.t - b.t);

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const nxt = lines[i + 1];
    if (nxt && (!cur.e || cur.e > nxt.t)) {
      cur.e = Math.max(cur.t + 0.3, nxt.t);
    }
  }

  return lines;
}

// 2. LyricsPlus (Apple Music, Spotify, Musixmatch Word & Syllable Sync with Duets)
async function pLyricsPlus(ctx) {
  const bases = [
    'https://lyricsplus.prjktla.my.id',
    'https://lyrics.alextam.dev'
  ];

  for (const base of bases) {
    try {
      const url = `${base}/v2/lyrics/get?title=${encodeURIComponent(ctx.title)}&artist=${encodeURIComponent(ctx.artist)}&source=apple,lyricsplus,spotify,musixmatch-word`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;

      const j = await res.json();
      const raw = j.lyrics || [];
      if (!raw.length) continue;

      const singers = [];
      for (const l of raw) {
        const s = l.element?.singer || 'v1';
        if (!singers.includes(s)) singers.push(s);
      }
      const isDuet = singers.length > 1;

      const lines = [];
      for (const l of raw) {
        const lt = (l.time || 0) / 1000;
        const sy = l.syllabus || [];
        const singer = l.element?.singer || 'v1';
        const agent = isDuet ? (singer === singers[0] ? 0 : 1) : 0;
        const mainWords = [];
        const bgWords = [];

        for (let k = 0; k < sy.length; k++) {
          const s = sy[k];
          const st = (s.time || 0) / 1000;
          const dur = (s.duration || 300) / 1000;
          const en = Math.max(st + dur, st + 0.08);
          const rawText = s.text || '';
          const text = rawText.trim();
          if (!text) continue;

          const isPart = !!(s.part || s.isPartOfWord || rawText.endsWith('-'));
          const hasTrailingSpace = /\s$/.test(rawText) || (k < sy.length - 1 && /^\s/.test(sy[k + 1].text || ''));
          const isBg = s.isBackground || (text.startsWith('(') && text.endsWith(')'));
          const target = isBg ? bgWords : mainWords;

          target.push({
            t: Math.round(st * 1000) / 1000,
            e: Math.round(en * 1000) / 1000,
            text: isBg ? text.replace(/^\(|\)$/g, '') : text,
            sp: hasTrailingSpace,
            part: isPart
          });
        }

        const anyMainSp = mainWords.some(w => w.sp);
        if (!anyMainSp && mainWords.length > 1) {
          mainWords.forEach((w, idx) => {
            if (idx < mainWords.length - 1 && !w.part && !w.text.endsWith('-')) {
              w.sp = true;
            }
          });
        }
        const anyBgLSp = bgWords.some(w => w.sp);
        if (!anyBgLSp && bgWords.length > 1) {
          bgWords.forEach((w, idx) => {
            if (idx < bgWords.length - 1 && !w.part && !w.text.endsWith('-')) {
              w.sp = true;
            }
          });
        }

        let lineText = (l.text || '').trim();
        if (!lineText && mainWords.length) {
          lineText = mainWords.map((w, idx) => w.text + (w.sp && idx < mainWords.length - 1 ? ' ' : '')).join('');
        }

        const lineObj = {
          t: Math.round(lt * 1000) / 1000,
          text: lineText,
          agent,
          words: mainWords.length ? mainWords : undefined
        };
        if (bgWords.length) {
          lineObj.bg = [{ words: bgWords }];
        }
        lines.push(lineObj);
      }

      if (lines.length) {
        return {
          synced: lines.sort((a, b) => a.t - b.t),
          plain: '',
          kind: 'word',
          isDuet
        };
      }
    } catch (e) {}
  }
  return null;
}

// 3. Apple Music via Paxsenix
async function pPaxsenix(ctx) {
  try {
    const sr = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${ctx.title} ${ctx.artist}`.trim())}&entity=song&limit=6`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!sr.ok) return null;
    const sd = await sr.json();
    const songs = sd.results || [];
    let best = songs[0];
    if (ctx.dur && songs.length > 1) {
      best = songs.reduce((a, b) =>
        Math.abs((a.trackTimeMillis || 0) / 1000 - ctx.dur) < Math.abs((b.trackTimeMillis || 0) / 1000 - ctx.dur) ? a : b
      );
    }
    if (!best) return null;

    const lr = await fetch(`https://lyrics.paxsenix.org/apple-music/lyrics?id=${best.trackId}`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
    });
    if (!lr.ok) return null;
    const j = await lr.json();
    const content = (j && j.content) || [];
    const lines = [];

    for (const l of content) {
      const lt = (l.timestamp || 0) / 1000;
      const tx = l.text;
      const agent = l.oppositeTurn ? 1 : 0;

      if (typeof tx === 'string' && tx.trim()) {
        lines.push({ t: Math.round(lt * 1000) / 1000, text: tx.trim(), agent });
      } else if (Array.isArray(tx)) {
        const words = [];
        for (let k = 0; k < tx.length; k++) {
          const w = tx[k];
          const st = (w.timestamp != null ? w.timestamp : l.timestamp || 0) / 1000;
          let en = (w.endtime != null ? w.endtime : l.endtime || 0) / 1000;
          if (en <= st) {
            if (k < tx.length - 1 && tx[k + 1].timestamp != null) {
              en = tx[k + 1].timestamp / 1000;
            } else {
              en = st + 0.35;
            }
          }
          const wtxt = (w.text || '').trim();
          if (!wtxt) continue;

          const isPartOfWord = !!w.part || (w.text && w.text.endsWith('-'));
          if (isPartOfWord && words.length) {
            words[words.length - 1].sp = false;
          }

          words.push({
            t: Math.round(st * 1000) / 1000,
            e: Math.round(en * 1000) / 1000,
            text: wtxt,
            sp: !isPartOfWord
          });
        }
        if (words.length) {
          const computedEnd = (l.endtime ? l.endtime / 1000 : 0) || words[words.length - 1].e;
          const anySp = words.some(w => w.sp);
          if (!anySp && words.length > 1) {
            words.forEach((w, idx) => {
              if (idx < words.length - 1 && !w.text.endsWith('-')) w.sp = true;
            });
          }
          lines.push({
            t: Math.round(lt * 1000) / 1000,
            e: Math.round(computedEnd * 1000) / 1000,
            text: words.map((w, idx) => w.text + (w.sp && idx < words.length - 1 ? ' ' : '')).join(''),
            agent,
            words
          });
        }
      }
    }

    if (lines.length) {
      const hasWords = lines.some(l => l.words);
      const isDuet = lines.some(l => l.agent === 1);
      return {
        synced: lines.sort((a, b) => a.t - b.t),
        plain: '',
        kind: hasWords ? 'word' : 'line',
        isDuet
      };
    }
  } catch (e) {}
  return null;
}

// 4. NetEase Cloud Music
async function pNetEase(ctx) {
  try {
    const sRes = await fetch(`https://music.163.com/api/search/get/web?s=${encodeURIComponent(`${ctx.title} ${ctx.artist}`.trim())}&type=1&offset=0&limit=5`, {
      headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/', 'Cookie': 'appver=2.0.2' },
      signal: AbortSignal.timeout(6000)
    });
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const songs = sData.result?.songs || [];
    if (!songs.length) return null;

    const best = songs[0];
    const lRes = await fetch(`https://music.163.com/api/song/lyric?id=${best.id}&lv=-1&kv=-1&tv=-1&yv=-1`, {
      headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' },
      signal: AbortSignal.timeout(6000)
    });
    if (!lRes.ok) return null;
    const lData = await lRes.json();
    const lrc = lData.lrc?.lyric;
    if (lrc) {
      const lines = parseLrc(lrc);
      if (lines.length) return { synced: lines, plain: '', kind: 'line' };
    }
  } catch (e) {}
  return null;
}

// 5. LRCLIB (Open database line sync)
async function pLrclib(ctx) {
  for (const q of [`${ctx.title} ${ctx.artist}`.trim(), ctx.title]) {
    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000)
      });
      if (!r.ok) continue;
      const items = await r.json();
      const synced = items.filter(i => i.syncedLyrics);
      if (synced.length) {
        if (ctx.dur) synced.sort((a, b) => Math.abs((a.duration || 0) - ctx.dur) - Math.abs((b.duration || 0) - ctx.dur));
        const parsed = parseLrc(synced[0].syncedLyrics);
        if (parsed.length) return { synced: parsed, plain: '', kind: 'line' };
      }
      for (const i of items) {
        if (i.plainLyrics) return { synced: [], plain: i.plainLyrics, kind: 'plain' };
      }
    } catch (e) {}
  }
  return null;
}

// 6. YouTube Music
async function pYtMusic(ctx) {
  if (!ctx.vid) return null;
  try {
    const nextRes = await fetch('https://music.youtube.com/youtubei/v1/next', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.youtube.com/',
        'Origin': 'https://music.youtube.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
        videoId: ctx.vid
      }),
      signal: AbortSignal.timeout(6000)
    });
    if (!nextRes.ok) return null;
    const nextData = await nextRes.json();
    const tabs = nextData.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
    const lyricsTab = tabs.find(t => t.tabRenderer?.title?.runs?.[0]?.text?.toLowerCase() === 'lyrics' || t.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith('MPLY'));
    const browseId = lyricsTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
    if (!browseId) return null;

    const browseRes = await fetch('https://music.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.youtube.com/',
        'Origin': 'https://music.youtube.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
        browseId
      }),
      signal: AbortSignal.timeout(6000)
    });
    if (!browseRes.ok) return null;
    const browseData = await browseRes.json();
    const section = browseData.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer;
    const desc = section?.description?.runs?.map(r => r.text).join('') || '';
    if (desc) {
      return { synced: [], plain: desc, kind: 'plain' };
    }
  } catch (e) {}
  return null;
}

// 7. SimpMusic
async function pSimpMusic(ctx) {
  if (!ctx.vid) return null;
  try {
    const res = await fetch(`https://api-lyrics.simpmusic.org/v1/${ctx.vid}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const j = await res.json();
    const items = j.data || [];
    if (!items.length) return null;
    const best = items[0];
    if (best.syncedLyrics) {
      const parsed = parseLrc(best.syncedLyrics);
      if (parsed.length) return { synced: parsed, plain: '', kind: 'line' };
    }
    if (best.plainLyric) {
      return { synced: [], plain: best.plainLyric, kind: 'plain' };
    }
  } catch (e) {}
  return null;
}

// 8. KuGou
async function pKuGou(ctx) {
  try {
    const kw = `${ctx.title} ${ctx.artist}`.trim();
    const sRes = await fetch(`https://mobileservice.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(kw)}&page=1&pagesize=5`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000)
    });
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const songs = sData.data?.info || [];
    if (!songs.length) return null;

    const best = songs[0];
    const candRes = await fetch(`https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(kw)}&hash=${best.hash}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000)
    });
    if (!candRes.ok) return null;
    const candData = await candRes.json();
    const cand = candData.candidates || [];
    if (!cand.length) return null;

    const dlRes = await fetch(`https://lyrics.kugou.com/download?ver=1&client=pc&id=${cand[0].id}&accesskey=${cand[0].accesskey}&fmt=lrc&charset=utf8`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000)
    });
    if (!dlRes.ok) return null;
    const dlData = await dlRes.json();
    if (dlData.content) {
      const txt = Buffer.from(dlData.content, 'base64').toString('utf-8').replace(/^\ufeff/, '');
      const parsed = parseLrc(txt);
      if (parsed.length) return { synced: parsed, plain: '', kind: 'line' };
    }
  } catch (e) {}
  return null;
}

// ------------------------------------------------------------------ Complete Source Registry
const SOURCES = [
  { id: 'betterlyrics', name: 'BetterLyrics', kind: 'word', note: 'Apple Music style syllable timing from community API', fn: pBetterLyrics },
  { id: 'lyricsplus', name: 'LyricsPlus', kind: 'word', note: 'Word sync gathered from Apple Music, Spotify and Musixmatch', fn: pLyricsPlus },
  { id: 'paxsenix', name: 'Apple Music (Paxsenix)', kind: 'word', note: 'Apple Music lyrics through the Paxsenix proxy', fn: pPaxsenix },
  { id: 'netease', name: 'NetEase Cloud Music', kind: 'word', note: 'Word sync when available, otherwise line sync', fn: pNetEase },
  { id: 'lrclib', name: 'LRCLIB', kind: 'line', note: 'Open database of line-synced lyrics', fn: pLrclib },
  { id: 'ytmusic', name: 'YouTube Music', kind: 'line', note: 'Lyrics shown in YouTube Music', fn: pYtMusic },
  { id: 'simpmusic', name: 'SimpMusic', kind: 'line', note: 'Community lyrics matched by YouTube video', fn: pSimpMusic },
  { id: 'kugou', name: 'KuGou', kind: 'line', note: 'Large catalogue, strong for Asian music', fn: pKuGou },
];

export function listSources() {
  return SOURCES.map(s => ({ id: s.id, name: s.name, kind: s.kind, note: s.note, available: true }));
}

export async function fetchLyrics(title, artist = '', duration = 0, vid = '', source = 'auto', strict = false, prefer = 'word') {
  const ctx = {
    title: cleanTitle(title),
    artist: cleanArtist(artist).split(/,|&| feat\.?| ft\.?/i)[0].trim(),
    dur: parseFloat(duration || 0),
    vid: vid || ''
  };

  let order = [...SOURCES];
  if (source !== 'auto') {
    const src = SOURCES.find(s => s.id === source);
    if (src) {
      order = strict ? [src] : [src, ...order.filter(s => s.id !== source)];
    }
  }

  // Execute providers in priority order
  for (const s of order) {
    try {
      const res = await s.fn(ctx);
      if (res && res.synced && res.synced.length) {
        return { ...res, source: s.id, sourceName: s.name };
      }
      if (res && res.plain && !strict) {
        return { ...res, source: s.id, sourceName: s.name };
      }
    } catch (err) {
      // try next
    }
  }

  return { synced: [], plain: '', kind: 'none', source: null, sourceName: '' };
}
