const UA = 'Mozilla/5.0 (MixTape/1.0; AppleMusicDuet/2.0)';
const enc = encodeURIComponent;
const r3 = (n) => Math.round(n * 1000) / 1000;

function cleanTitle(title) {
  let t = (title || '').replace(/[\(\[].*?[\)\]]/g, '');
  t = t.replace(/\b(official|video|audio|lyrical|lyrics|hd|4k|music video|visualizer|remastered)\b/gi, '');
  t = t.replace(/\s+(feat|ft)\.?\s.*$/i, '');
  return t.split('|')[0].replace(/\s+/g, ' ').trim().replace(/^[\s-]+|[\s-]+$/g, '');
}

function cleanArtist(artist) {
  return (artist || '').replace(/\s*-\s*topic|vevo/gi, '').trim();
}

// "Daft Punk - Get Lucky" uploaded by "Daft Punk"  ->  title "Get Lucky": searching the bare song name matches the right version
function splitArtistTitle(title, artist) {
  const m = title.match(/^(.{1,60}?)\s+[-\u2013\u2014]\s+(.+)$/);
  if (!m) return { title, artist };
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]/g, '');
  const a = norm(m[1]), b = norm(artist);
  if (!b) return { title: m[2].trim(), artist: m[1].trim() };
  if (a && (b.includes(a) || a.includes(b))) return { title: m[2].trim(), artist };
  return { title, artist };
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

function codePoint(n) { try { return String.fromCodePoint(n); } catch (e) { return ''; } }
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[n]));
}

