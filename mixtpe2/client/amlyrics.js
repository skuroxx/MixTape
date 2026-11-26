/*!
 * AMLyrics: Apple Music-style synced lyrics.
 *
 *   const lyr = new AMLyrics(containerEl, { getTime: () => audio.currentTime, onSeek: (t) => audio.currentTime = t });
 *   lyr.load({ lines: [ { t: 6.0, agent: 0, words: [{ t: 6.0, e: 6.2, text: "The" }, ...], bg: { words: [...] } } ] });
 *   lyr.start();                 // 60fps loop (requestAnimationFrame); lyr.stop() pauses it
 *                                // options: active() => bool  (loop idles itself when it returns false), fx: "full"|"lite"
 *
 * Data:
 *   line  = { t, e?, agent?: 0|1|"v1"|"v2", words?: [{t,e,text,sp?}], text?: "no word timing? fine", bg?: bgLine | bgLine[] }
 *   bgLine = { t?, e?, words?: [...], text? }      // nested background vocal, shown small under the main line
 *   { type: "break", t, e }                        // optional explicit instrumental gap (gaps >= minBreak are found automatically)
 *
 * No time callback? Feed it with `lyr.clock.sync(seconds, isPlaying, rate)` whenever you know the position
 * (even only 4x per second): the clock interpolates between updates so the animation stays at the display rate.
 */
(function (root) {
  "use strict";

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
  const NOSP = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0eff\u1780-\u17ff]/;   // scripts written without spaces: never glue these into one unbreakable group

  /* ------------------------------------------------------------------ clock */
  /** Interpolates a coarse position feed (e.g. YouTube's ~4 Hz) so lyrics move every frame. */
  class SyncClock {
    constructor() { this.base = 0; this.wall = now(); this.playing = false; this.rate = 1; this.corr = 0; }
    now() {
      if (!this.playing) return this.base;
      const ms = now() - this.wall;
      return this.base + (ms / 1000) * this.rate + this.corr * easeOut(ms / 250);
    }
    sync(t, playing = this.playing, rate = this.rate) {
      if (!Number.isFinite(t)) return;
      const pred = this.now(), drift = t - pred;
      if (!playing || !this.playing || Math.abs(drift) > 0.12) { this.base = t; this.corr = 0; } // seek / pause / big jump: snap
      else { this.base = pred; this.corr = drift; }                                             // small drift: blend over 250 ms
      this.wall = now(); this.playing = !!playing; this.rate = rate || 1;
    }
  }

  /* -------------------------------------------------------------- normalize */
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const agentOf = (a) => (a === 1 || a === "1" || a === true || (typeof a === "string" && /^v?0*[2-9]|^(b|right|opposite)/i.test(a)) ? 1 : 0);

  /** Rough syllable count: how long a word takes to sing is closer to its syllables than to its letters. */
  function syllables(w) {
    const s = String(w).toLowerCase().replace(/[^a-z\u00c0-\u024f]/g, "");
    if (!s) { const n = Array.from(String(w).replace(/[^\p{L}\p{N}]/gu, "")).length; return CJK.test(w) ? Math.max(1, n) : Math.max(1, Math.round(n / 2.5)); }
    if (s.length <= 3) return 1;
    const t = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    const m = t.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  /** No word timing from the source: spread the line over its words by syllables, with small pauses after , and . */
  function estimateWords(text, t, e) {
    const parts = String(text || "").split(/\s+/).filter(Boolean);
    if (!parts.length) return [];
    const span = Math.max(0.2, e - t);
    const w = parts.map(syllables);
    const pause = parts.map((p, i) => (i === parts.length - 1 ? 0 : /[.!?\u2026]["')\]]*$/.test(p) ? 0.7 : /[,;:\u2014\u2013-]["')\]]*$/.test(p) ? 0.35 : 0));
    const total = w.reduce((a, b) => a + b, 0) + pause.reduce((a, b) => a + b, 0);
    let acc = 0;
    return parts.map((p, i) => {
      const st = t + (acc / total) * span; acc += w[i];
      const en = t + (acc / total) * span; acc += pause[i];
      return { t: st, e: en, text: p, sp: true };
    });
  }

  /** "(i love you)" inside a line = background vocal. Returns { main, bg } or null when there is nothing to split. */
  function splitParen(words) {
    if (!words.some((w) => /[()]/.test(w.text))) return null;
    const main = [], bg = []; let depth = 0;
    for (const w of words) {
      const open = w.text.charAt(0) === "(", close = /\)[.,!?;:'"\u2019\u201d\u2026]*$/.test(w.text);
      if (open) depth = 1;
      const inside = depth > 0;
      if (close) depth = 0;
      const text = w.text.replace(/^\(+/, "").replace(/\)+([.,!?;:'"\u2019\u201d\u2026]*)$/, "$1");
      if (text) (inside ? bg : main).push({ ...w, text });
    }
    return depth === 0 && main.length && bg.length ? { main, bg } : null;
  }

  function cleanWords(words) {
    const list = (words || []).filter((w) => w && String(w.text || "").trim()).map((w) => {
      const t = num(w.t, 0);
      return { t, e: Math.max(num(w.e, t + 0.3), t + 0.08), text: String(w.text).trim(), sp: w.sp, part: !!(w.part || w.isPartOfWord) };
    });
    for (let i = 1; i < list.length; i++) if (list[i].t < list[i - 1].t - 0.001) { list.sort((a, b) => a.t - b.t); break; } // stable: equal times keep their order
    const last = list.length - 1;
    // the data says where spaces are (syllables of one word have sp:false + part:true); only guess when it says nothing,
    // or when every word claims "no space" without marking syllables, which is broken data
    const broken = list.length > 1 && list.every((w, i) => i === last || (w.sp === false && !w.part));
    return list.map((w, i) => {
      const cjk = CJK.test(w.text);
      let sp = typeof w.sp === "boolean" ? w.sp : !cjk && !w.part && !w.text.endsWith("-");
      if (i === last) sp = false;
      else if (!sp && !cjk && (broken ? !w.text.endsWith("-") : !w.part && /[.,!?:;]$/.test(w.text))) sp = true;
      return { ...w, sp };
    });
  }

  function normBg(b, lineT, lineE) {
    if (!b) return null;
    let words = cleanWords(b.words);
    if (!words.length && b.text) words = estimateWords(b.text, num(b.t, lineT), num(b.e, lineE));
    if (!words.length) return null;
    return { t: words[0].t, e: Math.max(...words.map((w) => w.e)), words };
  }

  /**
   * data -> { items: [{ kind: "line"|"break", t, e, agent, words, bg[], src }] } sorted by time.
   * `src` is the line's index in data.lines (what the host app uses for sharing etc).
   */
  function normalize(data, opts) {
    opts = opts || {};
    const minBreak = num(opts.minBreak, 5), maxEstimate = num(opts.maxEstimate, 8), longMs = num(opts.longWord, 1.1);
    const raw = Array.isArray(data) ? data : (data && data.lines) || [];
    const src = raw.map((l, i) => ({ l, i })).filter((x) => x.l && (x.l.type === "break" || x.l.text || (x.l.words && x.l.words.length)))
      .sort((a, b) => num(a.l.t, num(a.l.words && a.l.words[0] && a.l.words[0].t, 0)) - num(b.l.t, num(b.l.words && b.l.words[0] && b.l.words[0].t, 0)));
    const items = [], explicit = [];
    src.forEach(({ l, i }, k) => {
      if (l.type === "break") { explicit.push({ kind: "break", t: num(l.t, 0), e: num(l.e, num(l.t, 0) + 5), src: -1 }); return; }
      let words = cleanWords(l.words), extraBg = [], est = false;
      const sp0 = words.length ? splitParen(words) : null;
      if (sp0) { words = cleanWords(sp0.main); extraBg = sp0.bg; }
      const t = words.length ? words[0].t : num(l.t, 0);
      let e = num(l.e, NaN);
      if (!words.length) {
        const txt = String(l.text || "").replace(/(\S)\(/g, "$1 (").replace(/\)(?=[A-Za-z\u00c0-\u024f])/g, ") ");   // "you(i" -> "you (i"
        est = !Number.isFinite(e);
        if (est) {
          const nxt = src.slice(k + 1).map((x) => x.l).find((x) => x.type !== "break");
          const natural = 0.45 + txt.split(/\s+/).filter(Boolean).reduce((n, w) => n + syllables(w), 0) * 0.3;   // typical sung length
          const gap = nxt ? Math.max(0.3, num(nxt.t, t + maxEstimate) - t) : natural * 1.4;
          e = t + Math.min(gap * 0.94, Math.max(natural, Math.min(gap, 6) * 0.82));                            // sing it, then rest until the next line
        }
        words = estimateWords(txt, t, e);
        const sp1 = splitParen(words);
        if (sp1) { words = cleanWords(sp1.main); extraBg = sp1.bg; }
      } else e = Math.max(Number.isFinite(e) ? e : 0, ...words.map((w) => w.e));
      words.forEach((w) => { const letters = Array.from(w.text).length; w.long = w.e - w.t >= longMs && letters <= 16; });
      const bgRaw = (l.bg ? (Array.isArray(l.bg) ? l.bg : [l.bg]) : []).concat(extraBg.length ? [{ words: extraBg }] : []);
      const bg = bgRaw.map((b) => normBg(b, t, e)).filter(Boolean);
      const end = Math.max(e, ...bg.map((b) => b.e));
      items.push({ kind: "line", t, e: end, est, agent: agentOf(l.agent), words, bg, src: i });
    });
    // instrumental gaps: before the first line and between lines (explicit ones win)
    let covered = 0;
    const auto = [];
    items.forEach((it) => {
      if (it.t - covered >= minBreak && !explicit.some((b) => b.t < it.t && b.e > covered)) auto.push({ kind: "break", t: covered === 0 ? 0.3 : covered + 0.25, e: it.t - 0.3, src: -1 });
      covered = Math.max(covered, it.est ? it.t + Math.max(it.e - it.t, 6) : it.e);   // guessed line ends must not invent instrumental breaks
    });
    return { items: items.concat(explicit, auto).sort((a, b) => a.t - b.t || (a.kind === "break" ? -1 : 1)) };
  }

  /* -------------------------------------------------- per-word motion curves */
  /** Short words "pop": quick rise, soft settle (0..1..0 over 450 ms from the word's start). */
  function popAt(u) { return u < 0 || u > 0.45 ? 0 : u < 0.12 ? easeOut(u / 0.12) : 1 - easeInOut((u - 0.12) / 0.33); }
  /** Long (stretched) words swell while sung and relax 450 ms after they end. */
  function zoomAt(w, t) { return t <= w.e ? easeOut((t - w.t) / 0.5) : 1 - easeInOut((t - w.e) / 0.45); }

  /* --------------------------------------------------------------- renderer */
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const split = (s) => (typeof Intl !== "undefined" && Intl.Segmenter ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment) : Array.from(s));

  class AMLyrics {
    constructor(container, opts) {
      opts = opts || {};
      this.root = container; this.opts = opts;
      this.getTime = opts.getTime || null; this.clock = new SyncClock();
      this.onSeek = opts.onSeek || null; this.onLineClick = opts.onLineClick || null;
      this.anchor = num(opts.anchor, 0.22); this.offset = 0;
      const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.lite = opts.fx ? opts.fx === "lite" : reduce;
      this.items = []; this.snap = true; this.settle = 0; this.cur = -2; this.lastT = -1; this.hold = 0; this.target = 0; this.raf = 0; this.fps = 60; this._ts = 0;
      container.classList.add("am-root"); container.classList.toggle("am-lite", this.lite);
      this._click = (e) => this._onClick(e);
      this._key = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("am-line")) { e.preventDefault(); this._onClick(e); } };
      const hold = () => { this.hold = now() + 3000; };
      container.addEventListener("click", this._click); container.addEventListener("keydown", this._key);
      ["wheel", "touchstart", "touchmove"].forEach((n) => container.addEventListener(n, hold, { passive: true }));
      if (typeof ResizeObserver !== "undefined") { this._ro = new ResizeObserver(() => this._retarget()); this._ro.observe(container); }
    }

    setFx(fx) { this.lite = fx === "lite"; this.root.classList.toggle("am-lite", this.lite); this.lastT = -1; }
    setOffset(s) { this.offset = s || 0; this.lastT = -1; }
    time() { const t = this.getTime ? this.getTime() : this.clock.now(); return (Number.isFinite(t) ? t : 0) + this.offset; }

    load(data) {
      this.items = normalize(data, this.opts).items;
      this.root.classList.add("am-root"); this.root.classList.toggle("am-lite", this.lite);
      this.root.textContent = ""; this.cur = -2; this.lastT = -1; this.target = 0; this.root.scrollTop = 0; this.hold = 0; this.snap = true;
      this.active = new Set();
      const frag = document.createDocumentFragment();
      this.items.forEach((it, i) => { it.idx = i; it.state = "future"; frag.appendChild(it.kind === "break" ? this._buildBreak(it) : this._buildLine(it)); });
      this.root.appendChild(frag);
      this.root.classList.toggle("am-duet", this.items.some((it) => it.agent === 1));
      this.root.classList.toggle("am-empty", !this.items.length);
      this._retarget();
      return this;
    }

    /** Empty the container and drop the player styling, e.g. to show a "no lyrics" message in it. */
    clear() { this.items = []; this.cur = -2; this.lastT = -1; this.root.classList.remove("am-root", "am-duet", "am-empty"); this.root.textContent = ""; return this; }

    _word(w, cls) {
      const s = el("span", "am-w" + (w.long ? " am-long" : "") + (cls ? " " + cls : ""));
      if (w.long) w.letters = split(w.text).map((ch) => { const l = el("span", "am-l"); l.textContent = ch; s.appendChild(l); return { el: l }; });
      else { const t = el("span", "am-wt"); t.textContent = w.text; s.appendChild(t); w.core = t; }
      w.el = s; w.st = -1; return s;
    }

    _fillWords(parent, words) {
      // syllables of one word sit in a nowrap group, so a line can never break in the middle of a word
      const groups = []; let g = [];
      words.forEach((w, k) => {
        g.push(w); const nx = words[k + 1];
        if (!(nx && w.sp === false && !NOSP.test(w.text.slice(-1)) && !NOSP.test(nx.text.charAt(0)))) { groups.push(g); g = []; }
      });
      groups.forEach((grp, gi) => {
        let host = parent;
        if (grp.length > 1) { host = el("span", "am-wg"); parent.appendChild(host); }
        grp.forEach((w) => host.appendChild(this._word(w)));
        if (gi < groups.length - 1 && grp[grp.length - 1].sp !== false) parent.appendChild(document.createTextNode(" "));
      });
    }

    _buildLine(it) {
      const n = el("div", "am-line am-future" + (it.agent ? " am-right" : ""));
      n.dataset.i = it.src; n.tabIndex = 0; n.setAttribute("role", "button");
      const main = el("div", "am-main"); this._fillWords(main, it.words); n.appendChild(main);
      it.bg.forEach((b) => {
        const wrap = el("div", "am-bg"), inner = el("div", "am-bg-in"); this._fillWords(inner, b.words); wrap.appendChild(inner); n.appendChild(wrap); b.el = wrap; b.on = false;
      });
      it.el = n; return n;
    }

    _buildBreak(it) {
      const n = el("div", "am-break am-future"); n.setAttribute("role", "button"); n.tabIndex = 0; n.dataset.i = -1;
      n.setAttribute("aria-label", "Instrumental break");
      const d = el("span", "am-dots"); it.dots = [0, 1, 2].map(() => { const i = el("i"); d.appendChild(i); return i; });
      n.appendChild(d); it.el = n; return n;
    }

    /* ---- painting ---- */
    _set(node, k, v, store, key) { if (store[key] !== v) { store[key] = v; node.style.setProperty(k, v); } }

    _paintWord(w, t, mode) { // mode: 0 reset, 2 finished, 1 live
      const c = w; // cache lives on the word object
      if (mode === 1) {
        if (w.letters) {
          const n = Math.max(1, w.letters.length), per = Math.max(0.02, (w.e - w.t) / n);
          this._set(w.el, "--z", this.lite ? 0 : +zoomAt(w, t).toFixed(3), c, "_z");
          w.letters.forEach((L, i) => {
            const ls = w.t + i * per;
            this._set(L.el, "--f", +clamp01((t - ls) / per).toFixed(3), L, "_f");
            this._set(L.el, "--lift", this.lite ? 0 : +Math.sin(Math.PI * clamp01((t - ls) / (0.55 + 0.1 * (w.e - w.t)))).toFixed(3), L, "_l");
          });
        } else {
          const dur = Math.max(0.08, w.e - w.t);
          this._set(w.core, "--f", +clamp01((t - w.t) / dur).toFixed(3), c, "_f");
          this._set(w.el, "--pop", this.lite ? 0 : +popAt(t - w.t).toFixed(3), c, "_p");
        }
      } else {
        const f = mode === 2 ? 1 : 0;
        if (w.letters) { this._set(w.el, "--z", 0, c, "_z"); w.letters.forEach((L) => { this._set(L.el, "--f", f, L, "_f"); this._set(L.el, "--lift", 0, L, "_l"); }); }
        else { this._set(w.core, "--f", f, c, "_f"); this._set(w.el, "--pop", 0, c, "_p"); }
      }
      w.st = mode;
    }

    _paintGroup(words, t) {
      for (const w of words) {
        if (t < w.t - 0.03) { if (w.st !== 0) this._paintWord(w, t, 0); }
        else if (t > w.e + 0.5) { if (w.st !== 2) this._paintWord(w, t, 2); }
        else this._paintWord(w, t, 1);
      }
    }

    _setState(it, st, t) {
      if (it.state === st) return;
      it.state = st;
      it.el.classList.toggle("am-future", st === "future"); it.el.classList.toggle("am-active", st === "active"); it.el.classList.toggle("am-past", st === "past");
      if (it.kind === "line" && st !== "active") {
        const m = st === "past" ? 2 : 0;
        it.words.forEach((w) => this._paintWord(w, t, m));
        it.bg.forEach((b) => { b.words.forEach((w) => this._paintWord(w, t, m)); if (b.on) { b.on = false; b.el.classList.remove("am-on"); } });
      }
      if (it.kind === "break" && st !== "active") { it.el.classList.remove("am-ending"); it.dots.forEach((d) => d.style.setProperty("--df", st === "past" ? 1 : 0)); }
    }

    _stateAt(it, t) {
      if (it.kind === "break") return t < it.t ? "future" : t < it.e ? "active" : "past";
      return t < it.t - 0.05 ? "future" : t < it.e + 0.25 ? "active" : "past";
    }

    _live(it, t) {
      if (it.kind === "line") {
        this._paintGroup(it.words, t);
        it.bg.forEach((b) => {
          const on = t >= b.t - 0.3 && t < b.e + 0.7;
          if (on !== b.on) { b.on = on; b.el.classList.toggle("am-on", on); this.settle = now() + 800; }
          this._paintGroup(b.words, t);
        });
      } else {
        const p = clamp01((t - it.t) / Math.max(0.1, it.e - it.t));
        it.dots.forEach((d, k) => { const f = +clamp01(p * 3 - k).toFixed(3); if (d._f !== f) { d._f = f; d.style.setProperty("--df", f); } });
        const ending = it.e - t < 0.5; if (ending !== !!it._end) { it._end = ending; it.el.classList.toggle("am-ending", ending); }
      }
    }

    /** One frame at media time t (seconds, offset already applied). Public so hosts/tests can drive it. */
    update(t) {
      const L = this.items; if (!L.length) return;
      const jump = this.lastT < 0 || t < this.lastT - 0.05 || t - this.lastT > 1;
      this.lastT = t;
      // current item = last one that has started (looks ~120 ms ahead so scrolling leads the voice slightly)
      let lo = 0, hi = L.length - 1, cur = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].t <= t + 0.12) { cur = m; lo = m + 1; } else hi = m - 1; }
      const from = jump ? 0 : Math.max(0, cur - 6), to = jump ? L.length - 1 : Math.min(L.length - 1, cur + 2);
      for (let i = from; i <= to; i++) { const it = L[i]; this._setState(it, this._stateAt(it, t), t); if (it.state === "active") this._live(it, t); }
      if (!jump) this.active.forEach((i) => { if (i < from || i > to) { const it = L[i]; this._setState(it, this._stateAt(it, t), t); } });
      this.active.clear(); for (let i = from; i <= to; i++) if (L[i].state === "active") this.active.add(i);
      if (cur !== this.cur) {
        this.cur = cur;
        const lite = this.lite;
        for (let i = 0; i < L.length; i++) L[i].el.style.setProperty("--d", lite ? 0 : Math.min(6, Math.abs(i - cur)));
        this._retarget();
      }
    }

    /** Where the scroller should rest so the current item sits at `anchor` (re-read while layout is animating). */
    _retarget() {
      const it = this.items[this.cur];
      this.target = !it ? 0 : Math.max(0, it.el.offsetTop - this.root.clientHeight * this.anchor);
      this.settle = now() + 800;   // bg vocals expand/collapse for ~450 ms and move everything below them
    }

    _scroll(dt) {
      if (now() < this.settle) this.target = (this.items[this.cur] ? Math.max(0, this.items[this.cur].el.offsetTop - this.root.clientHeight * this.anchor) : 0);
      if (now() < this.hold) return;
      const sc = this.root, diff = this.target - sc.scrollTop;
      if (Math.abs(diff) < 0.5) { this.snap = false; if (diff) sc.scrollTop = this.target; return; }
      if (this.snap || Math.abs(diff) > sc.clientHeight * 1.6) { this.snap = false; sc.scrollTop = this.target; return; }   // first placement / seek far away: no long fly-through
      sc.scrollTop += this.lite ? diff : diff * (1 - Math.exp(-dt * 7.5));
    }

    _onClick(e) {
      const n = e.target.closest && e.target.closest(".am-line, .am-break"); if (!n || !this.root.contains(n)) return;
      const it = this.items.find((x) => x.el === n); if (!it) return;
      if (this.onLineClick && this.onLineClick(it.src, n, e, it) === true) return;
      this.hold = 0;
      const t = Math.max(0, it.t - this.offset);
      if (this.onSeek) this.onSeek(t); else this.clock.sync(t, this.clock.playing);
      this.lastT = -1; // repaint everything on the next frame
    }

    start() {
      if (this.raf) return this;
      const f = (ts) => {
        if (this.opts.active && !this.opts.active()) { this.raf = 0; return; } // host says the screen is closed: idle
        this.raf = requestAnimationFrame(f);
        const dt = this._ts ? Math.min(0.1, (ts - this._ts) / 1000) : 0.016; this._ts = ts;
        if (dt > 0) this.fps += (1 / dt - this.fps) * 0.08;
        this.update(this.time()); this._scroll(dt);
      };
      this._ts = 0; this.snap = true;   // (re)opened: jump straight to the current line instead of gliding there from wherever the list was
      this.raf = requestAnimationFrame(f); return this;
    }
    stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; return this; }
    destroy() {
      this.stop(); if (this._ro) this._ro.disconnect();
      this.root.removeEventListener("click", this._click); this.root.removeEventListener("keydown", this._key);
      this.root.classList.remove("am-root", "am-lite", "am-duet"); this.root.textContent = "";
    }
  }

  AMLyrics.syllables = syllables; AMLyrics.normalize = normalize; AMLyrics.SyncClock = SyncClock; AMLyrics.popAt = popAt; AMLyrics.zoomAt = zoomAt;
  root.AMLyrics = AMLyrics; root.AMSyncClock = SyncClock;
  if (typeof module !== "undefined" && module.exports) module.exports = AMLyrics;
})(typeof window !== "undefined" ? window : globalThis);