// ------------------------------------------------------------------ syllables -> words
const OPEN_PAREN = /^\(/;
const CLOSE_PAREN = /\)[.,!?;:'"\u2019\u201d\u2026]*$/;
const STRIP_CLOSE = /\)+([.,!?;:'"\u2019\u201d\u2026]*)$/;

/**
 * One shared place that turns raw syllables / words from any provider into clean timed words.
 *   items: [{ t, e?, text (original whitespace kept), part?, bg? }] in source order
 * - whitespace in the source decides where a word ends: "lo" + "ve " = ONE word "love", not two
 *   (if a line carries no whitespace at all, the part flags decide; if neither, every item is a word)
 * - "(...)" and background flags become `bg`; a line that is only background becomes the main line
 * - missing end times come from the next syllable, never from a fixed guess
 * returns { main: [{t,e,text,sp,part}], bg: [...] }
 */
function buildWords(items, endHint) {
  let toks = [];
  for (const it of items || []) {
    if (!it) continue;
    const raw = String(it.text == null ? '' : it.text);
    const txt = raw.trim();
    const prev = toks[toks.length - 1];
    if (!txt) { if (prev && raw) prev.ws = true; continue; }          // a bare " " between two syllables
    if (prev && /^\s/.test(raw)) prev.ws = true;                       // " love": space belongs before it
    const parts = txt.split(/\s+/);
    if (parts.length > 1) {                                            // several words in one span: share its time
      const t = Number.isFinite(it.t) ? it.t : 0;
      const e = Number.isFinite(it.e) && it.e > t ? it.e : t + 0.3 * parts.length;
      const total = parts.reduce((n, w) => n + w.length + 1, 0);
      let acc = 0;
      parts.forEach((w, k) => {
        const s = t + (acc / total) * (e - t); acc += w.length + 1;
        toks.push({ t: s, e: t + (acc / total) * (e - t), text: w, ws: k < parts.length - 1 || /\s$/.test(raw), part: false, bg: !!it.bg });
      });
    } else toks.push({ t: it.t, e: it.e, text: txt, ws: /\s$/.test(raw), part: !!it.part, bg: !!it.bg });
  }
  toks = toks.filter((k) => Number.isFinite(k.t));

  // "(i love you)": parentheses mark background vocals, even when the source forgot to flag them
  let depth = 0, openAt = -1;
  toks.forEach((k, i) => {
    if (OPEN_PAREN.test(k.text)) { depth = 1; openAt = i; }
    if (depth > 0) k.pb = true;
    if (CLOSE_PAREN.test(k.text)) depth = 0;
  });
  if (depth > 0 && openAt >= 0) for (let i = openAt; i < toks.length; i++) toks[i].pb = false; // never closed: it's just text
  const kept = [];
  for (const k of toks) {
    if (k.pb) k.bg = true;
    if (k.bg || k.pb) k.text = k.text.replace(/^\(+/, '').replace(STRIP_CLOSE, '$1');
    if (!k.text) { if (kept.length && k.ws) kept[kept.length - 1].ws = true; continue; }
    kept.push(k);
  }
  if (!kept.length) return { main: [], bg: [] };

  const anyWs = kept.some((k) => k.ws);
  kept.forEach((k, i) => {
    const nxt = kept[i + 1];
    let sp;
    if (!nxt) sp = false;
    else if (anyWs) sp = k.ws;
    else sp = !(k.part || k.text.endsWith('-'));
    if (!sp && nxt && /[.,!?;:\u2026]$/.test(k.text)) sp = true;       // punctuation always ends a word
    k.sp = sp;
  });

  let main = kept.filter((k) => !k.bg), bg = kept.filter((k) => k.bg);
  if (!main.length) { main = bg; bg = []; }
  const fin = (arr) => arr.map((k, i) => {
    const nxt = arr[i + 1], last = i === arr.length - 1;
    let e = Number.isFinite(k.e) && k.e > k.t ? k.e : NaN;
    if (!Number.isFinite(e)) e = nxt && nxt.t > k.t ? Math.min(nxt.t, k.t + 1.5) : (Number.isFinite(endHint) && endHint > k.t ? Math.min(endHint, k.t + 3) : k.t + 0.35);
    const sp = last ? false : k.sp;
    return { t: r3(k.t), e: r3(Math.max(e, k.t + 0.08)), text: k.text, sp, part: !last && !sp };
  });
  return { main: fin(main), bg: fin(bg) };
}

const wordsText = (words) => words.map((w, i) => w.text + (w.sp && i < words.length - 1 ? ' ' : '')).join('');

// ------------------------------------------------------------------ LRC
function parseLrc(text) {
  if (!text) return [];
  // Parse [offset: +/- ms] header (positive delays lyrics, negative advances them)
  const offM = text.match(/\[offset:\s*([+-]?\d+)\]/i);
  const lrcOffset = offM ? parseInt(offM[1], 10) / 1000 : 0;

  const LRC = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  const lines = [];

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Skip metadata tags
    if (/^\[(ti|ar|al|by|hash|offset|id|re|ve|length|au|la):/i.test(trimmed)) continue;

    let m;
    const stamps = [];
    while ((m = LRC.exec(raw)) !== null) {
      stamps.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
    }
    LRC.lastIndex = 0;
    if (!stamps.length) continue;

    const body = raw.replace(LRC, '').trim();
    if (!body) continue;

    // Filter non-lyric intro credit lines at start (e.g. [00:00.00]Composer: ...)
    if (stamps[0] < 0.6 && /^(written|composed|lyrics|arranger|produced|作词|作曲|编曲|制作|演唱)\s*[:：]/i.test(body)) {
      continue;
    }

    // Enhanced LRC word/syllable tags: <00:12.34>word <12.60>another
    const wordRe = /<(\d+(?::\d+)?(?:\.\d+)?)>([^<]*)/g;
    const rawWords = [];
    let wm;
    while ((wm = wordRe.exec(body)) !== null) rawWords.push({ t: parseTimestamp(wm[1]) + lrcOffset, text: wm[2] });
    const lead = body.split('<')[0];
    if (rawWords.length && lead.trim()) rawWords.unshift({ t: stamps[0] + lrcOffset, text: lead });
    const built = rawWords.length ? buildWords(rawWords, NaN) : null;
    const plainBody = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!plainBody) continue;

    for (const s of stamps) {
      const line = { t: Math.max(0, r3(s + lrcOffset)), text: plainBody };
      if (built && built.main.length) {
        const d = s - stamps[0];   // a repeated line ([01:00][02:30]text) carries its words shifted to each occurrence
        const shift = (arr) => arr.map((w) => ({ ...w, t: r3(w.t + d), e: r3(w.e + d) }));
        line.words = shift(built.main);
        if (built.bg.length) line.bg = [{ words: shift(built.bg) }];
        line.t = Math.max(0, line.words[0].t);
      }
      lines.push(line);
    }
  }

  lines.sort((a, b) => a.t - b.t);

  // Plain LRC lines get NO end time: the player estimates word timing from the syllables instead of
  // stretching the words over the whole gap to the next line. Word-timed lines let the last word
  // ring out until just before the next line.
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i], nxt = lines[i + 1];
    if (cur.words && cur.words.length) {
      const last = cur.words[cur.words.length - 1];
      const cap = nxt ? Math.max(cur.t, nxt.t - 0.05) : last.t + 1.5;
      last.e = r3(Math.max(last.t + 0.25, Math.min(cap, last.t + 2.5)));
      cur.e = Math.max(...cur.words.map((w) => w.e));
    }
  }

  return lines;
}

// ------------------------------------------------------------------ cleanup applied to every provider's result
const BREAK_RE = /^[\s\u266a\u266b\u266c\u2669\u00b7.\u2026*\-\u2013\u2014_~]*$|^[\[(\uff08\u3010]?\s*(instrumental|music|intro|outro|solo|interlude|musical break)\s*[\])\uff09\u3011]?\s*$/i;

function tidy(lines) {
  const list = [];
  for (const l of lines || []) {
    if (!l) continue;
    const words = Array.isArray(l.words) ? l.words.filter((w) => w && Number.isFinite(w.t) && String(w.text || '').trim()) : [];
    const t = words.length ? words[0].t : Number(l.t);
    if (!Number.isFinite(t)) continue;
    const text = String(l.text || (words.length ? wordsText(words) : '')).trim();
    if (!text && !words.length) continue;
    list.push({ ...l, t: Math.max(0, r3(t)), text, words: words.length ? words : undefined });
  }
  list.sort((a, b) => a.t - b.t);
  const out = [];
  list.forEach((l, i) => {
    if (!(l.words && l.words.length) && BREAK_RE.test(l.text)) {          // "♪", "[Instrumental]": a break (dots), not a lyric line
      const nxt = list.slice(i + 1).find((x) => x.t > l.t + 0.5);
      const e = nxt ? nxt.t - 0.3 : l.t + 5;
      if (e - l.t >= 2) out.push({ type: 'break', t: l.t, e: r3(e) });
      return;
    }
    out.push(l);
  });
  return out;
}

function lastTime(lines) {
  let last = 0;
  for (const l of lines) {
    if (l.type === 'break') continue;
    const wEnd = (l.words || []).reduce((n, w) => Math.max(n, w.e || 0), 0);
    last = Math.max(last, l.e || 0, wEnd, l.t || 0);
  }
  return last;
}

// lyrics that run past the end of the song belong to a different cut of it
function fitsDuration(lines, dur) {
  if (!(dur > 20)) return true;
  return lastTime(lines) <= dur + 6;
}

// ------------------------------------------------------------------ 1. BetterLyrics (Apple Music style syllable timing from community API)
async function pBetterLyrics(ctx) {
  const base = `s=${enc(ctx.title)}&a=${enc(ctx.artist)}`;
  const one = async (path, q) => {
    try {
      const res = await fetch(`https://lyrics-api.boidu.dev${path}?${q}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const text = await res.text();
      let ttml = text;
      try {
        const j = JSON.parse(text);
        ttml = j.ttml || j.lyrics || '';
      } catch (e) {}
      if (typeof ttml === 'string' && ttml.trim().startsWith('<')) {
        const lines = parseTtml(ttml);
        if (lines && lines.length) return lines;
      }
    } catch (e) {}
    return null;
  };
  // all variants at once; the duration hint (when the API understands it) wins
  const tries = [];
  if (ctx.dur > 0) tries.push(one('/getLyrics', `${base}&d=${Math.round(ctx.dur)}`));
  tries.push(one('/getLyrics', base), one('/ttml/getLyrics', base));
  for (const p of tries) {
    const lines = await p;
    if (lines) return { synced: lines, plain: '', kind: 'word', isDuet: lines.some((l) => l.agent === 1) };
  }
  return null;
}

// Apple Music TTML: millisecond syllable timing, duets, nested background vocals
function parseTtml(xml) {
  if (!xml) return [];
  const lines = [];
  const agents = [];
  const attr = (a, n) => { const m = a.match(new RegExp('(?:^|\\s)(?:[\\w-]+:)?' + n + '="([^"]*)"', 'i')); return m ? m[1] : null; };
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let pMatch;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const attrs = pMatch[1];
    const body = pMatch[2];

    const agentName = attr(attrs, 'agent') || 'v1';
    if (!agents.includes(agentName)) agents.push(agentName);
    const agent = agents.length > 1 ? (agentName === agents[0] ? 0 : 1) : 0;

    const b = attr(attrs, 'begin'), en = attr(attrs, 'end'), du = attr(attrs, 'dur');
    const lineStart = b != null ? parseTimestamp(b) : NaN;
    const lineEnd = en != null ? parseTimestamp(en) : (du != null && Number.isFinite(lineStart) ? lineStart + parseTimestamp(du) : NaN);

    // walk the markup with a real span stack, so a background span ( <span x-bg><span>(I</span> <span>love</span>... ) keeps ALL its syllables
    const tagRe = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
    const stack = [];
    const items = [];
    let plain = '';
    let m;
    while ((m = tagRe.exec(body)) !== null) {
      if (m[5] !== undefined) {                                   // text node
        if (stack.some((s) => s.skip)) continue;                   // translations / romanisation are not lyrics
        const raw = decodeEntities(m[5]);
        plain += raw;
        let timed = null;
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].begin != null) { timed = stack[i]; break; }
        if (!raw.trim()) { items.push({ text: raw }); continue; }  // whitespace between syllables (sits outside the timed spans)
        if (!timed) continue;
        items.push({ t: timed.begin, e: timed.end, text: raw, bg: !!stack[stack.length - 1].bg });
        continue;
      }
      const name = m[2].toLowerCase().replace(/^.*:/, '');
      if (name === 'br') { plain += ' '; continue; }
      if (name !== 'span') continue;
      if (m[1]) { stack.pop(); continue; }
      if (m[4]) continue;
      const a = m[3];
      const parent = stack[stack.length - 1] || {};
      const role = (attr(a, 'role') || '').toLowerCase();
      const sb = attr(a, 'begin'), se = attr(a, 'end'), sd = attr(a, 'dur');
      const begin = sb != null ? parseTimestamp(sb) : null;
      const end = se != null ? parseTimestamp(se) : (sd != null && begin != null ? begin + parseTimestamp(sd) : null);
      stack.push({
        bg: !!parent.bg || role === 'x-bg',
        skip: !!parent.skip || role === 'x-translation' || role === 'x-roman',
        begin, end
      });
    }

    const hasTimed = items.some((x) => x.t != null);
    if (!hasTimed) {                                               // line-timed only
      const text = decodeEntities(plain.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (!text || !Number.isFinite(lineStart)) continue;
      const line = { t: r3(lineStart), text, agent };
      if (Number.isFinite(lineEnd) && lineEnd > lineStart) line.e = r3(lineEnd);
      lines.push(line);
      continue;
    }

    const built = buildWords(items, lineEnd);
    if (!built.main.length) continue;
    const lt = built.main[0].t;
    const lastE = Math.max(built.main[built.main.length - 1].e, built.bg.length ? built.bg[built.bg.length - 1].e : 0);
    const text = wordsText(built.main) + (built.bg.length ? ' (' + wordsText(built.bg) + ')' : '');
    const line = { t: lt, e: r3(Math.max(Number.isFinite(lineEnd) ? lineEnd : 0, lastE, lt + 0.3)), text, agent, words: built.main };
    if (built.bg.length) line.bg = [{ words: built.bg }];
    lines.push(line);
  }

  lines.sort((a, b) => a.t - b.t);

  // a line never claims time that belongs to the next one (its own words still decide how long it stays lit)
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i], nxt = lines[i + 1];
    if (nxt && cur.e && cur.e > nxt.t) cur.e = Math.max(cur.t + 0.3, nxt.t);
  }

  return lines;
}

// ------------------------------------------------------------------ 2. LyricsPlus (Apple Music, Spotify, Musixmatch Word & Syllable Sync with Duets)
async function pLyricsPlus(ctx) {
  const bases = [
    'https://lyricsplus.prjktla.my.id',
    'https://lyrics.alextam.dev'
  ];

  const one = async (base) => {
    try {
      const url = `${base}/v2/lyrics/get?title=${enc(ctx.title)}&artist=${enc(ctx.artist)}&source=apple,lyricsplus,spotify,musixmatch-word`;
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const j = await res.json();
      const raw = j.lyrics || [];
      return raw.length ? raw : null;
    } catch (e) { return null; }
  };
  const tries = bases.map(one);

  for (const p of tries) {
    const raw = await p;
    if (!raw) continue;

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
      const endMs = l.endtime != null ? l.endtime : l.end;
      const lineEnd = endMs > 0 ? endMs / 1000 : NaN;

      const items = sy.map((s) => {
        const st = (s.time || 0) / 1000;
        return {
          t: st,
          e: s.duration > 0 ? st + s.duration / 1000 : NaN,
          text: s.text,
          part: !!(s.part || s.isPartOfWord),
          bg: !!s.isBackground
        };
      });
      const built = buildWords(items, lineEnd);

      if (!built.main.length) {
        const text = (l.text || '').trim();
        if (text) lines.push({ t: r3(lt), text, agent });
        continue;
      }
      const text = (l.text || '').trim() || wordsText(built.main) + (built.bg.length ? ' (' + wordsText(built.bg) + ')' : '');
      const line = { t: built.main[0].t, text, agent, words: built.main };
      if (built.bg.length) line.bg = [{ words: built.bg }];
      lines.push(line);
    }

    if (lines.length) {
      return { synced: lines.sort((a, b) => a.t - b.t), plain: '', kind: 'word', isDuet };
    }
  }
  return null;
}

// ------------------------------------------------------------------ 3. Apple Music via Paxsenix
async function pPaxsenix(ctx) {
  try {
    const sr = await fetch(`https://itunes.apple.com/search?term=${enc(`${ctx.title} ${ctx.artist}`.trim())}&entity=song&limit=6`, {
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
      const lineEnd = l.endtime ? l.endtime / 1000 : NaN;

      if (typeof tx === 'string') {
        if (tx.trim()) {
          const line = { t: r3(lt), text: tx.trim(), agent };
          if (Number.isFinite(lineEnd) && lineEnd > lt) line.e = r3(lineEnd);
          lines.push(line);
        }
        continue;
      }
      if (!Array.isArray(tx)) continue;

      const map = (arr, bg) => (arr || []).map((w) => ({
        t: w.timestamp != null ? w.timestamp / 1000 : lt,
        e: w.endtime != null ? w.endtime / 1000 : NaN,
        text: w.text,
        part: !!w.part,
        bg: bg || !!w.background || !!l.background
      }));
      const built = buildWords([...map(tx, false), ...map(l.backgroundText, true)], lineEnd);
      if (!built.main.length) continue;
      const line = { t: built.main[0].t, text: wordsText(built.main) + (built.bg.length ? ' (' + wordsText(built.bg) + ')' : ''), agent, words: built.main };
      if (built.bg.length) line.bg = [{ words: built.bg }];
      lines.push(line);
    }

    if (lines.length) {
      const hasWords = lines.some((l) => l.words);
      const isDuet = lines.some((l) => l.agent === 1);
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
  const get = async (url) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  };
  const search = (q) => get(`https://lrclib.net/api/search?q=${enc(q)}`);
  const pick = (items) => {
    const synced = (Array.isArray(items) ? items : []).filter((i) => i.syncedLyrics);
    if (!synced.length) return null;
    if (ctx.dur) synced.sort((a, b) => Math.abs((a.duration || 0) - ctx.dur) - Math.abs((b.duration || 0) - ctx.dur));
    const parsed = parseLrc(synced[0].syncedLyrics);
    return parsed.length ? parsed : null;
  };

  // exact match (title + artist + length) is the most reliable; run it next to the broad search
  const exactP = ctx.dur > 0 && ctx.artist
    ? get(`https://lrclib.net/api/get?track_name=${enc(ctx.title)}&artist_name=${enc(ctx.artist)}&duration=${Math.round(ctx.dur)}`)
    : Promise.resolve(null);
  const firstP = search(`${ctx.title} ${ctx.artist}`.trim());

  const exact = await exactP;
  if (exact && exact.syncedLyrics) {
    const parsed = parseLrc(exact.syncedLyrics);
    if (parsed.length) return { synced: parsed, plain: '', kind: 'line' };
  }
  const first = await firstP;
  let parsed = pick(first);
  if (parsed) return { synced: parsed, plain: '', kind: 'line' };
  const second = await search(ctx.title);
  parsed = pick(second);
  if (parsed) return { synced: parsed, plain: '', kind: 'line' };

  const plainItem = [...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])].find((i) => i.plainLyrics);
  if (plainItem) return { synced: [], plain: plainItem.plainLyrics, kind: 'plain' };
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
// tier 1 = word / syllable sync, tier 2 = line sync (or plain text)
const SOURCES = [
  { id: 'betterlyrics', tier: 1, name: 'BetterLyrics', kind: 'word', note: 'Apple Music style syllable timing from community API', fn: pBetterLyrics },
  { id: 'lyricsplus', tier: 1, name: 'LyricsPlus', kind: 'word', note: 'Word sync gathered from Apple Music, Spotify and Musixmatch', fn: pLyricsPlus },
  { id: 'paxsenix', tier: 1, name: 'Apple Music (Paxsenix)', kind: 'word', note: 'Apple Music lyrics through the Paxsenix proxy', fn: pPaxsenix },
  { id: 'netease', tier: 2, name: 'NetEase Cloud Music', kind: 'word', note: 'Word sync when available, otherwise line sync', fn: pNetEase },
  { id: 'lrclib', tier: 2, name: 'LRCLIB', kind: 'line', note: 'Open database of line-synced lyrics', fn: pLrclib },
  { id: 'ytmusic', tier: 2, name: 'YouTube Music', kind: 'line', note: 'Lyrics shown in YouTube Music', fn: pYtMusic },
  { id: 'simpmusic', tier: 2, name: 'SimpMusic', kind: 'line', note: 'Community lyrics matched by YouTube video', fn: pSimpMusic },
  { id: 'kugou', tier: 2, name: 'KuGou', kind: 'line', note: 'Large catalogue, strong for Asian music', fn: pKuGou },
];

export function listSources() {
  return SOURCES.map(s => ({ id: s.id, name: s.name, kind: s.kind, note: s.note, available: true }));
}

function withTimeout(p, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(p).catch(() => null),
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })
  ]).finally(() => clearTimeout(timer));
}

// provider result -> cleaned synced result (or null when it holds no synced lines)
function ready(res) {
  if (!res || !Array.isArray(res.synced) || !res.synced.length) return null;
  const synced = tidy(res.synced);
  if (!synced.some((l) => l.type !== 'break')) return null;
  return {
    ...res,
    synced,
    kind: synced.some((l) => l.words && l.words.length) ? 'word' : 'line',
    isDuet: synced.some((l) => l.agent === 1)
  };
}

export async function fetchLyrics(title, artist = '', duration = 0, vid = '', source = 'auto', strict = false, prefer = 'word') {
  const cleaned = splitArtistTitle(cleanTitle(title), cleanArtist(artist).split(/,|&| feat\.?| ft\.?/i)[0].trim());
  const ctx = {
    title: cleaned.title || cleanTitle(title) || String(title || ''),
    artist: cleaned.artist,
    dur: parseFloat(duration || 0) || 0,
    vid: vid || ''
  };

  // "Prefer word-by-word" off -> line-synced sources are tried first
  let order = prefer === 'line'
    ? [...SOURCES.filter((s) => s.tier === 2), ...SOURCES.filter((s) => s.tier === 1)]
    : [...SOURCES];
  if (source !== 'auto') {
    const src = SOURCES.find(s => s.id === source);
    if (src) {
      order = strict ? [src] : [src, ...order.filter(s => s.id !== source)];
    }
  }

  // Every provider starts at once (each has its own timeout), results are then accepted strictly in priority
  // order: the best source wins, but a slow one never makes a fast, good result wait for the others in line.
  const jobs = order.map((s) => withTimeout(Promise.resolve().then(() => s.fn(ctx)), 9000));

  let mismatch = null, plain = null;
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    const res = await jobs[i];
    const ok = ready(res);
    if (ok) {
      const out = { ...ok, source: s.id, sourceName: s.name };
      if (strict || fitsDuration(ok.synced, ctx.dur)) return out;
      if (!mismatch) mismatch = out;       // wrong cut of the song: only used if nothing better exists
      continue;
    }
    if (!plain && !strict && res && res.plain) plain = { ...res, source: s.id, sourceName: s.name };
  }

  return mismatch || plain || { synced: [], plain: '', kind: 'none', source: null, sourceName: '' };
}
