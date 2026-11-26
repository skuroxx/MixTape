const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const root = document.documentElement;
root.classList.add("js");
// Format tag beside the artist: only while audio plays through our own stream (not the YouTube iframe).
const codecStub = { set textContent(v) {
  const show = engine.active === streamEngine && /^(opus|aac|hq audio)$/i.test(String(v));
  [$("#fmt-tag"), $("#pc-fmt")].forEach((el) => {
    if (!el) return;
    el.hidden = !show;
    if (show) { el.textContent = /hq/i.test(v) ? "HQ" : v; el.dataset.f = String(v).toLowerCase(); }
  });
} };
const FMT = new Audio().canPlayType('audio/webm; codecs="opus"') ? "opus" : "aac";
const JSON_H = { "Content-Type": "application/json" };
const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* ---------------- settings ---------------- */
const DEF = { engine: "youtube", playerStyle: "coverflow", theme: "system", bold: false, hideNav: false, miniShape: "squircle", anim: "full", lite: false, fullArt: true, motionArt: true, blend: true, fluid: true, dynColors: true, quality: "auto", autoplay: true, fade: 0, speed: 1, keepPitch: true, eq: "flat", eqCustom: [0, 0, 0, 0, 0], lyricSource: "auto", lyricStrict: false, lyricWord: true };
const _savedSet = store("sv-settings");
const _isLowEnd = !_savedSet && (
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  matchMedia("(prefers-reduced-motion: reduce)").matches
);
const _isDesktopInit = !_savedSet && matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
let S = { ...DEF, ...(_isLowEnd ? { lite: true, anim: "reduced" } : {}), ...(_isDesktopInit ? { theme: "haze" } : {}), ...(_savedSet || {}) };
const EQP = { flat: [0, 0, 0, 0, 0], bass: [6, 3, 0, 0, 0], vocal: [-2, 0, 3, 3, 0], acoustic: [3, 1, 0, 2, 3], treble: [0, 0, 0, 3, 6] };
const FREQ = ["60 Hz", "230 Hz", "910 Hz", "3.6 kHz", "14 kHz"];
const SET = [
  { title: "Appearance", rows: [
    { k: "theme", t: "seg", label: "Theme", opts: [["system", "System"], ["haze", "Liquid Haze"], ["pc", "PC Studio"], ["amoled", "AMOLED"], ["dark", "Dark"], ["light", "Light"]] },
    { k: "bold", t: "tog", label: "Bold text", desc: "Thicker fonts everywhere, including lyrics" },
    { k: "hideNav", t: "tog", label: "Hide navigation tabs" },
    { k: "miniShape", t: "seg", label: "Mini player artwork", opts: [["squircle", "Squircle"], ["circle", "Circle"]] },
    { k: "playerStyle", t: "seg", label: "Player style", opts: [["coverflow", "Cover Flow"], ["classic", "Classic"]], note: () => "Cover Flow: swipe, scroll or use ← → to browse the queue. Classic: full-screen artwork." }] },
  { title: "Artwork", rows: [
    { k: "fullArt", t: "tog", label: "Full-screen artwork", desc: "Edge-to-edge cover in the player" },
    { k: "motionArt", t: "tog", label: "Animated artwork", desc: "Cover slowly drifts, zooms and shimmers while playing" },
    { k: "blend", t: "tog", label: "Gradient blur", desc: "Blend the cover's bottom into the background" },
    { k: "fluid", t: "tog", label: "Fluid lyrics background", desc: "Slowly rotating blurred artwork" },
    { k: "dynColors", t: "tog", label: "Colours from artwork", desc: "Tint the whole app to match the playing song" }] },
  { title: "Audio & playback", rows: [
    { k: "engine", t: "seg", label: "Audio source", opts: [["youtube", "YouTube player"], ["stream", "Direct stream"]] },
    { k: "quality", t: "seg", label: "Streaming quality", opts: [["auto", "Auto"], ["high", "High"], ["medium", "Normal"], ["low", "Data saver"]] },
    { k: "autoplay", t: "tog", label: "Autoplay similar songs", desc: "Keep playing when the queue ends" },
    { k: "fade", t: "rng", label: "Fade between songs", min: 0, max: 12, step: 1, fmt: (v) => (v ? v + " s" : "Off") },
    { k: "speed", t: "rng", label: "Playback speed", min: 0.5, max: 2, step: 0.05, fmt: (v) => (+v).toFixed(2) + "×" },
    { k: "keepPitch", t: "tog", label: "Keep pitch", desc: "Off: pitch changes with speed" },
    { k: "eq", t: "seg", label: "Equalizer", opts: [["flat", "Flat"], ["bass", "Bass"], ["vocal", "Vocal"], ["acoustic", "Acoustic"], ["treble", "Treble"], ["custom", "Custom"]] },
    { t: "eqs" }] },
  { title: "Lyrics", rows: [
    { k: "lyricSource", t: "seg", label: "Lyrics source", opts: () => [["auto", "Auto"], ...SRCS.filter((s) => s.available !== false).map((s) => [s.id, s.name])], note: () => { const s = SRCS.find((x) => x.id === S.lyricSource); return s ? `${s.kind === "word" ? "Word-by-word" : "Line-by-line"}${s.note ? ": " + s.note : ""}` : "Tries every source at once and uses the best match, word-by-word first."; } },
    { k: "lyricStrict", t: "tog", label: "Only use this source", desc: "Don't fall back to other sources if the chosen one has no lyrics" },
    { k: "lyricWord", t: "tog", label: "Prefer word-by-word in Auto", desc: "Off: line-synced sources are tried first" }] },
  { title: "Performance", rows: [
    { k: "anim", t: "seg", label: "Animations", opts: [["full", "Full"], ["reduced", "Reduced"], ["off", "Off"]] },
    { k: "lite", t: "tog", label: "Low-end device mode", desc: "No blur effects or moving backgrounds" }] },
];
let SRCS = [["betterlyrics", "BetterLyrics", "word"], ["lyricsplus", "LyricsPlus", "word"], ["paxsenix", "Apple Music (Paxsenix)", "word"], ["netease", "NetEase Cloud Music", "word"], ["karalyr", "Karalyr", "word"], ["lrclib", "LRCLIB", "line"], ["ytmusic", "YouTube Music", "line"], ["simpmusic", "SimpMusic", "line"], ["kugou", "KuGou", "line"]].map(([id, name, kind]) => ({ id, name, kind, note: "", available: id !== "karalyr" }));
async function loadSources() { try { SRCS = (await api("/api/lyrics/sources")).sources || SRCS; } catch (e) {} }
const setS = (k, v) => { S[k] = v; store("sv-settings", S); applySettings(); };

/* ---------------- helpers ---------------- */
let saved = [], playlists = [], lists = {}, homeSecs = [], meta = null, curatedPls = {}, albumMap = {}, virtualPl = null, pwaPrompt = null, pcPanelTab = "queue", pcPanelOpen = false;
let queue = [], hist = [], origList = [], uidc = 0, srcLabel = "Queue";
let shuffleOn = false, repeatMode = 0, curPl = null, libTab = "liked", extending = false;
let toastTimer, searchTimer, sgTimer, searchSeq = 0, playSeq = 0, lyrSeq = 0, curVol = 0.85;
try {
  if (localStorage.getItem("sv-art-v3") !== "1") {
    localStorage.removeItem("sv-art");
    localStorage.setItem("sv-art-v3", "1");
  }
} catch (e) {}
let artCache = store("sv-art") || {}, ST = store("sv-stats") || { sec: 0, plays: {}, artists: {} }, statDirty = false;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => { if (!Number.isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${r < 10 ? "0" : ""}${r}`; };
const hue = (s = "") => Math.abs([...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 360;
const vid = (u = "") => {
  if (!u) return "";
  const m = String(u).match(/(?:[?&]v=|youtu\.be\/|embed\/|\/v\/)([^&?#/]+)/);
  return m ? m[1] : String(u);
};
const first = (s) => String(s || "").split(/,|&| feat\.?| ft\.?| x /i)[0].trim();
const safeUrl = (u) => String(u).replace(/['"()\\\s]/g, (c) => encodeURIComponent(c));
const poster = (t) => (t && (artCache[vid(t.url || "")] || t.thumbnail)) || "";
const art = (t) => {
  const p = poster(t);
  if (p) return `background-image:url('${safeUrl(p)}')`;
  const h = hue(t && (t.title || t.name));
  return `background:linear-gradient(135deg,hsl(${h} 40% 32%),hsl(${(h + 50) % 360} 45% 16%))`;
};
const icon = (n, c = "") => `<svg class="i ${c}"><use href="#i-${n}"/></svg>`;
const isSaved = (t) => !!t && saved.some((s) => vid(s.url) === vid(t.url));
const isCur = (t) => !!meta && !!t && vid(t.url) === vid(meta.url);
const api = async (u, o) => { const r = await fetch(u, o); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Request failed"); return d; };
const slim = (t) => ({ url: t.url, title: t.title, uploader: t.uploader || "", thumbnail: poster(t), duration: t.duration || 0 });
const withUid = (t) => ({ ...t, uid: ++uidc });

/* ---------------- Cover Flow player (Settings → Appearance → Player style) ---------------- */
const CF = { cards: new Map(), w: 240, range: 3, drag: null, moved: false, wheelAt: 0 };
function cfLayout() {
  const cf = $("#cf"); if (!cf || !cf.clientWidth) return;
  CF.w = Math.round(Math.max(120, Math.min(cf.clientWidth * 0.62, cf.clientHeight / 1.3, 440)));
  cf.style.setProperty("--w", CF.w + "px");
}
function cfItems() {
  const out = [], seen = new Set(), add = (t, off) => { const k = vid(t.url); if (!seen.has(k)) { seen.add(k); out.push({ t, k, off }); } };
  queue.slice(0, CF.range + 1).forEach((t, i) => add(t, i));            // current first, so it always wins a duplicate
  const h = hist.slice(-CF.range); h.forEach((t, i) => add(t, i - h.length));
  return out;
}
function cfPose(off, w) {
  if (!off) return { tf: "translate3d(0,0,70px) rotateY(0deg) scale(1)", z: 20, op: 1, br: 1 };
  const a = Math.abs(off), s = off < 0 ? -1 : 1;
  return { tf: `translate3d(${s * w * (0.68 + 0.3 * (a - 1))}px,0,${-120 - 70 * (a - 1)}px) rotateY(${-s * 58}deg) scale(.94)`, z: 20 - a, op: Math.max(0.15, 1 - 0.2 * a), br: Math.max(0.3, 0.78 - 0.16 * (a - 1)) };
}
function cfRender() {
  const stage = $("#cf-stage"); if (!stage || S.playerStyle !== "coverflow") return;
  cfLayout();
  const items = cfItems(), keep = new Set(items.map((i) => i.k)), w = CF.w;
  CF.cards.forEach((el, k) => { if (!keep.has(k)) { el.classList.add("out"); CF.cards.delete(k); setTimeout(() => el.remove(), 600); } });
  items.forEach(({ t, k, off }) => {
    let el = CF.cards.get(k);
    if (!el) {
      el = document.createElement("div"); el.className = "cf-card"; el.innerHTML = '<div class="cf-art"></div>';
      const p0 = cfPose(off + (off > 0 ? 1 : -1), w); el.style.transition = "none"; el.style.transform = p0.tf; el.style.opacity = 0;
      stage.appendChild(el); void el.offsetWidth; el.style.transition = ""; CF.cards.set(k, el);
    }
    const st = art(t); if (el._st !== st) { el._st = st; el.firstChild.setAttribute("style", st); }
    const p = cfPose(off, w);
    el.style.transform = p.tf; el.style.opacity = p.op; el.style.filter = `brightness(${p.br})`; el.style.zIndex = p.z;
    el.dataset.off = off; el.classList.toggle("c", off === 0); el.title = t.title || "";
  });
}
function cfJump(off) {
  if (!off || !queue.length) return;
  if (off > 0) { off = Math.min(off, queue.length - 1); if (!off) return; for (let i = 0; i < off; i++) hist.push(queue.shift()); if (hist.length > 60) hist.splice(0, hist.length - 60); }
  else for (let i = 0; i < -off && hist.length; i++) queue.unshift(withUid(hist.pop()));
  startCurrent();
}
(function cfBind() {
  const cf = $("#cf"), stage = $("#cf-stage"); if (!cf) return;
  const steps = (dx) => Math.max(1, Math.min(CF.range, Math.round(Math.abs(dx) / (CF.w * 0.45)))) * (dx < 0 ? 1 : -1);
  cf.addEventListener("pointerdown", (e) => { if (e.button) return; CF.drag = { x: e.clientX, id: e.pointerId }; CF.moved = false; });
  cf.addEventListener("pointermove", (e) => {
    const d = CF.drag; if (!d) return; const dx = e.clientX - d.x;
    if (!CF.moved && Math.abs(dx) > 10) { CF.moved = true; stage.classList.add("drag"); try { cf.setPointerCapture(d.id); } catch (er) {} }
    if (CF.moved) stage.style.translate = `${dx * 0.35}px 0`;
  });
  const end = (e) => { const d = CF.drag; if (!d) return; CF.drag = null; stage.classList.remove("drag"); stage.style.translate = ""; const dx = e.clientX - d.x; if (CF.moved && Math.abs(dx) > 40) cfJump(steps(dx)); };
  cf.addEventListener("pointerup", end); cf.addEventListener("pointercancel", () => { CF.drag = null; CF.moved = false; stage.classList.remove("drag"); stage.style.translate = ""; });
  stage.addEventListener("click", (e) => {
    if (CF.moved) { CF.moved = false; return; }
    const c = e.target.closest(".cf-card"); if (!c) return;
    const off = +c.dataset.off; if (off) cfJump(off); else toggle();
  });
  cf.addEventListener("wheel", (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) < 18) return;
    e.preventDefault(); const n = Date.now(); if (n - CF.wheelAt < 450) return; CF.wheelAt = n; cfJump(d > 0 ? 1 : -1);
  }, { passive: false });
  document.addEventListener("keydown", (e) => {
    if (S.playerStyle !== "coverflow" || !$("#player").classList.contains("open") || $("#lyrics").classList.contains("open") || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowRight") cfJump(1); else if (e.key === "ArrowLeft") cfJump(-1);
  });
  if (window.ResizeObserver) new ResizeObserver(() => cfRender()).observe(cf);
})();
const dur = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`);
const paintRange = (el) => el.style.setProperty("--v", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");
function toast(msg) {
  const t = $("#status-msg"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ---------------- Audio Playback Engine (Native Audio + Web Audio API) ---------------- */
class AudioPlaybackEngine {
  constructor() {
    this.el = new Audio();
    this.el.preload = "none";
    this.el.crossOrigin = "anonymous";
    this.ctx = null;
    this.sourceNode = null;
    this.eqNodes = [];
    this.gainNode = null;
    this.analyser = null;
    this._listeners = {};
    this._bindNativeEvents();
  }

  _bindNativeEvents() {
    ["play", "pause", "ended", "timeupdate", "loadedmetadata", "waiting", "playing", "error"].forEach((ev) => {
      this.el.addEventListener(ev, (e) => {
        (this._listeners[ev] || []).forEach((fn) => fn(e));
      });
    });
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  initWebAudio() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.sourceNode = this.ctx.createMediaElementSource(this.el);
      this.eqNodes = [60, 230, 910, 3600, 14000].map((hz, i) => {
        const filter = this.ctx.createBiquadFilter();
        filter.type = i === 0 ? "lowshelf" : i === 4 ? "highshelf" : "peaking";
        filter.frequency.value = hz;
        filter.Q.value = 1;
        return filter;
      });
      this.gainNode = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;

      this.sourceNode.connect(this.eqNodes[0]);
      for (let i = 0; i < this.eqNodes.length - 1; i++) {
        this.eqNodes[i].connect(this.eqNodes[i + 1]);
      }
      this.eqNodes[this.eqNodes.length - 1].connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  resumeContext() {
    if (this.ctx && this.ctx.state === "suspended") {
      return this.ctx.resume().catch(() => {});
    }
  }

  setEQ(gains) {
    if (gains.some((g) => g !== 0) && !this.ctx) {
      this.initWebAudio();
    }
    if (this.ctx && this.eqNodes.length) {
      this.eqNodes.forEach((node, i) => {
        node.gain.setTargetAtTime(gains[i] || 0, this.ctx.currentTime, 0.015);
      });
      this.resumeContext();
    }
  }

  setVolume(val) {
    const v = Math.max(0, Math.min(1, val));
    if (this.ctx && this.gainNode) {
      this.el.volume = 1;
      this.gainNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
    } else {
      this.el.volume = v;
    }
  }

  setMuted(muted) {
    this.el.muted = !!muted;
  }

  get muted() {
    return this.el.muted;
  }

  setPlaybackRate(rate, preservePitch = true) {
    this.el.defaultPlaybackRate = this.el.playbackRate = rate;
    ["preservesPitch", "mozPreservesPitch", "webkitPreservesPitch"].forEach((k) => {
      if (k in this.el) this.el[k] = preservePitch;
    });
  }

  loadAndPlay(url, rate = 1) {
    this.resumeContext();
    this.el.src = url;
    this.el.playbackRate = rate;
    return this.el.play();
  }

  play() {
    this.resumeContext();
    return this.el.play();
  }

  pause() {
    this.el.pause();
  }

  seek(time) {
    if (Number.isFinite(this.el.duration)) {
      this.el.currentTime = Math.max(0, Math.min(this.el.duration, time));
    }
  }

  get currentTime() { return this.el.currentTime; }
  set currentTime(v) { this.el.currentTime = v; }
  get duration() { return this.el.duration; }
  get paused() { return this.el.paused; }
  get src() { return this.el.src; }
}

/* ---------------- YouTube iframe engine (ported from Musically) ----------------
   Same interface as AudioPlaybackEngine, but audio comes from a real YouTube <iframe> (IFrame Player API).
   The iframe lives in #yt-host, layered underneath the whole UI and never hidden with display:none or
   unmounted, so it keeps playing in the background while the cover art is what you see. It survives
   closing the player, switching tabs and opening sheets. */
class YouTubeIframeEngine {
  constructor(host) {
    this.host = host; this.p = null; this.frame = null; this.isReady = false; this.failed = false;
    this._boot = null; this._listeners = {}; this._pending = null;
    this._vid = ""; this._paused = true; this._playing = false; this._live = false; this._metaSent = false; this._endedFor = "";
    this._t = 0; this._at = 0; this._raw = 0; this._hold = 0; this._lastEmit = 0; this._lastT = 0;
    this._vol = 1; this._volSent = -1; this._muted = false; this._mutedSent = null; this._rate = 1;
    setInterval(() => this._poll(), 50);
  }

  on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); }
  _emit(event, arg) { (this._listeners[event] || []).forEach((fn) => fn(arg)); }
  _safe(name, ...args) { try { return this.p ? this.p[name](...args) : undefined; } catch (e) { return undefined; } }

  /* Creates the iframe once and binds the IFrame API to it. Rejects if YouTube is unreachable/blocked. */
  ready() {
    if (this._boot) return this._boot;
    this._boot = new Promise((resolve, reject) => {
      const frame = (this.frame = document.createElement("iframe"));
      frame.id = "yt-frame"; frame.title = "YouTube audio player"; frame.tabIndex = -1; frame.width = frame.height = 240;
      frame.allow = "autoplay; encrypted-media; picture-in-picture";
      // The page sets <meta name="referrer" content="no-referrer">; YouTube embeds need a referrer (error 153 otherwise).
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.src = "https://www.youtube.com/embed/?enablejsapi=1&playsinline=1&controls=0&disablekb=1&rel=0&iv_load_policy=3&origin=" + encodeURIComponent(location.origin);
      this.host.appendChild(frame);
      const make = () => {
        try {
          this.p = new YT.Player(frame, { events: {
            onReady: () => { this.isReady = true; this._applyVol(); resolve(); },
            onStateChange: (e) => this._onState(e.data),
            onError: (e) => this._onError(e.data),
          } });
        } catch (err) { reject(err); }
      };
      if (window.YT && YT.Player) make();
      else {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) prev(); make(); };
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api"; tag.onerror = () => reject(new Error("YouTube player is blocked"));
        document.head.appendChild(tag);
      }
      setTimeout(() => reject(new Error("YouTube player timed out")), 15000);
    });
    this._boot.catch(() => { this.failed = true; });
    return this._boot;
  }
  preload() { this.ready().catch(() => {}); }

  /* ---- player events -> HTMLAudioElement-style events ---- */
  _settle(ok, err) {
    const p = this._pending; if (!p) return;
    this._pending = null; clearTimeout(p.timer);
    if (ok) p.res(); else p.rej(err);
  }
  _onState(s) {
    if (s === 1) { // playing
      this._playing = true; this._paused = false; this._live = true;
      this._t = this._raw = this._safe("getCurrentTime") || 0; this._at = performance.now();
      this._applyRate();
      if (!this._metaSent) { this._metaSent = true; this._emit("loadedmetadata"); }
      this._settle(true);
      this._emit("play"); this._emit("playing");
    } else if (s === 2) { // paused
      this._playing = false; this._paused = true; this._emit("pause");
    } else if (s === 3) { // buffering
      this._playing = false; this._emit("waiting");
    } else if (s === 0) { // ended (HTMLAudio fires pause, then ended)
      this._fireEnded();
    } else if ((s === -1 || s === 5) && this._vid && !this._paused && this._pending == null && this._live) {
      // Browser (Brave, locked screen) left the next video cued instead of playing: nudge it.
      this._safe("playVideo");
    }
  }
  _fireEnded() { // fires "ended" once per video, whichever path detects it first
    if (this._endedFor === this._vid) return;
    this._endedFor = this._vid;
    this._playing = false; this._paused = true; this._emit("pause"); this._emit("ended");
  }
  _onError(code) {
    this._playing = false;
    const msg = ({ 2: "invalid video", 5: "player error", 100: "video unavailable", 101: "embedding disabled", 150: "embedding disabled", 153: "player configuration error" })[code] || "player error";
    if (this._pending) return this._settle(false, Object.assign(new Error(msg), { code }));
    this._paused = true; this._emit("pause"); this._emit("error", { ytError: code, message: msg });
  }

  /* ---- time: the IFrame API only reports position ~4x/second, so interpolate for smooth lyric sync ---- */
  _poll() {
    if (!this.isReady || !this._vid || !this._live) return;
    const now = performance.now(); if (now < this._hold) return;
    const raw = this._safe("getCurrentTime") || 0;
    const dur = this.duration;
    if (Number.isFinite(dur) && dur > 5 && raw >= dur - 0.3 && this._playing) { this._fireEnded(); return; }
    if (raw !== this._raw) { this._raw = raw; this._t = raw; this._at = now; }
    const t = this.currentTime;
    if (this._playing ? now - this._lastEmit >= 100 : Math.abs(t - this._lastT) > 0.01) { this._lastEmit = now; this._lastT = t; this._emit("timeupdate"); }
  }
  get currentTime() {
    if (!this._playing) return this._t;
    let t = this._t + ((performance.now() - this._at) / 1000) * (this._safe("getPlaybackRate") || 1);
    t = Math.min(t, this._t + 0.6); // never run far ahead of the last real report (stalls/buffering)
    const d = this.duration; return Number.isFinite(d) ? Math.min(t, d) : t;
  }
  set currentTime(v) {
    this._t = v; this._at = performance.now(); this._hold = this._at + 450; // ignore stale reports while the seek lands
    this._safe("seekTo", v, true); this._emit("timeupdate");
  }
  get duration() { const d = this._safe("getDuration"); return d > 0 ? d : NaN; }
  get paused() { return this._paused; }
  get src() { return this._vid ? "yt:" + this._vid : ""; }
  get muted() { return this._muted; }
  seek(time) { const d = this.duration; if (Number.isFinite(d)) this.currentTime = Math.max(0, Math.min(d, time)); }

  /* ---- controls ---- */
  _applyVol() {
    if (!this.isReady) return;
    const v = Math.round(this._vol * 100);
    if (v !== this._volSent) { this._volSent = v; this._safe("setVolume", v); }
    if (this._muted !== this._mutedSent) { this._mutedSent = this._muted; this._safe(this._muted ? "mute" : "unMute"); }
  }
  _applyRate() { // YouTube only supports fixed steps (0.25x increments); snap to the nearest
    if (!this.isReady) return;
    const av = this._safe("getAvailablePlaybackRates") || [1];
    const r = av.reduce((a, b) => (Math.abs(b - this._rate) < Math.abs(a - this._rate) ? b : a), av[0]);
    if (this._safe("getPlaybackRate") !== r) this._safe("setPlaybackRate", r);
  }
  setEQ() {} // cross-origin iframe audio can't be routed through Web Audio
  setVolume(v) { this._vol = Math.max(0, Math.min(1, v)); this._applyVol(); }
  setMuted(m) { this._muted = !!m; this._applyVol(); }
  setPlaybackRate(rate) { this._rate = rate; if (this._playing) this._applyRate(); }

  async loadAndPlay(id, rate = 1) {
    await this.ready();
    this._settle(false, Object.assign(new Error("superseded"), { code: "superseded" }));
    this._rate = rate; this._vid = id; this._endedFor = ""; this._paused = false; this._playing = false; this._live = false; this._metaSent = false;
    this._t = this._raw = 0; this._at = performance.now();
    this._applyVol();
    const self = this;
    return new Promise((res, rej) => {
      // If the browser blocks autoplay the video just stays cued: don't hang, let the user tap play.
      let retried = false;
      const timer = setTimeout(function fire() {
        if (self._pending && self._pending.timer === timer && !retried) { retried = true; self._safe("playVideo"); setTimeout(fire, 4000); return; }
        if (self._pending && self._pending.timer === timer) { self._pending = null; self._paused = true; rej(Object.assign(new Error("tap play to start"), { code: "blocked" })); }
      }, 6000);
      this._pending = { res, rej, timer };
      this._safe("loadVideoById", id);
    });
  }
  play() { this._paused = false; this._safe("playVideo"); return Promise.resolve(); }
  pause() { this._paused = true; this._safe("pauseVideo"); }
  stop() { this._settle(false, Object.assign(new Error("superseded"), { code: "superseded" })); this._safe("stopVideo"); this._vid = ""; this._playing = false; this._paused = true; this._live = false; }
  videoData() { const d = this._safe("getVideoData") || {}; return { title: d.title || "", author: d.author || "" }; }
}

/* Routes the app's single `engine` to whichever backend is active (YouTube iframe or direct stream). */
class PlaybackRouter {
  constructor(stream, yt) {
    this.stream = stream; this.yt = yt; this.active = stream; this._listeners = {};
    ["play", "pause", "ended", "timeupdate", "loadedmetadata", "waiting", "playing", "error"].forEach((ev) => {
      [stream, yt].forEach((eng) => eng.on(ev, (e) => { if (eng === this.active) (this._listeners[ev] || []).forEach((fn) => fn(e)); }));
    });
  }
  on(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  use(kind) {
    const next = kind === "youtube" ? this.yt : this.stream;
    if (next === this.active) return;
    const old = this.active; this.active = next; // switch first so late events from the old engine are dropped
    if (old === this.yt) old.stop(); else old.pause();
  }
  setEQ(g) { this.stream.setEQ(g); }
  setVolume(v) { this.stream.setVolume(v); this.yt.setVolume(v); }
  setMuted(m) { this.stream.setMuted(m); this.yt.setMuted(m); }
  setPlaybackRate(r, keepPitch) { this.stream.setPlaybackRate(r, keepPitch); this.yt.setPlaybackRate(r); }
  loadAndPlay(src, rate) { return this.active.loadAndPlay(src, rate); }
  play() { return this.active.play(); }
  pause() { return this.active.pause(); }
  seek(t) { return this.active.seek(t); }
  get muted() { return this.active.muted; }
  get currentTime() { return this.active.currentTime; }
  set currentTime(v) { this.active.currentTime = v; }
  get duration() { return this.active.duration; }
  get paused() { return this.active.paused; }
  get src() { return this.active.src; }
}

const streamEngine = new AudioPlaybackEngine();
const ytEngine = new YouTubeIframeEngine($("#yt-host"));
const engine = new PlaybackRouter(streamEngine, ytEngine);

function applyEQ() {
  const g = S.eq === "custom" ? S.eqCustom : EQP[S.eq] || EQP.flat;
  engine.setEQ(g);
}
function applyVol() {
  let f = 1;
  if (S.fade > 0 && Number.isFinite(engine.duration)) {
    f = Math.max(0, Math.min(1, engine.currentTime / S.fade + 0.05, (engine.duration - engine.currentTime) / S.fade));
  }
  engine.setVolume(curVol * f);
}

/* ---------------- theme from the playing cover ---------------- */
let themeUrl = null; const themeCache = {};
const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, s = 0; if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; } return [h, s, l]; };
const THEME_VARS = ["--c1", "--c2", "--c3", "--acc", "--onacc", "--cont", "--oncont"];
function resetTheme() { THEME_VARS.forEach((v) => root.style.removeProperty(v)); themeUrl = null; }
function applyTheme(h1, s1, h2) {
  const r = root.style, s = Math.round(Math.min(85, Math.max(35, s1 * 100)));
  r.setProperty("--c1", `hsl(${h1} ${s}% 44%)`); r.setProperty("--c2", `hsl(${h2} ${Math.max(40, s - 10)}% 36%)`); r.setProperty("--c3", `hsl(${h1} 45% 8%)`);
  r.setProperty("--acc", `hsl(${h1} ${Math.max(55, s)}% 79%)`); r.setProperty("--onacc", `hsl(${h1} 60% 13%)`);
  r.setProperty("--cont", `hsl(${h1} 42% 24%)`); r.setProperty("--oncont", `hsl(${h1} 100% 93%)`);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = `hsl(${h1} 45% 8%)`;
}
async function themeFrom(url) {
  if (!S.dynColors || !url || url === themeUrl) return;
  themeUrl = url;
  if (themeCache[url]) return applyTheme(...themeCache[url]);
  try {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = `/api/art?u=${encodeURIComponent(url)}`; await img.decode();
    if (url !== themeUrl) return;
    const cv = document.createElement("canvas"); cv.width = cv.height = 32; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, 32, 32);
    const px = cx.getImageData(0, 0, 32, 32).data, B = Array.from({ length: 12 }, () => ({ w: 0, s: 0, h: 0 }));
    for (let i = 0; i < px.length; i += 4) {
      const [h, s, l] = hsl(px[i], px[i + 1], px[i + 2]); if (s < 0.22 || l < 0.14 || l > 0.88) continue;
      const w = s * (1 - Math.abs(l - 0.5) * 1.4), k = Math.floor(h / 30) % 12; B[k].w += w; B[k].s += s * w; B[k].h += h * w;
    }
    const top = B.map((b, k) => ({ ...b, k })).filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
    let res;
    if (!top.length) { resetTheme(); return; }
    else { const a = top[0], h1 = a.h / a.w, o = top.find((b) => { const d = Math.abs(b.h / b.w - h1); return Math.min(d, 360 - d) > 35; }); res = [Math.round(h1), a.s / a.w, Math.round(o ? o.h / o.w : (h1 + 45) % 360)]; }
    themeCache[url] = res; applyTheme(...res);
  } catch (e) {}
}

/* ---------------- apply settings ---------------- */
function applySettings() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = S.theme === "system" ? (dark ? "amoled" : "light") : S.theme;
  const c = root.classList;
  c.toggle("bold", S.bold); c.toggle("hide-nav", S.hideNav); c.toggle("mini-circle", S.miniShape === "circle"); c.toggle("lite", S.lite);
  c.toggle("anim-off", S.anim === "off"); c.toggle("anim-reduced", S.anim === "reduced" || S.lite);
  c.toggle("cf-on", S.playerStyle === "coverflow"); c.toggle("no-fullart", !S.fullArt); c.toggle("no-motion", !S.motionArt); c.toggle("no-blend", !S.blend); c.toggle("no-fluid", !S.fluid);
  engine.setPlaybackRate(+S.speed, S.keepPitch);
  applyEQ(); applyVol();
  if (!S.dynColors) resetTheme(); else if (meta && poster(meta)) { themeUrl = null; themeFrom(poster(meta)); }
  $("#auto-btn") && $("#auto-btn").classList.toggle("on", S.autoplay);
  placeLens(); cfRender();
  if (typeof aml !== "undefined") aml.setFx(lyrFx());
  if (typeof pcAml !== "undefined" && pcAml) pcAml.setFx(lyrFx());
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);

function setRow(r) {
  if (r.t === "eqs") return `<div class="srow col"><div class="eqs">${S.eqCustom.map((v, i) => `<label>${FREQ[i]}<input type="range" data-eqb="${i}" min="-12" max="12" step="1" value="${S.eq === "custom" ? v : (EQP[S.eq] || EQP.flat)[i]}" /></label>`).join("")}</div></div>`;
  const v = S[r.k];
  if (r.t === "tog") return `<div class="srow"><div><b>${r.label}</b>${r.desc ? `<span>${r.desc}</span>` : ""}</div><button class="tog${v ? " on" : ""}" data-tog="${r.k}" role="switch" aria-checked="${!!v}"><i></i></button></div>`;
  if (r.t === "seg") { const opts = typeof r.opts === "function" ? r.opts() : r.opts; return `<div class="srow col"><div><b>${r.label}</b>${r.note ? `<span>${esc(r.note())}</span>` : ""}</div><div class="seg" data-segs="${r.k}">${opts.map(([val, l]) => `<button class="${v === val ? "on" : ""}" data-seg="${r.k}" data-v="${val}">${esc(l)}</button>`).join("")}</div></div>`; }
  if (r.t === "rng") return `<div class="srow col"><div><b>${r.label}</b><em id="rv-${r.k}">${r.fmt(v)}</em></div><input type="range" data-rng="${r.k}" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" /></div>`;
  return "";
}
function renderSettings() {
  const curName = getName() || "MixTape";
  const profileCard = `<div class="card-sec glass set-card"><h4>Profile</h4><div class="srow"><div><b>Display name</b><span>Shown in your sidebar and home greeting: <strong style="color:var(--text)">${esc(curName)}</strong></span></div><button class="pill sm glass" data-changename>${icon("edit")}Change</button></div></div>`;
  const pwaCard = pwaPrompt ? `<div class="card-sec glass set-card"><h4>App & PWA</h4><div class="srow"><div><b>Install MixTape</b><span>Install as a standalone app for faster launch and better background playback.</span></div><button class="pill pill-acc sm" data-pwainstall>${icon("install")}Install</button></div></div>` : "";
  $("#settings-body").innerHTML = profileCard + pwaCard + SET.map((sec) => `<div class="card-sec glass set-card"><h4>${sec.title}</h4>${sec.rows.map(setRow).join("")}</div>`).join("") +
    `<div class="card-sec glass set-card"><h4>Import & playlists</h4><div class="srow col"><div><b>Import a playlist</b><span>Paste a YouTube Music or Spotify playlist link. It becomes one of your playlists.</span></div><div class="imp"><input id="imp-url" type="text" placeholder="https://open.spotify.com/playlist/…" /><button class="pill pill-acc sm" data-import>Import</button></div></div><div class="srow"><div><b>Your playlists</b><span id="pl-count">${playlists.length} playlist${playlists.length === 1 ? "" : "s"}</span></div><button class="pill sm glass" data-newpl>${icon("plus")}New</button></div></div>`;
  $$("#settings-body input[type=range]").forEach(paintRange);
}
document.addEventListener("input", (e) => {
  const r = e.target.closest("[data-rng]"), q = e.target.closest("[data-eqb]");
  if (r) { const row = SET.flatMap((s) => s.rows).find((x) => x.k === r.dataset.rng); const v = +r.value; setS(r.dataset.rng, v); $("#rv-" + r.dataset.rng).textContent = row.fmt(v); paintRange(r); }
  if (q) { const arr = S.eq === "custom" ? [...S.eqCustom] : [...(EQP[S.eq] || EQP.flat)]; arr[+q.dataset.eqb] = +q.value; S.eqCustom = arr; S.eq = "custom"; store("sv-settings", S); applyEQ(); paintRange(q); $$("[data-seg=eq]").forEach((b) => b.classList.toggle("on", b.dataset.v === "custom")); }
});

/* ---------------- navigation, lens, dock ---------------- */
const NAVV = ["home", "stats", "library"], VT = { home: "Home", stats: "Stats", library: "Library", search: "Search", queue: "Queue", settings: "Settings", playlist: "Playlist" };
let stack = ["home"], curView = "home";
function placePcLens(animate = true) {
  const lens = $("#pc-nav-lens"), active = $("#pc-nav-sec .pc-nav-item.active");
  if (!lens) return;
  if (!active || innerWidth < 960) { lens.classList.add("off"); return; }
  lens.classList.remove("off");
  if (!animate) lens.style.transition = "none";
  lens.style.height = active.offsetHeight + "px";
  lens.style.transform = `translate3d(0, ${active.offsetTop}px, 0)`;
  if (!animate) { lens.offsetHeight; lens.style.transition = ""; }
}
function placeLens() {
  placePcLens(false);
  if (innerWidth >= 960) return; // mobile nav is hidden on PC — skip layout reads
  const lens = $("#lens"), b = $("#nav button.active");
  if (!lens) return;
  if (!b) { lens.classList.add("off"); return; }
  lens.classList.toggle("off", !NAVV.includes(curView));
  lens.style.left = b.offsetLeft + "px"; lens.style.top = b.offsetTop + "px"; lens.style.width = b.offsetWidth + "px"; lens.style.height = b.offsetHeight + "px";
}
function lensLoop(ms = 650) {
  placePcLens(true);
  if (innerWidth >= 960) return; // avoid 750ms RAF loop on PC where mobile #nav is hidden
  const lens = $("#lens");
  if (lens) { lens.style.transform = "scale(1.06, 0.96)"; setTimeout(() => { if (lens) lens.style.transform = ""; }, 220); }
  const end = performance.now() + ms;
  const f = () => { placeLens(); if (performance.now() < end) requestAnimationFrame(f); };
  f();
}
function show(v, dir = 1) {
  $$(".view").forEach((el) => { const on = el.id === "v-" + v; if (on) el.style.setProperty("--sx", dir * 38 + "px"); el.classList.toggle("active", on); });
  curView = v;
  const activeNav = NAVV.includes(v) ? v : "home";
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === activeNav));
  $("#view-title").textContent = v === "playlist" ? ((virtualPl && virtualPl.name) || (playlists.find((p) => p.id === curPl) || {}).name || "Playlist") : VT[v];
  $("#back-btn").classList.toggle("hidden", NAVV.includes(v));
  $$("[data-pcnav]").forEach((b) => b.classList.toggle("active", b.dataset.pcnav === v));
  if (v === "stats") renderStats(); if (v === "settings") renderSettings(); if (v === "queue") renderQueue(); if (v === "library") renderLibrary();
  scrollTo({ top: 0 }); document.body.classList.remove("docked"); lensLoop();
}
function navTo(v) { const from = NAVV.indexOf(stack[stack.length - 1]); const dir = from < 0 ? -1 : Math.sign(NAVV.indexOf(v) - from) || 1; stack = [v]; show(v, dir); }
function push(v) { if (curView === v) return; stack.push(v); show(v, 1); }
function back() { if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1], -1); } }
(() => {
  const nav = $("#nav"), lens = $("#lens");
  let slide = null, suppressClick = false;

  nav.addEventListener("pointerdown", (e) => {
    if (e.button && e.button !== 0) return;
    if (document.body.classList.contains("docked")) return;
    const btns = $$("#nav button");
    if (!btns.length) return;
    const isVert = innerWidth >= 900;
    const rect = nav.getBoundingClientRect();
    slide = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      isVert,
      rect,
      btns,
      hoverView: curView
    };
    nav.setPointerCapture(e.pointerId);
  });

  nav.addEventListener("pointermove", (e) => {
    if (!slide || e.pointerId !== slide.id) return;
    const dx = e.clientX - slide.x0, dy = e.clientY - slide.y0;
    if (!slide.moved && Math.hypot(dx, dy) < 8) return;
    slide.moved = true;
    lens.classList.add("dragging");
    lens.classList.remove("off");

    const vx = e.clientX - slide.lastX, vy = e.clientY - slide.lastY;
    slide.lastX = e.clientX; slide.lastY = e.clientY;
    const vel = Math.min(18, Math.hypot(vx, vy));
    const stretch = 1 + vel * 0.012;
    const squash = 1 - vel * 0.006;

    // Find closest tab button under pointer
    let best = slide.btns[0], bestDist = Infinity;
    slide.btns.forEach((b) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dist = slide.isVert ? Math.abs(e.clientY - cy) : Math.abs(e.clientX - cx);
      if (dist < bestDist) { bestDist = dist; best = b; }
    });

    if (best && best.dataset.view !== slide.hoverView) {
      slide.hoverView = best.dataset.view;
      slide.btns.forEach((b) => b.classList.toggle("active", b === best));
    }

    const activeBtn = $("#nav button.active") || best;
    const w = activeBtn.offsetWidth, h = activeBtn.offsetHeight;
    if (slide.isVert) {
      const maxTop = nav.clientHeight - h - 8;
      const rawTop = e.clientY - slide.rect.top - h / 2;
      lens.style.left = activeBtn.offsetLeft + "px";
      lens.style.top = Math.max(8, Math.min(maxTop, rawTop)) + "px";
      lens.style.width = w + "px";
      lens.style.height = h + "px";
      lens.style.transform = `scale(${squash}, ${stretch})`;
    } else {
      const maxLeft = nav.clientWidth - w - 7;
      const rawLeft = e.clientX - slide.rect.left - w / 2;
      lens.style.left = Math.max(7, Math.min(maxLeft, rawLeft)) + "px";
      lens.style.top = activeBtn.offsetTop + "px";
      lens.style.width = w + "px";
      lens.style.height = h + "px";
      lens.style.transform = `scale(${stretch}, ${squash})`;
    }
  });

  const endSlide = (e) => {
    if (!slide || e.pointerId !== slide.id) return;
    const wasMoved = slide.moved, targetView = slide.hoverView;
    slide = null;
    lens.classList.remove("dragging");
    lens.style.transform = "";
    if (wasMoved) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 50);
      document.body.classList.remove("docked");
      if (targetView && targetView !== curView) navTo(targetView);
      else lensLoop(400);
    }
  };

  nav.addEventListener("pointerup", endSlide);
  nav.addEventListener("pointercancel", endSlide);

  nav.addEventListener("click", (e) => {
    if (suppressClick) { e.stopPropagation(); return; }
    const b = e.target.closest("button"); if (!b) return;
    if (document.body.classList.contains("docked") && NAVV.includes(curView)) { document.body.classList.remove("docked"); lensLoop(); return; }
    document.body.classList.remove("docked");
    navTo(b.dataset.view);
  });
})();
$("#back-btn").onclick = back;
$("#account-btn").onclick = () => push("settings");
$("#search-btn").onclick = openSearch;
let lastY = 0;
addEventListener("scroll", () => {
  const y = scrollY, d = y - lastY;
  $("#topbar").classList.toggle("scrolled", y > 20);
  if (innerWidth < 900 && !S.hideNav) { if (Math.abs(d) > 10) { document.body.classList.toggle("docked", d > 0 && y > 90); lastY = y; lensLoop(); } if (y < 60 && document.body.classList.contains("docked")) { document.body.classList.remove("docked"); lensLoop(); } }
}, { passive: true });
addEventListener("resize", placeLens);

/* bouncy entrance for list items */
const io = new IntersectionObserver((es) => {
  let n = 0;
  es.forEach((e) => { if (!e.isIntersecting) return; const el = e.target; el.style.transitionDelay = Math.min(n++ * 45, 320) + "ms"; el.classList.add("in"); io.unobserve(el); setTimeout(() => (el.style.transitionDelay = ""), 1000); });
}, { threshold: 0.05, rootMargin: "0px 0px -4% 0px" });
const popIn = (scope = document) => scope.querySelectorAll(".pop:not(.in)").forEach((el) => io.observe(el));

/* ---------------- renderers ---------------- */
const row = (t, i, l) => `<div class="row pop${isCur(t) ? " active" : ""}" data-l="${l}" data-i="${i}"><div class="art" style="${art(t)}"></div><div class="t" title="${esc(t.title)}"><b>${esc(t.title)}</b><span>${esc(t.uploader || "")}${t.duration ? " • " + fmt(t.duration) : ""}</span></div><button class="sv${isSaved(t) ? " on" : ""}" data-sv data-l="${l}" data-i="${i}" title="Like">${icon("heart")}</button><button class="del" data-more data-l="${l}" data-i="${i}" title="More">${icon("more")}</button></div>`;
const card = (t, i, l) => `<div class="pcard pop" data-l="${l}" data-i="${i}"><div class="art" style="${art(t)}"><span class="pc-play"><svg class="i" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div><b title="${esc(t.title)}">${esc(t.title)}</b><span>${esc(t.uploader || "")}</span></div>`;
const acard = (a) => `<div class="acard pop" data-artist="${esc(a.name)}"><div class="art" style="${art(a)}"></div><b>${esc(a.name)}</b><span>Artist</span></div>`;
const plcard = (p, attr) => `<div class="pcard plcard pop" ${attr}="${esc(p.id)}"><div class="art" style="${art(p.tracks && p.tracks[0] ? p.tracks[0] : p)}"><span class="pl-badge">${(p.tracks || []).length} songs</span><span class="pc-play"><svg class="i" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div><b title="${esc(p.name)}">${esc(p.name)}</b><span>${esc(p.subtitle || `${(p.tracks || []).length} songs`)}</span></div>`;
const albcard = (a) => {
  const key = a.browseId || a.id || ("alb_" + a.title);
  albumMap[key] = a;
  const sub = [a.artist, a.year].filter(Boolean).join(" • ") || a.kind || "Album";
  return `<div class="pcard plcard albcard pop" data-album="${esc(key)}"><div class="art" style="${art(a)}"><span class="pl-badge">${esc(a.kind || "Album")}</span><span class="pc-play"><svg class="i" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div><b title="${esc(a.title)}">${esc(a.title)}</b><span>${esc(sub)}</span></div>`;
};
const hs = (arr, k) => `<div class="hscroll">${arr.map((t, i) => card(t, i, k)).join("")}</div>`;
const shelf = (title, sub, inner, shuf) => `<div class="card-sec glass"><div class="sec-head"><div><h4>${esc(title)}</h4><p>${esc(sub)}</p></div><div class="sec-tools">${/class="[^"]*\bhscroll\b/.test(inner) ? `<button class="cbtn sm hs" data-hs="-1" style="--r:90deg" title="Scroll left">${icon("down")}</button><button class="cbtn sm hs" data-hs="1" style="--r:-90deg" title="Scroll right">${icon("down")}</button>` : ""}${shuf ? `<button class="cbtn acc" data-shuf="${shuf}" title="Shuffle play">${icon("shuffle")}</button>` : ""}</div></div>${inner}</div>`;
const getRecent = () => store("sv-recent") || [];
const GENRES = [["Pop", 330], ["Rock", 12], ["Hip Hop", 38], ["Indie", 150], ["Electronic", 190], ["R&B", 280], ["Metal", 0], ["Jazz", 45], ["Classical", 210], ["Country", 28], ["K-pop", 320], ["Punjabi", 55], ["Bollywood", 8], ["Lo-fi", 200]];
const renderGenres = () => { $("#genres").innerHTML = GENRES.map(([n]) => `<button class="gchip pop" data-genre="${esc(n)}">${esc(n)}</button>`).join(""); popIn($("#genres")); };

function renderHome() {
  const parts = [], all = [], rec = getRecent();
  curatedPls = {};
  if (rec.length) { lists.recent = rec; parts.push(shelf("Listen again", "From your listening history", hs(rec, "recent"), "recent")); }
  if (playlists.length) {
    parts.push(shelf("Your playlists", "Jump back into your mixes", `<div class="hscroll">${playlists.map((p) => plcard(p, "data-pl")).join("")}</div>`));
  }
  homeSecs.forEach((s, n) => {
    const k = "h" + n;
    if (s.kind === "artists") { parts.push(shelf(s.title, s.subtitle, `<div class="hscroll">${s.tracks.map(acard).join("")}</div>`)); return; }
    if (s.kind === "playlists") {
      s.tracks.forEach((p) => { curatedPls[p.id] = p; });
      parts.push(shelf(s.title, s.subtitle, `<div class="hscroll">${s.tracks.map((p) => plcard(p, "data-cpl")).join("")}</div>`));
      return;
    }
    lists[k] = s.tracks; all.push(...s.tracks);
    parts.push(shelf(s.title, s.subtitle, s.kind === "list" ? `<div class="rows cols hscroll qp">${s.tracks.map((t, i) => row(t, i, k)).join("")}</div>` : hs(s.tracks, k), k));
  });
  lists.all = all;
  $("#home-sections").innerHTML = parts.join("") || `<p class="empty">Couldn't load suggestions. Check your connection and reload.</p>`;
  renderTiles(); popIn($("#home-sections"));
}
function renderTiles() {
  const src = saved.length ? saved : getRecent();
  lists.tiles = src.slice(0, 6);
  $("#tiles").innerHTML = lists.tiles.map((t, i) => `<div class="tile glass pop" data-l="tiles" data-i="${i}"><div class="art" style="${art(t)}"></div><b>${esc(t.title)}</b></div>`).join("");
  popIn($("#tiles"));
}
function renderLibrary() {
  $$("#lib-seg button").forEach((b) => b.classList.toggle("on", b.dataset.lib === libTab));
  const b = $("#lib-body");
  if (libTab === "liked") {
    lists.saved = saved;
    b.innerHTML = saved.length ? `<div class="qbar"><button class="pill pill-acc sm" data-libplay>${icon("play")}Play</button><button class="pill sm glass" data-libshuf>${icon("shuffle")}Shuffle</button></div><div class="rows glass-list" style="margin-top:16px">${saved.map((t, i) => row(t, i, "saved")).join("")}</div>` : `<p class="empty">Nothing liked yet. Tap the heart on any song.</p>`;
  } else {
    b.innerHTML = `<div class="qbar"><button class="pill pill-acc sm" data-newpl>${icon("plus")}New playlist</button><button class="pill sm glass" data-gosettings>Import from link</button></div>` +
      (playlists.length ? `<div class="plgrid">${playlists.map((p) => `<div class="plc pop" data-pl="${p.id}"><div class="art" style="${art(p.tracks[0])}"></div><b>${esc(p.name)}</b><span>${p.tracks.length} songs</span></div>`).join("")}</div>` : `<p class="empty">No playlists yet. Create one, or import a Spotify / YouTube Music link.</p>`);
  }
  popIn(b);
}
function renderPlaylist() {
  const p = virtualPl || playlists.find((x) => x.id === curPl); if (!p) { back(); return; }
  lists.pl = p.tracks || [];
  $("#view-title").textContent = p.name;
  const isVirt = Boolean(virtualPl);
  const cover = p.thumbnail || (lists.pl[0] ? poster(lists.pl[0]) : "");
  const badge = p.kind || (isVirt ? "Collection" : "Playlist");
  const artistLink = p.artist ? `<button class="alb-artist-link" data-artist="${esc(p.artist)}" type="button">${esc(p.artist)}</button>` : "";
  const metaParts = [artistLink, p.year ? esc(p.year) : "", `${lists.pl.length} song${lists.pl.length === 1 ? "" : "s"}`].filter(Boolean);
  const subHtml = p.artist ? metaParts.join(" • ") : (p.subtitle ? `${esc(p.subtitle)} • ${lists.pl.length} songs` : `${lists.pl.length} songs`);
  const actionBtn = isVirt
    ? `<button class="pill sm glass" data-plsave>${icon("plus")}Save playlist</button>`
    : `<button class="pill sm glass" data-pldel>${icon("trash")}Delete</button>`;

  const heroHtml = `<div class="alb-hero glass">
    <div class="art alb-cover" style="${cover ? `background-image:url('${esc(cover)}')` : ""}"></div>
    <div class="alb-meta">
      <span class="alb-kind">${esc(badge)}</span>
      <h2>${esc(p.name)}</h2>
      <p class="alb-sub">${subHtml}</p>
      <div class="qbar">
        <button class="pill pill-acc sm" data-plplay>${icon("play")}Play</button>
        <button class="pill sm glass" data-plshuf>${icon("shuffle")}Shuffle</button>
        ${actionBtn}
      </div>
    </div>
  </div>`;

  const albumsHtml = p.albums && p.albums.length
    ? shelf("Albums & Singles", `Releases by ${p.name}`, `<div class="hscroll">${p.albums.map(albcard).join("")}</div>`)
    : "";

  const tracksHtml = lists.pl.length
    ? `<div class="rows glass-list" style="margin-top:16px">${lists.pl.map((t, i) => row(t, i, "pl")).join("")}</div>`
    : `<p class="empty">${p.loading ? "Loading songs…" : (isVirt ? "No songs found." : "Empty playlist. Use ⋯ on any song to add it here.")}</p>`;

  $("#pl-body").innerHTML = heroHtml + albumsHtml + tracksHtml;
  popIn($("#pl-body"));
}

async function openAlbumView(a) {
  if (!a) return;
  const reqId = "alb_" + Date.now();
  virtualPl = {
    reqId,
    id: a.browseId || a.id || reqId,
    name: a.title || a.name || "Album",
    artist: a.artist || "",
    year: a.year || "",
    kind: a.kind || "Album",
    thumbnail: a.thumbnail || "",
    tracks: [],
    loading: true,
  };
  curPl = null;
  renderPlaylist();
  if (curView !== "playlist") push("playlist");
  try {
    const qs = new URLSearchParams();
    if (a.browseId || a.id) qs.set("id", a.browseId || a.id);
    if (a.title || a.name) qs.set("title", a.title || a.name);
    if (a.artist) qs.set("artist", a.artist);
    const d = await api(`/api/album?${qs}`);
    if (virtualPl && virtualPl.reqId === reqId) {
      virtualPl.name = (d.title && d.title !== "Album") ? d.title : virtualPl.name;
      virtualPl.artist = (d.artist && d.artist !== "Various Artists") ? d.artist : virtualPl.artist;
      virtualPl.year = d.year || virtualPl.year;
      virtualPl.thumbnail = d.thumbnail || virtualPl.thumbnail;
      virtualPl.tracks = d.tracks || [];
      virtualPl.loading = false;
      renderPlaylist();
    }
  } catch (e) {
    if (virtualPl && virtualPl.reqId === reqId) {
      virtualPl.loading = false;
      renderPlaylist();
    }
    toast("Couldn't load album songs");
  }
}

async function openArtistView(name) {
  const reqId = "art_" + Date.now();
  virtualPl = { reqId, id: "artist_" + name, name, kind: "Artist", subtitle: "Top songs & albums", tracks: [], albums: [], loading: true };
  curPl = null;
  renderPlaylist();
  if (curView !== "playlist") push("playlist");
  try {
    const d = await api(`/api/search?q=${encodeURIComponent(name)}&n=18`);
    if (virtualPl && virtualPl.reqId === reqId) {
      virtualPl.tracks = d.tracks || [];
      virtualPl.albums = d.albums || [];
      if (!virtualPl.thumbnail && virtualPl.tracks[0]) virtualPl.thumbnail = poster(virtualPl.tracks[0]);
      virtualPl.loading = false;
      renderPlaylist();
    }
  } catch (e) {
    if (virtualPl && virtualPl.reqId === reqId) { virtualPl.loading = false; renderPlaylist(); }
    toast("Couldn't load artist tracks");
  }
}
function renderPcSidebarLib() {
  const cnt = $("#pc-liked-cnt");
  if (cnt) cnt.textContent = String(saved.length);
  const plBox = $("#pc-pl-list");
  if (!plBox) return;
  plBox.innerHTML = playlists.length
    ? playlists.map((p) => `<button class="pc-pl-item" data-pl="${esc(p.id)}" title="${esc(p.name)}"><span class="pc-pl-dot" style="${art(p.tracks[0])}"></span><span>${esc(p.name)}</span><em>${p.tracks.length}</em></button>`).join("")
    : `<p class="pc-pl-empty">No playlists yet</p>`;
}
function renderPcPanel() {
  const qBox = $("#pc-panel-queue"), lBox = $("#pc-panel-lyrics");
  if (!qBox || !lBox) return;
  $$("#pc-pseg button").forEach((b) => b.classList.toggle("on", b.dataset.pcp === pcPanelTab));
  $("#pc-btn-queue") && $("#pc-btn-queue").classList.toggle("on", pcPanelOpen && pcPanelTab === "queue");
  $("#pc-btn-lyrics") && $("#pc-btn-lyrics").classList.toggle("on", pcPanelOpen && pcPanelTab === "lyrics");
  qBox.classList.toggle("hidden", pcPanelTab !== "queue");
  lBox.classList.toggle("hidden", pcPanelTab !== "lyrics");
  if (!queue.length) {
    qBox.innerHTML = `<p class="empty">Queue is empty. Play any song or album to start.</p>`;
  } else {
    const now = queue[0], up = queue.slice(1);
    qBox.innerHTML = `<div class="qsec">Now playing</div><div class="rows"><div class="row qrow now"><div class="art" style="${art(now)}"></div><div class="t"><b>${esc(now.title)}</b><span>${esc(now.uploader || "")}</span></div></div></div>` +
      (up.length ? `<div class="qsec">Up next (${up.length})</div><div class="rows">${up.map((t, i) => `<div class="row qrow" data-qj="${i + 1}"><div class="art" style="${art(t)}"></div><div class="t"><b>${esc(t.title)}</b><span>${esc(t.uploader || "")}</span></div><button class="del" data-qrm="${i + 1}" title="Remove">${icon("close")}</button></div>`).join("")}</div>` : `<p class="empty">Nothing up next.</p>`);
  }
  if (typeof pcAml !== "undefined" && pcAml) {
    if (pcPanelOpen && pcPanelTab === "lyrics" && lyr.lines && lyr.lines.length) pcAml.start();
    else pcAml.stop();
  }
}
function setPcPanel(open, tab) {
  if (tab) pcPanelTab = tab;
  pcPanelOpen = open;
  document.body.classList.toggle("pc-panel-open", pcPanelOpen);
  $("#pc-panel-btn") && $("#pc-panel-btn").classList.toggle("on", pcPanelOpen);
  renderPcPanel();
}
function renderQueue() {
  cfRender();
  $("#q-count").textContent = `${queue.length} song${queue.length === 1 ? "" : "s"}`;
  $("#auto-btn").classList.toggle("on", S.autoplay);
  const b = $("#queue-body");
  if (!queue.length) { b.innerHTML = `<p class="empty">Queue is empty. Play a song, or use ⋯ → Add to queue.</p>`; return; }
  const now = queue[0], up = queue.slice(1);
  b.innerHTML = `<div class="qsec">Now playing</div><div class="rows glass-list"><div class="row qrow now"><div class="art" style="${art(now)}"></div><div class="t"><b>${esc(now.title)}</b><span>${esc(now.uploader || "")}</span></div></div></div>` +
    (up.length ? `<div class="qsec">Next up</div><div class="rows glass-list">${up.map((t, i) => `<div class="row qrow" data-qj="${i + 1}"><span class="grip" data-grip title="Drag to reorder">${icon("grip")}</span><div class="art" style="${art(t)}"></div><div class="t"><b>${esc(t.title)}</b><span>${esc(t.uploader || "")}</span></div><button class="del" data-qrm="${i + 1}" title="Remove">${icon("close")}</button></div>`).join("")}</div>` : `<p class="empty">Nothing up next.</p>`);
  renderPcPanel();
}
function renderStats() {
  const arts = Object.entries(ST.artists).sort((a, b) => b[1] - a[1]).slice(0, 5), songs = Object.values(ST.plays).sort((a, b) => b.c - a.c).slice(0, 6);
  const max = arts[0] ? arts[0][1] : 1, total = Object.values(ST.plays).reduce((n, p) => n + p.c, 0);
  lists.top = songs;
  $("#stats-body").innerHTML = `<div class="stat-grid"><div class="stat glass"><span>Listening time</span><b>${dur(ST.sec)}</b></div><div class="stat glass"><span>Songs played</span><b>${total}</b></div></div>` +
    `<div class="card-sec glass"><h4 style="margin-bottom:10px">Top artists</h4>${arts.length ? arts.map(([n, s]) => `<div class="bar-row"><b>${esc(n)}</b><i style="--w:${(s / max) * 100}%"></i><em>${dur(s)}</em></div>`).join("") : `<p class="empty">Play some songs and your stats show up here.</p>`}</div>` +
    (songs.length ? `<div class="card-sec glass"><h4 style="margin-bottom:10px">Top songs</h4><div class="rows">${songs.map((t, i) => row(t, i, "top")).join("")}</div></div>` : "");
  popIn($("#stats-body"));
}
function refreshMarks() {
  $$("[data-sv]").forEach((b) => b.classList.toggle("on", isSaved((lists[b.dataset.l] || [])[+b.dataset.i])));
  $$(".row[data-l]").forEach((r) => r.classList.toggle("active", isCur((lists[r.dataset.l] || [])[+r.dataset.i])));
  $("#p-like").classList.toggle("on", isSaved(meta));
  $("#pc-like") && $("#pc-like").classList.toggle("on", isSaved(meta));
}

/* ---------------- data (browser localStorage) ---------------- */
function getSaved() { return store("sv-liked") || []; }
function setSaved(list) { saved = list; store("sv-liked", saved); }
function getPlaylists() { return store("sv-playlists") || []; }
function setPlaylists(list) { playlists = list; store("sv-playlists", playlists); }

async function loadSaved() {
  saved = getSaved();
  renderLibrary(); renderTiles(); refreshMarks(); renderPcSidebarLib(); fixPosters();
}
async function loadHome() {
  const cachedHome = store("sv-home");
  if (cachedHome && Array.isArray(cachedHome.secs) && cachedHome.secs.length && !homeSecs.length) { homeSecs = cachedHome.secs; renderHome(); refreshMarks(); } // instant paint, refreshed below
  try {
    const ok = (id) => /^[\w-]{11}$/.test(id);
    const seeds = [...new Set([...getRecent().slice(0, 2), ...saved.slice(0, 3)].map((t) => vid(t.url)).filter(ok))].slice(0, 3);
    const arts = Object.entries(ST.artists || {}).filter(([n]) => n && n !== "Unknown").sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
    const q = new URLSearchParams({ h: new Date().getHours() });
    const gl = ((navigator.language || "").split("-")[1] || "").slice(0, 2); if (gl) q.set("gl", gl);
    if (seeds.length) q.set("seeds", seeds.join(","));
    if (arts.length) q.set("artists", arts.join("|"));
    const fresh = (await api(`/api/home?${q}`)).sections || [];
    if (fresh.length) { homeSecs = fresh; store("sv-home", { t: Date.now(), secs: fresh }); } else if (!homeSecs.length) homeSecs = [];
  } catch (e) {
    if (!homeSecs.length) homeSecs = [];
  }
  renderHome(); refreshMarks();
}
async function loadPlaylists() {
  playlists = getPlaylists();
  renderPcSidebarLib();
  if (curView === "library") renderLibrary();
  if (curView === "playlist") renderPlaylist();
}
function toggleSave(t) {
  if (!t) return;
  saved = getSaved();
  const idx = saved.findIndex((s) => vid(s.url) === vid(t.url));
  if (idx >= 0) {
    saved.splice(idx, 1);
    toast("Removed from liked");
  } else {
    saved.unshift(slim(t));
    toast("Added to liked songs");
  }
  setSaved(saved);
  loadSaved();
}
async function fixPosters() {
  for (const t of saved) {
    const k = vid(t.url);
    if (artCache[k] || /googleusercontent|ggpht/.test(t.thumbnail || "")) continue;
    try {
      const a = (await api(`/api/search?q=${encodeURIComponent(t.title + " " + (t.uploader || ""))}&n=1`)).tracks[0];
      if (a && /googleusercontent|ggpht/.test(a.thumbnail || "")) { artCache[k] = a.thumbnail; store("sv-art", artCache); renderLibrary(); renderTiles(); }
    } catch (e) {}
  }
}
function addRecent(t) { const r = getRecent().filter((x) => vid(x.url) !== vid(t.url)); r.unshift(slim(t)); store("sv-recent", r.slice(0, 16)); }
function countPlay(t) { const k = vid(t.url), p = ST.plays[k] || { ...slim(t), c: 0 }; p.c++; ST.plays[k] = p; statDirty = true; }
setInterval(() => { if (statDirty) { store("sv-stats", ST); statDirty = false; } }, 8000);
addEventListener("pagehide", () => store("sv-stats", ST));

/* ---------------- sheet + modal ---------------- */
const openSheet = (h) => { $("#sheet").innerHTML = h; $("#sheet").classList.add("open"); $("#sheet-back").classList.add("open"); };
const closeSheet = () => { $("#sheet").classList.remove("open"); $("#sheet-back").classList.remove("open"); };
const openModal = (h) => { $("#modal").innerHTML = h; $("#modal-back").classList.add("open"); };
const closeModal = () => $("#modal-back").classList.remove("open");
$("#sheet-back").onclick = closeSheet;
$("#modal-back").onclick = (e) => { if (e.target.id === "modal-back") closeModal(); };
let menuT = null, menuL = null, lastCard = null;
function showMenu(t, l) {
  menuT = t; menuL = l;
  const items = [["playnext", "playnext", "Play next"], ["queue", "plus", "Add to queue"], ["playlist", "plist", "Add to playlist"], ["like", "heart", isSaved(t) ? "Remove from liked" : "Add to liked"], ["share", "share", "Share link"]];
  if (l === "pl") items.push(["rmpl", "trash", "Remove from playlist"]);
  if (l === "player") items.unshift(["openq", "queue", "Open queue"]);
  openSheet(`<div class="sh-head"><div class="art" style="${art(t)}"></div><div><b>${esc(t.title)}</b><span>${esc(t.uploader || "")}</span></div></div>` + items.map(([a, ic, lb]) => `<button class="it" data-act="${a}">${icon(ic)}${lb}</button>`).join(""));
}
$("#sheet").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  const t = menuT, act = a.dataset.act; closeSheet();
  if (act === "playnext") playNext(t);
  else if (act === "queue") addToQueue(t);
  else if (act === "playlist") pickPlaylist(t);
  else if (act === "like") toggleSave(t);
  else if (act === "share") shareLink(t);
  else if (act === "openq") { closePlayer(); push("queue"); }
  else if (act === "rmpl") {
    playlists = getPlaylists();
    const p = playlists.find((x) => x.id === curPl);
    const i = p ? p.tracks.findIndex((x) => vid(x.url) === vid(t.url)) : -1;
    if (p && i >= 0) {
      p.tracks.splice(i, 1);
      setPlaylists(playlists);
      toast("Removed from playlist");
      loadPlaylists();
    }
  }
});
function pickPlaylist(t) {
  menuT = t;
  playlists = getPlaylists();
  openModal(`<h3>Add to playlist</h3>${playlists.map((p) => `<button class="opt" data-addpl="${p.id}"><div class="art" style="${art(p.tracks[0])}"></div><div><b>${esc(p.name)}</b><span style="color:var(--mut);font-size:.85rem">${p.tracks.length} songs</span></div></button>`).join("")}<input class="txt" id="np-name" placeholder="New playlist name" maxlength="60" style="margin-top:12px" /><button class="pill pill-acc" data-npcreate>Create & add</button>`);
}
function newPlaylistModal() { menuT = null; openModal(`<h3>New playlist</h3><input class="txt" id="np-name" placeholder="Playlist name" maxlength="60" /><button class="pill pill-acc" data-npcreate>Create</button>`); setTimeout(() => $("#np-name") && $("#np-name").focus(), 300); }
$("#modal").addEventListener("click", async (e) => {
  const add = e.target.closest("[data-addpl]"), mk = e.target.closest("[data-npcreate]");
  try {
    if (add) {
      const pid = add.dataset.addpl;
      playlists = getPlaylists();
      const pl = playlists.find((p) => p.id === pid);
      if (pl && menuT) {
        if (!pl.tracks.some((t) => vid(t.url) === vid(menuT.url))) {
          pl.tracks.push(slim(menuT));
          setPlaylists(playlists);
          toast("Added to playlist");
        } else {
          toast("Already in playlist");
        }
      }
      closeModal();
      loadPlaylists();
    }
    if (mk) {
      const name = ($("#np-name").value || "").trim() || "New playlist";
      playlists = getPlaylists();
      const newPl = {
        id: "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        tracks: menuT ? [slim(menuT)] : []
      };
      playlists.push(newPl);
      setPlaylists(playlists);
      closeModal();
      toast(`Created “${newPl.name}”`);
      loadPlaylists();
    }
    const ls = e.target.closest("[data-lsrc]"); if (ls && !ls.disabled) { closeModal(); if (meta) loadLyrics(meta, ls.dataset.lsrc); }
    if (e.target.closest("[data-carddl]") && lastCard) { const a = document.createElement("a"); a.href = lastCard.toDataURL("image/png"); a.download = "mixtape-lyrics.png"; a.click(); }
    if (e.target.closest("[data-cardshare]") && lastCard) lastCard.toBlob(async (b) => { const f = new File([b], "mixtape-lyrics.png", { type: "image/png" }); try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: meta.title, text: `${meta.title} • ${meta.uploader || ""}`, url: `https://music.youtube.com/watch?v=${vid(meta.url)}` }); else { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "mixtape-lyrics.png"; a.click(); } } catch (er) {} });
    if (e.target.closest("[data-cardlink]") && meta) shareLink(meta);
  } catch (er) { toast("Error: " + er.message); }
});
async function shareLink(t) {
  const url = `https://music.youtube.com/watch?v=${vid(t.url)}`;
  try { if (navigator.share) { await navigator.share({ title: t.title, text: `${t.title} • ${t.uploader || ""}`, url }); return; } await navigator.clipboard.writeText(url); toast("Link copied"); } catch (e) {}
}

/* ---------------- queue + playback ---------------- */
function setPlayingUI(p) {
  const i = icon(p ? "pause" : "play");
  $("#play-pause-btn").innerHTML = i; $("#l-play").innerHTML = i; $("#mini-play").innerHTML = i; if ($("#pc-play")) $("#pc-play").innerHTML = i;
  $("#mini").classList.toggle("playing", p); $("#player").classList.toggle("playing", p);
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = p ? "playing" : "paused";
}
function marquee() {
  const h = $("#p-title"); h.classList.remove("marq"); h.style.removeProperty("--d");
  requestAnimationFrame(() => { const d = h.offsetWidth - h.parentElement.clientWidth; if (d > 6) { h.style.setProperty("--d", d + "px"); h.style.setProperty("--t", d / 45 + 4 + "s"); h.classList.add("marq"); } });
}
function setMeta(m) {
  meta = m;
  const st = art(m), p = poster(m), a1 = first(m.uploader);
  $("#mini").classList.remove("hidden");
  $("#mini-art").setAttribute("style", st); $("#mini-title").textContent = m.title; $("#mini-artist").textContent = a1;
  if ($("#pc-art")) { $("#pc-art").setAttribute("style", st); $("#pc-title").textContent = m.title; $("#pc-artist").textContent = a1; $("#pc-artist").dataset.artist = a1; }
  $("#p-poster").setAttribute("style", st); $("#l-bg").setAttribute("style", st); if ($("#p-fluid-bg")) $("#p-fluid-bg").setAttribute("style", st);
  $("#p-title").textContent = m.title; $("#p-artist").textContent = a1; marquee();
  $("#l-title").textContent = `${m.title}${a1 ? " • " + a1 : ""}`; $("#p-src").textContent = m.title || srcLabel;
  document.title = `MixTape - ${m.title}`;
  themeFrom(p); refreshMarks(); cfRender();
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({
    title: m.title,
    artist: m.uploader || "",
    album: srcLabel || "MixTape",
    artwork: p ? [
      { src: p, sizes: "96x96", type: "image/jpeg" },
      { src: p, sizes: "192x192", type: "image/jpeg" },
      { src: p, sizes: "512x512", type: "image/jpeg" },
    ] : [],
  });
}
const qual = () => (S.quality === "auto" ? (navigator.connection && (navigator.connection.saveData || /2g|3g/.test(navigator.connection.effectiveType || "")) ? "medium" : "high") : S.quality);
const YT_ID = /^[\w-]{11}$/;
/* Plays through the live YouTube iframe. Returns true when handled (played, waiting for a tap, or superseded),
   false when the caller should fall back to the direct stream (embedding blocked, API unreachable, ...). */
async function playViaIframe(t, id, my, commit) {
  try {
    engine.use("youtube"); applyVol();
    if (t.title && t.title !== t.url) commit({ ...t });
    codecStub.textContent = FMT === "opus" ? "Opus" : "AAC";
    await engine.loadAndPlay(id, +S.speed);
  } catch (err) {
    if (my !== playSeq || err.code === "superseded") return true;
    if (err.code !== "blocked") { toast(`YouTube player: ${err.message}. Streaming directly instead.`); return false; }
    toast("Tap play to start");
  }
  if (my !== playSeq) return true;
  const m = ytEngine.videoData(), full = { ...t };
  if (!t.title || t.title === t.url) full.title = m.title || t.title;
  if (!t.uploader) full.uploader = m.author;
  if (!poster(t)) full.thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  if (!t.duration) full.duration = Math.round(engine.duration) || 0;
  commit(full);
  setPlayingUI(!engine.paused);
  return true;
}
async function streamTrack(t) {
  const my = ++playSeq, id = vid(t.url);
  setMeta({ ...t }); codecStub.textContent = "Loading…";
  let committed = false;
  const commit = (full) => { // runs once per track: queue entry, header, history, stats, lyrics
    if (committed) return; committed = true;
    if (queue[0] && queue[0].uid === t.uid) queue[0] = full;
    setMeta(full); addRecent(full); countPlay(full); loadLyrics(full);
    if (full.title && !poster(full)) {
      fetch(`/api/art/hq?title=${encodeURIComponent(full.title)}&artist=${encodeURIComponent(full.uploader || "")}&thumb=${encodeURIComponent(poster(full))}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.artworkUrl && d.artworkUrl !== poster(full)) {
            artCache[vid(full.url)] = d.artworkUrl;
            store("sv-art", artCache);
            full.thumbnail = d.artworkUrl;
            if (meta && vid(meta.url) === vid(full.url)) {
              meta.thumbnail = d.artworkUrl;
              setMeta(meta);
            }
          }
        }).catch(() => {});
    }
  };
  if (S.engine === "youtube" && YT_ID.test(id) && !ytEngine.failed && (await playViaIframe(t, id, my, commit))) return;
  if (my !== playSeq) return;
  engine.use("stream");
  try {
    const qs = `fmt=${FMT}&quality=${qual()}`;
    const pKey = `${id}|${FMT}|${qual()}`;
    const cachedHit = prefetchCache.get(pKey);
    const m = (cachedHit && cachedHit.exp > Date.now())
      ? cachedHit.data
      : await api(`/api/extract?q=${encodeURIComponent(t.url)}&${qs}`);
    if (cachedHit) prefetchCache.delete(pKey);
    if (my !== playSeq) return;
    const full = { ...t }; if (!t.title || t.title === t.url) full.title = m.title; if (!t.uploader) full.uploader = m.uploader; if (m.thumbnail) { full.thumbnail = m.thumbnail; artCache[vid(t.url)] = m.thumbnail; store("sv-art", artCache); } if (!t.duration) full.duration = m.duration;
    commit(full);
    const isOpus = (m.codec && /opus/i.test(m.codec)) || (m.ext === "opus") || (m.audioUrl && /opus|itag=251|itag=250|itag=249/i.test(m.audioUrl)) || FMT === "opus";
    codecStub.textContent = isOpus ? "Opus" : (m.codec && /aac|mp4a/i.test(m.codec) ? "AAC" : "HQ Audio");
    applyVol();
    await engine.loadAndPlay(m.audioUrl || `/stream?q=${encodeURIComponent(t.url)}&${qs}`, +S.speed);
    if (my !== playSeq) return;
    setPlayingUI(true);
  } catch (err) {
    if (my !== playSeq) return;
    if (S.engine !== "youtube" && YT_ID.test(id) && !ytEngine.failed && (await playViaIframe(t, id, my, commit))) return;
    toast(`Error: ${err.message}`);
  }
}
const prefetchCache = new Map();
let prefetchingId = "";
async function prefetchNext() {
  const nxt = queue[1];
  if (!nxt || S.engine === "youtube") return;
  const id = vid(nxt.url);
  if (!id || prefetchingId === id) return;
  const key = `${id}|${FMT}|${qual()}`;
  const hit = prefetchCache.get(key);
  if (hit && hit.exp > Date.now()) return;
  prefetchingId = id;
  try {
    const data = await api(`/api/extract?q=${encodeURIComponent(nxt.url)}&fmt=${FMT}&quality=${qual()}`);
    if (prefetchCache.size > 6) prefetchCache.delete(prefetchCache.keys().next().value);
    prefetchCache.set(key, { exp: Date.now() + 10 * 60e3, data });
  } catch (e) {} finally { if (prefetchingId === id) prefetchingId = ""; }
}
function startCurrent() { if (!queue[0]) return; kaPlay(); renderQueue(); streamTrack(queue[0]); maybeExtend(); }
function playList(list, i, label) {
  if (!list || !list[i]) return;
  origList = list.map((t) => ({ ...t })); hist = list.slice(0, i).map((t) => ({ ...t }));
  queue = list.slice(i).map(withUid); srcLabel = label || srcLabel;
  $("#suggest").classList.add("hidden"); startCurrent();
}
function addToQueue(t) { if (!queue.length) return playList([t], 0, "Queue"); if (queue.some((q) => vid(q.url) === vid(t.url))) return toast("Already in queue"); queue.push(withUid(t)); renderQueue(); toast("Added to queue"); }
function playNext(t) { if (!queue.length) return playList([t], 0, "Queue"); queue = queue.filter((q, i) => i === 0 || vid(q.url) !== vid(t.url)); queue.splice(1, 0, withUid(t)); renderQueue(); toast("Playing next"); }
async function maybeExtend(force) {
  const cur = queue[0];
  if (!cur || !S.autoplay || extending || (!force && queue.length > 3)) return;
  extending = true;
  try {
    const d = await api(`/api/radio?v=${encodeURIComponent(vid(cur.url))}`);
    const have = new Set([...queue, ...hist].map((x) => vid(x.url)));
    queue.push(...d.tracks.filter((t) => !have.has(vid(t.url))).map(withUid)); if (curView === "queue") renderQueue(); else cfRender();
  } catch (e) {} finally { extending = false; }
}
async function next() {
  if (!queue.length) return;
  if (shuffleOn && queue.length > 2) { const j = 1 + Math.floor(Math.random() * (queue.length - 1)); const [t] = queue.splice(j, 1); queue.splice(1, 0, t); }
  if (queue.length < 2 && S.autoplay && repeatMode !== 1) await maybeExtend(true);
  if (queue.length > 1) { hist.push(queue.shift()); if (hist.length > 60) hist.shift(); return startCurrent(); }
  if (repeatMode === 1 && origList.length) { queue = origList.map(withUid); hist = []; return startCurrent(); }
  setPlayingUI(false);
}
function prev() { if (engine.currentTime > 4 || !hist.length) { engine.currentTime = 0; return; } queue.unshift(withUid(hist.pop())); startCurrent(); }
const labelOf = (k) => ({ saved: "Liked songs", res: "Search", recent: "History", pl: "Playlist", top: "Top songs", tiles: "Library", mood: "Mood", genre: "Genre" }[k] || "Suggestions");

/* queue drag-to-reorder */
document.addEventListener("pointerdown", (e) => {
  const g = e.target.closest("[data-grip]"); if (!g) return;
  const row = g.closest(".qrow"), rows = [...row.parentElement.children], from = rows.indexOf(row), y0 = e.clientY; let to = from;
  e.preventDefault(); row.classList.add("lift"); g.setPointerCapture(e.pointerId);
  const mv = (ev) => {
    row.style.transform = `translateY(${ev.clientY - y0}px)`;
    const r = row.getBoundingClientRect(), cy = r.top + r.height / 2, others = rows.filter((x) => x !== row);
    to = others.filter((o) => { const b = o.getBoundingClientRect(); return cy > b.top + b.height / 2; }).length;
    others.forEach((o, i) => o.classList.toggle("drop", i === to));
  };
  const up = () => {
    g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
    if (to !== from) { const arr = queue.slice(1); const [it] = arr.splice(from, 1); arr.splice(to, 0, it); queue = [queue[0], ...arr]; }
    renderQueue();
  };
  g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
});

/* ---------------- search + autocomplete ---------------- */
const qinput = $("#query-input");
const moods = [["Pop", 330], ["Hip Hop", 28], ["Bollywood", 8], ["Punjabi", 45], ["Lo-fi", 200], ["Rock", 260], ["Indie", 150], ["Workout", 350]];
$("#browse").innerHTML = moods.map(([n, h]) => `<button class="btile" data-mood="${n}" style="background:linear-gradient(135deg,hsl(${h} 60% 42%),hsl(${h + 30} 60% 22%))">${n}</button>`).join("");
function resetSearch() {
  searchSeq++; qinput.value = "";
  if ($("#pc-top-input")) $("#pc-top-input").value = "";
  $("#clear-btn").classList.add("hidden");
  $("#pc-top-clear") && $("#pc-top-clear").classList.add("hidden");
  $("#results").innerHTML = "";
  if ($("#search-albums")) $("#search-albums").innerHTML = "";
  $("#suggest").classList.add("hidden");
  $("#browse").classList.remove("hidden");
}
function openSearch() {
  if (curView !== "search") push("search");
  resetSearch();
  setTimeout(() => {
    const target = innerWidth >= 960 && $("#pc-top-input") ? $("#pc-top-input") : qinput;
    target && target.focus();
  }, 150);
}
async function doSearch(q) {
  const my = ++searchSeq; $("#browse").classList.add("hidden");
  $("#results").innerHTML = `<div class="skel-block" style="height:200px;margin:8px"></div>`;
  try {
    const d = await api(`/api/search?q=${encodeURIComponent(q)}&n=12`);
    if (my !== searchSeq) return;
    lists.res = d.tracks || [];
    const albBox = $("#search-albums");
    if (albBox) {
      const albs = d.albums || [];
      albBox.innerHTML = albs.length ? shelf("Albums", `Matching albums for “${q}”`, `<div class="hscroll">${albs.map(albcard).join("")}</div>`) : "";
      if (albs.length) popIn(albBox);
    }
    $("#results").innerHTML = lists.res.length ? lists.res.map((t, i) => row(t, i, "res")).join("") : `<p class="empty">No songs found for "${esc(q)}".</p>`;
    popIn($("#results"));
  } catch (e) { if (my === searchSeq) $("#results").innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}
let suggestSongs = [];
async function suggest(q) {
  try {
    const d = await api(`/api/suggest?q=${encodeURIComponent(q)}`); if (qinput.value.trim() !== q) return;
    const box = $("#suggest");
    const songs = d.songs || [];
    const queries = (d.suggestions || []).filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 6);
    if (!songs.length && !queries.length) { box.classList.add("hidden"); return; }
    suggestSongs = songs;
    let html = "";
    if (songs.length) {
      html += `<div class="suggest-sec-title">Music & Playlists</div>`;
      html += songs.slice(0, 4).map((s, idx) => `
        <button class="suggest-item" data-sgsong="${idx}">
          <img src="${esc(s.thumbnail || '')}" alt="" onerror="this.style.display='none'" />
          <div class="meta">
            <b>${esc(s.title)}</b>
            <span>${esc(s.subtitle || (s.type === 'playlist' ? 'Playlist' : 'Song'))}</span>
          </div>
          <span class="suggest-badge">${esc(s.type || 'Song')}</span>
        </button>
      `).join("");
    }
    if (queries.length) {
      if (songs.length) html += `<div class="suggest-sec-title">Searches</div>`;
      html += queries.map((s) => `<button data-sg="${esc(s)}">${icon("search", "s")}<span>${esc(s)}</span></button>`).join("");
    }
    box.innerHTML = html; box.classList.remove("hidden");
  } catch (e) {}
}
qinput.addEventListener("input", () => {
  const q = qinput.value.trim(); $("#clear-btn").classList.toggle("hidden", !q);
  clearTimeout(searchTimer); clearTimeout(sgTimer);
  if (!q) return resetSearch();
  if (/^https?:\/\//.test(q)) return;
  sgTimer = setTimeout(() => suggest(q), 160); searchTimer = setTimeout(() => doSearch(q), 520);
});
qinput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return; const q = qinput.value.trim(); if (!q) return;
  clearTimeout(searchTimer); $("#suggest").classList.add("hidden");
  if (/^https?:\/\//.test(q)) playList([{ url: q, title: q, uploader: "", thumbnail: "" }], 0, "Link"); else doSearch(q);
});
$("#clear-btn").onclick = () => { resetSearch(); qinput.focus(); };

/* ---------------- home chips + genres ---------------- */
$$(".chip").forEach((c) => (c.onclick = async () => {
  $$(".chip").forEach((x) => x.classList.toggle("active", x === c));
  const box = $("#mood-shelf"); if (!c.dataset.q) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="skel-block glass"></div>`;
  try { const d = await api(`/api/search?q=${encodeURIComponent(c.dataset.q)}&n=14`); lists.mood = d.tracks; box.innerHTML = shelf(c.textContent, "Picked for this mood", hs(d.tracks, "mood"), "mood"); popIn(box); } catch (e) { box.innerHTML = ""; toast("Error: " + e.message); }
}));
async function startGenre(name) {
  try {
    const d = await api(`/api/search?q=${encodeURIComponent(name + " songs")}&n=20`); const pool = d.tracks.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    lists.genre = pool; toast(`${name} radio`); playList(pool, 0, name);
  } catch (e) { toast("Error: " + e.message); }
}

/* ---------------- global clicks ---------------- */
let drag = null, justDragged = false;
document.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || e.button !== 0) return; const h = e.target.closest(".hscroll"); if (h) drag = { h, x: e.clientX, sl: h.scrollLeft, moved: false }; });
addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; drag.h.classList.add("dragging"); } if (drag.moved) drag.h.scrollLeft = drag.sl - dx; });
addEventListener("pointerup", () => { if (!drag) return; const h = drag.h; justDragged = drag.moved; drag = null; setTimeout(() => { h.classList.remove("dragging"); justDragged = false; }, 0); });
const shuffleArr = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
document.addEventListener("click", (e) => {
  if (justDragged) { e.stopPropagation(); return; }
  const g = (s) => e.target.closest(s); let x;
  if ((x = g("[data-hs]"))) { const h = x.closest(".card-sec").querySelector(".hscroll"); return h.scrollBy({ left: +x.dataset.hs * h.clientWidth * 0.85, behavior: "smooth" }); }
  if ((x = g("[data-sv]"))) { e.stopPropagation(); return toggleSave(lists[x.dataset.l][+x.dataset.i]); }
  if ((x = g("[data-more]"))) { e.stopPropagation(); return showMenu(lists[x.dataset.l][+x.dataset.i], x.dataset.l); }
  if ((x = g("[data-qrm]"))) { e.stopPropagation(); queue.splice(+x.dataset.qrm, 1); return renderQueue(); }
  if (g("[data-grip]")) return;
  if ((x = g("[data-qj]"))) { const j = +x.dataset.qj; hist.push(...queue.splice(0, j)); return startCurrent(); }
  if ((x = g("[data-shuf]"))) { shuffleOn = true; $("#shuffle-btn").classList.add("on"); const l = lists[x.dataset.shuf]; return playList(l, Math.floor(Math.random() * l.length), labelOf(x.dataset.shuf)); }
  if ((x = g("[data-mood]"))) { qinput.value = x.dataset.mood + " songs"; $("#clear-btn").classList.remove("hidden"); return doSearch(qinput.value); }
  if ((x = g("[data-sgsong]"))) {
    const s = suggestSongs[+x.dataset.sgsong];
    if (s) {
      $("#suggest").classList.add("hidden");
      const kind = String(s.type || "Song").toLowerCase();
      if (kind === "album" || kind === "playlist") {
        const artistGuess = (s.subtitle || "").replace(/^(Album|Single|EP|Playlist)\s*•\s*/i, "").replace(/\s*•\s*(19|20)\d{2}.*$/i, "").trim();
        return openAlbumView({ id: s.browseId || s.id, browseId: s.browseId || s.id, title: s.title, artist: artistGuess, kind: s.type, thumbnail: s.thumbnail });
      }
      if (kind === "artist") {
        return openArtistView(s.title);
      }
      if (s.url) {
        qinput.value = s.title;
        return playList([{
          url: s.url,
          title: s.title,
          uploader: s.subtitle ? s.subtitle.replace(/^Song\s*•\s*/i, "").replace(/\s*•\s*\d+.*$/i, "") : "",
          thumbnail: s.thumbnail
        }], 0, "Suggestions");
      }
    }
  }
  if ((x = g("[data-album]"))) { const a = albumMap[x.dataset.album]; if (a) return openAlbumView(a); }
  if ((x = g("[data-pcnav]"))) { const v = x.dataset.pcnav; if (v === "search") return openSearch(); if (NAVV.includes(v)) return navTo(v); return push(v); }
  if ((x = g("[data-pclib]"))) { libTab = x.dataset.pclib; renderLibrary(); return navTo("library"); }
  if ((x = g("[data-pcp]"))) { setPcPanel(true, x.dataset.pcp); return; }
  if ((x = g("[data-pclyr]"))) { const t = parseFloat(x.dataset.t); if (Number.isFinite(t)) engine.seek(Math.max(0, t - (lyr.off || 0))); return; }
  if ((x = g("[data-sg]"))) { qinput.value = x.dataset.sg; $("#suggest").classList.add("hidden"); return doSearch(x.dataset.sg); }
  if ((x = g("[data-artist]"))) return openArtistView(x.dataset.artist);
  if ((x = g("[data-genre]"))) return startGenre(x.dataset.genre);
  if ((x = g("[data-lib]"))) { libTab = x.dataset.lib; return renderLibrary(); }
  if ((x = g("[data-pl]"))) { virtualPl = null; curPl = x.dataset.pl; renderPlaylist(); return push("playlist"); }
  if ((x = g("[data-cpl]"))) { const cp = curatedPls[x.dataset.cpl]; if (cp) { virtualPl = cp; curPl = null; renderPlaylist(); return push("playlist"); } }
  if (g("[data-plsave]")) {
    if (virtualPl && virtualPl.tracks && virtualPl.tracks.length) {
      playlists = getPlaylists();
      const newPl = { id: "pl_" + Date.now().toString(36), name: virtualPl.name, tracks: virtualPl.tracks.map(slim) };
      playlists.unshift(newPl); setPlaylists(playlists); loadPlaylists(); renderHome();
      toast(`Saved “${newPl.name}” to Library`);
    }
    return;
  }
  if (g("[data-pwainstall]") || g("#pwa-install-btn")) {
    if (pwaPrompt) {
      pwaPrompt.prompt();
      pwaPrompt.userChoice.then(() => { pwaPrompt = null; $("#pwa-install-btn") && $("#pwa-install-btn").classList.add("hidden"); if (curView === "settings") renderSettings(); }).catch(() => {});
    }
    return;
  }
  if (g("[data-changename]")) return nameModal();
  if (g("[data-newpl]")) return newPlaylistModal();
  if (g("[data-gosettings]")) return push("settings");
  if (g("[data-libplay]")) return playList(saved, 0, "Liked songs");
  if (g("[data-libshuf]")) { shuffleOn = true; $("#shuffle-btn").classList.add("on"); return playList(saved, Math.floor(Math.random() * saved.length), "Liked songs"); }
  if (g("[data-plplay]")) return playList(lists.pl, 0, "Playlist");
  if (g("[data-plshuf]")) { shuffleOn = true; $("#shuffle-btn").classList.add("on"); const l = lists.pl; return playList(l, Math.floor(Math.random() * l.length), "Playlist"); }
  if (g("[data-pldel]")) {
    if (confirm("Delete this playlist?")) {
      playlists = getPlaylists().filter((p) => p.id !== curPl);
      setPlaylists(playlists);
      toast("Playlist deleted");
      back();
      loadPlaylists();
    }
    return;
  }
  if ((x = g("[data-tog]"))) { const k = x.dataset.tog; setS(k, !S[k]); x.classList.toggle("on", S[k]); if ((k === "lyricStrict" || k === "lyricWord") && meta) loadLyrics(meta); return x.setAttribute("aria-checked", S[k]); }
  if ((x = g("[data-seg]"))) { const k = x.dataset.seg, v = x.dataset.v; setS(k, v); if (k === "lyricSource" && meta) loadLyrics(meta);
    if (k === "eq" || k === "lyricSource") renderSettings(); else x.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === x)); return; }
  if (g("[data-import]")) return doImport();
  if ((x = g("[data-l]"))) {
    const l = x.dataset.l, idx = +x.dataset.i;
    if (l === "res") {
      const chosen = lists.res && lists.res[idx];
      if (chosen) return playList([chosen], 0, "Search");
      return;
    }
    return playList(lists[l], idx, labelOf(l));
  }
});
async function doImport() {
  const inp = $("#imp-url"), url = (inp.value || "").trim(), btn = $("[data-import]");
  if (!url) return toast("Paste a playlist link first");
  btn.disabled = true; btn.textContent = "Importing…"; toast("Importing. Big playlists can take a minute.");
  try {
    const d = await api("/api/import", { method: "POST", headers: JSON_H, body: JSON.stringify({ url }) });
    const importedTracks = (d.playlist && d.playlist.tracks) || d.tracks || [];
    const playlistName = (d.playlist && d.playlist.name) || d.name || "Imported playlist";
    if (!importedTracks.length) throw new Error("No songs could be imported from that link.");
    playlists = getPlaylists();
    const newPl = {
      id: "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: playlistName,
      tracks: importedTracks.map(slim).filter((t) => t.url)
    };
    playlists.push(newPl);
    setPlaylists(playlists);
    toast(`Imported ${newPl.tracks.length} songs into “${newPl.name}”`);
    inp.value = "";
    loadPlaylists();
    const c = $("#pl-count");
    if (c) c.textContent = `${playlists.length} playlists`;
  }
  catch (e) { toast("Error: " + e.message); } finally { btn.disabled = false; btn.textContent = "Import"; }
}

/* ---------------- player controls + mini gestures ---------------- */
const toggle = () => { if (!engine.src) return; if (engine.paused) engine.play(); else engine.pause(); };
engine.on("play", () => setPlayingUI(true)); engine.on("pause", () => setPlayingUI(false));
$("#play-pause-btn").onclick = $("#l-play").onclick = toggle;
$("#mini-play").onclick = (e) => { e.stopPropagation(); toggle(); };
$("#mini-next").onclick = (e) => { e.stopPropagation(); next(); };
$("#next-btn").onclick = $("#l-next").onclick = next;
$("#prev-btn").onclick = $("#l-prev").onclick = prev;
$("#shuffle-btn").onclick = () => { shuffleOn = !shuffleOn; $("#shuffle-btn").classList.toggle("on", shuffleOn); };
$("#repeat-btn").onclick = () => { repeatMode = (repeatMode + 1) % 3; $("#repeat-btn").classList.toggle("on", repeatMode > 0); toast(["Repeat off", "Repeat queue", "Repeat one"][repeatMode]); };
function syncVolUI() {
  const vb = $("#volume-bar"), pv = $("#pc-vol");
  const displayVal = engine.muted ? 0 : curVol;
  if (vb) { vb.value = String(curVol); paintRange(vb); }
  if (pv) { pv.value = String(displayVal); paintRange(pv); pv.classList.toggle("muted", !!engine.muted); }
  $("#mute-btn") && $("#mute-btn").classList.toggle("on", !!engine.muted);
  $("#pc-mute") && $("#pc-mute").classList.toggle("on", !!engine.muted);
}
$("#volume-bar").oninput = (e) => {
  curVol = parseFloat(e.target.value);
  if (curVol > 0 && engine.muted) engine.setMuted(false);
  applyVol();
  syncVolUI();
};
$("#mute-btn").onclick = () => {
  engine.setMuted(!engine.muted);
  syncVolUI();
};
syncVolUI();
$("#p-like").onclick = () => toggleSave(meta);
$("#p-more").onclick = () => meta && showMenu(meta, "player");
$("#queue-btn").onclick = () => { closePlayer(); push("queue"); };
$("#auto-btn").onclick = () => { setS("autoplay", !S.autoplay); toast(S.autoplay ? "Autoplay on: similar songs keep playing" : "Autoplay off"); if (S.autoplay) maybeExtend(); };
$("#q-clear").onclick = () => { queue = queue.slice(0, 1); renderQueue(); };
const isMobileLand = () => innerWidth < 960 && matchMedia("(orientation: landscape)").matches;
function setFsMode(on) {
  const pl = $("#player"), btn = $("#p-fs-btn");
  if (!pl) return;
  pl.classList.toggle("fs-mode", !!on);
  if (btn) {
    btn.classList.toggle("on", !!on);
    const sp = btn.querySelector("span");
    if (sp) sp.textContent = on ? "Exit full screen" : "Full screen";
    btn.title = on ? "Exit full screen mode" : "Full screen mode";
  }
  if (typeof aml !== "undefined") {
    if (on || $("#lyrics").classList.contains("open") || (isMobileLand() && pl.classList.contains("open"))) aml.start();
    else aml.stop();
  }
}
let _pt;
const openPlayer = () => {
  $("#player").classList.add("open");
  $("#player").setAttribute("aria-hidden", "false");
  if ((isMobileLand() || $("#player").classList.contains("fs-mode")) && typeof aml !== "undefined") aml.start();
  clearTimeout(_pt);
  _pt = setTimeout(() => { if ($("#player").classList.contains("open")) root.classList.add("player-open"); }, 560);
};
document.addEventListener("visibilitychange", () => root.classList.toggle("tab-hidden", document.hidden));
function closePlayer() {
  clearTimeout(_pt);
  root.classList.remove("player-open");
  $("#lyrics").classList.remove("open", "sharing");
  $("#player").classList.remove("open", "lyrics-open", "fs-mode");
  $("#player").setAttribute("aria-hidden", "true");
  const sp = $("#p-fs-btn span"); if (sp) sp.textContent = "Full screen";
  $("#p-fs-btn") && $("#p-fs-btn").classList.remove("on");
  if (typeof aml !== "undefined") aml.stop();
}
if ($("#p-fs-btn")) $("#p-fs-btn").onclick = () => setFsMode(!$("#player").classList.contains("fs-mode"));
matchMedia("(orientation: landscape)").addEventListener("change", () => {
  if ($("#player").classList.contains("open") && typeof aml !== "undefined") {
    if (isMobileLand() || $("#player").classList.contains("fs-mode") || $("#lyrics").classList.contains("open")) aml.start();
    else aml.stop();
  }
});
$("#p-close").onclick = closePlayer;
const mini = $("#mini"); let mg = null;
mini.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; mg = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; mini.setPointerCapture(e.pointerId); });
mini.addEventListener("pointermove", (e) => { if (!mg) return; mg.dx = e.clientX - mg.x; mg.dy = e.clientY - mg.y; mini.style.translate = `${mg.dx * 0.5}px ${Math.min(0, mg.dy) * 0.4}px`; });
mini.addEventListener("pointerup", () => { if (!mg) return; const { dx, dy } = mg; mg = null; mini.style.translate = ""; if (dy < -40 && Math.abs(dy) > Math.abs(dx)) openPlayer(); else if (dx < -70) next(); else if (dx > 70) prev(); else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) openPlayer(); });
mini.addEventListener("pointercancel", () => { mg = null; mini.style.translate = ""; });
document.addEventListener("keydown", (e) => {
  const inInput = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === "Escape") { if ($("#modal-back").classList.contains("open")) closeModal(); else if ($("#sheet").classList.contains("open")) closeSheet(); else if ($("#player").classList.contains("fs-mode")) setFsMode(false); else if ($("#lyrics").classList.contains("open")) $("#l-back").click(); else closePlayer(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); return; }
  if (inInput) return;
  if (e.key === "/") { e.preventDefault(); openSearch(); return; }
  if (e.code === "Space") { e.preventDefault(); toggle(); return; }
  if (e.shiftKey && e.key === "ArrowRight") { e.preventDefault(); next(); return; }
  if (e.shiftKey && e.key === "ArrowLeft") { e.preventDefault(); prev(); return; }
  if (e.key.toLowerCase() === "m") { $("#mute-btn") && $("#mute-btn").click(); }
});
document.addEventListener("visibilitychange", () => {
  root.classList.toggle("tab-hidden", document.hidden);
});
/* ---- lock screen / notification controls + background keep-alive ----
   The YouTube player lives in a cross-origin iframe, so the browser doesn't treat the page as "playing media":
   no lock-screen controls, and the tab gets suspended in the background. A silent looping <audio> owned by this
   page fixes both: the page owns the media session (our next/prev/seek handlers), and the tab stays alive. */
const keepAlive = (() => {
  const rate = 8000, n = rate; // 1 second of silence
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
  a.loop = true; a.volume = 1; a.setAttribute("playsinline", "");
  return a;
})();
let kaStop = 0;
const kaPlay = () => { clearTimeout(kaStop); if (keepAlive.paused) keepAlive.play().catch(() => {}); };
// Delay the pause: between songs the engine briefly pauses, and dropping the session then makes the browser suspend us.
const kaPause = () => { clearTimeout(kaStop); kaStop = setTimeout(() => { if (engine.paused) keepAlive.pause(); }, 4000); };
engine.on("play", () => { kaPlay(); });
engine.on("playing", () => { kaPlay(); });
engine.on("pause", () => { kaPause(); });
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, function once() { // unlock on first gesture
  document.removeEventListener(ev, once);
  keepAlive.play().then(() => { if (engine.paused) keepAlive.pause(); }).catch(() => {});
}, { passive: true }));
if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession, set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
  set("play", () => { if (engine.paused) toggle(); kaPlay(); });
  set("pause", () => { if (!engine.paused) toggle(); });
  set("stop", () => { if (!engine.paused) toggle(); });
  set("nexttrack", next);
  set("previoustrack", prev);
  set("seekbackward", (d) => { engine.currentTime = Math.max(0, engine.currentTime - ((d && d.seekOffset) || 10)); });
  set("seekforward", (d) => { const t = engine.currentTime + ((d && d.seekOffset) || 10), du = engine.duration; engine.currentTime = Number.isFinite(du) ? Math.min(du - 0.5, t) : t; });
  set("seekto", (d) => { if (d && d.seekTime != null) engine.currentTime = d.seekTime; });
  let psAt = 0;
  engine.on("timeupdate", () => {
    const now = performance.now(), d = engine.duration;
    if (now - psAt < 1000 || !Number.isFinite(d) || !ms.setPositionState) return; psAt = now;
    try { ms.setPositionState({ duration: d, position: Math.min(engine.currentTime, d), playbackRate: +S.speed || 1 }); } catch (e) {}
  });
}
engine.on("error", (e) => { if (e && e.ytError) { toast(`Couldn't play that song (${e.message}). Skipping.`); next(); } });
engine.on("ended", () => { if (repeatMode === 2) { engine.currentTime = 0; engine.play(); } else next(); });
let lastT = 0;
const _se = $$(".seek"), _mp = $("#mini-prog"), _ct = [$("#current-time"), $("#l-cur"), $("#pc-cur")].filter(Boolean), _dt = [$("#duration-time"), $("#l-left"), $("#pc-left")].filter(Boolean); let _lp = -1, _lk = "", _lastPcLyr = -1;
engine.on("timeupdate", () => {
  const d = engine.duration, t = engine.currentTime, dt = t - lastT; lastT = t;
  if (dt > 0 && dt < 1.5 && !engine.paused && meta) { ST.sec += dt; const a = first(meta.uploader) || "Unknown"; ST.artists[a] = (ST.artists[a] || 0) + dt; statDirty = true; }
  if (S.fade > 0) applyVol();
  if (!Number.isFinite(d)) return;
  const p = (t / d) * 100;
  if (d > 25 && d - t < 22 && queue.length > 1) prefetchNext();
  if (Math.abs(p - _lp) > 0.08) {
    _lp = p;
    const pcMode = innerWidth >= 960;
    const playerOpen = $("#player").classList.contains("open");
    _se.forEach((e) => {
      if (e.id === "pc-seek" && !pcMode) return;
      if ((e.id === "seek" || e.id === "l-seek") && !playerOpen) return;
      e.style.setProperty("--p", p);
    });
    if (!pcMode && _mp) _mp.style.width = `${p}%`;
  }
  const k = Math.floor(t) + ":" + Math.floor(d);
  if (k !== _lk) {
    _lk = k; const a = fmt(t), b = "-" + fmt(d - t);
    _ct.forEach((e) => (e.textContent = a)); _dt.forEach((e) => (e.textContent = b));
  }
});
function bindSeek(seek) {
  const to = (e) => { const r = seek.getBoundingClientRect(), p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); if (Number.isFinite(engine.duration)) { engine.seek(p * engine.duration); $$(".seek").forEach((s) => s.style.setProperty("--p", p * 100)); } };
  const end = () => { seek.onpointermove = null; seek.classList.remove("drag"); };
  seek.addEventListener("pointerdown", (e) => { seek.setPointerCapture(e.pointerId); seek.classList.add("drag"); to(e); seek.onpointermove = to; });
  seek.addEventListener("pointerup", end); seek.addEventListener("pointercancel", end);
}
bindSeek($("#seek")); bindSeek($("#l-seek")); if ($("#pc-seek")) bindSeek($("#pc-seek"));
if ($("#pc-play")) $("#pc-play").onclick = toggle;
if ($("#pc-prev")) $("#pc-prev").onclick = prev;
if ($("#pc-next")) $("#pc-next").onclick = next;
if ($("#pc-like")) $("#pc-like").onclick = () => toggleSave(meta);
if ($("#pc-art")) $("#pc-art").onclick = () => { if (meta) openPlayer(); };
if ($("#pc-btn-expand")) $("#pc-btn-expand").onclick = () => { if (meta) openPlayer(); };
if ($("#pc-shuffle")) $("#pc-shuffle").onclick = () => { $("#shuffle-btn").click(); $("#pc-shuffle").classList.toggle("on", shuffleOn); };
if ($("#pc-repeat")) $("#pc-repeat").onclick = () => { $("#repeat-btn").click(); $("#pc-repeat").classList.toggle("on", repeatMode > 0); const em = $("#pc-repeat em"); if (em) em.textContent = repeatMode === 2 ? "1" : ""; };
if ($("#pc-mute")) $("#pc-mute").onclick = () => { $("#mute-btn").click(); };
if ($("#pc-vol")) {
  $("#pc-vol").oninput = (e) => {
    curVol = parseFloat(e.target.value);
    if (curVol > 0 && engine.muted) engine.setMuted(false);
    applyVol();
    syncVolUI();
  };
  syncVolUI();
}
if ($("#pc-panel-btn")) $("#pc-panel-btn").onclick = () => setPcPanel(!pcPanelOpen);
if ($("#pc-panel-close")) $("#pc-panel-close").onclick = () => setPcPanel(false);
if ($("#pc-btn-queue")) $("#pc-btn-queue").onclick = () => setPcPanel(!(pcPanelOpen && pcPanelTab === "queue"), "queue");
if ($("#pc-btn-lyrics")) $("#pc-btn-lyrics").onclick = () => setPcPanel(!(pcPanelOpen && pcPanelTab === "lyrics"), "lyrics");
if ($("#pc-brand-btn")) $("#pc-brand-btn").onclick = nameModal;
if ($("#pc-top-input")) {
  const ti = $("#pc-top-input"), tc = $("#pc-top-clear");
  ti.addEventListener("focus", () => { if (curView !== "search") push("search"); });
  ti.addEventListener("input", () => {
    if (curView !== "search") push("search");
    tc && tc.classList.toggle("hidden", !ti.value.trim());
    qinput.value = ti.value;
    qinput.dispatchEvent(new Event("input"));
  });
  ti.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (curView !== "search") push("search");
      qinput.value = ti.value;
      qinput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    }
  });
  if (tc) tc.onclick = () => { resetSearch(); ti.focus(); };
}

/* ---------------- lyrics: Apple Music-style player (static/amlyrics.js) + share card ---------------- */
let lyr = { lines: [], off: 0, sel: new Set() };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const KIND = { word: "WORD SYNC", line: "LINE SYNC", plain: "PLAIN TEXT", none: "NO LYRICS" };
const lyrFx = () => (S.lite || S.anim === "reduced" || S.anim === "off" ? "lite" : "full");
const aml = new AMLyrics($("#l-scroll"), {
  fx: lyrFx(),
  anchor: 0.22,
  getTime: () => {
    const t = engine.currentTime;
    // Micro-lead (+60ms) accounts for browser audio buffer delay so syllable highlighting hits right on vocal attack
    return Number.isFinite(t) ? t + 0.06 : 0;
  },
  onSeek: (t) => engine.seek(t),                      // click / tap / Enter on a line or on the break dots
  active: () => $("#lyrics").classList.contains("open") || ($("#player").classList.contains("open") && ($("#player").classList.contains("fs-mode") || isMobileLand())),
  onLineClick: (i, el) => {                           // share mode: tapping selects lines instead of seeking
    if (!$("#lyrics").classList.contains("sharing")) return false;
    if (i < 0) return true;                           // instrumental-break dots are not a lyric line
    if (lyr.sel.has(i)) lyr.sel.delete(i); else if (lyr.sel.size < 6) lyr.sel.add(i); else toast("Up to 6 lines");
    el.classList.toggle("sel", lyr.sel.has(i));
    $("#l-selcount").textContent = lyr.sel.size ? `${lyr.sel.size} line${lyr.sel.size > 1 ? "s" : ""} selected` : "Tap lines to select";
    return true;
  },
});
const pcAml = $("#pc-panel-lyrics") ? new AMLyrics($("#pc-panel-lyrics"), {
  fx: lyrFx(),
  anchor: 0.25,
  getTime: () => {
    const t = engine.currentTime;
    return Number.isFinite(t) ? t + 0.06 : 0;
  },
  onSeek: (t) => engine.seek(t),
  active: () => pcPanelOpen && pcPanelTab === "lyrics",
}) : null;
async function loadLyrics(m, override) {
  const my = ++lyrSeq, sc = $("#l-scroll");
  let trackOff = 0;
  if (m && vid(m.url)) {
    try {
      const allOff = JSON.parse(localStorage.getItem("sv-lyr-offsets") || "{}");
      if (typeof allOff[vid(m.url)] === "number") trackOff = allOff[vid(m.url)];
    } catch (e) {}
  }
  lyr = { lines: [], off: trackOff, sel: new Set() };
  aml.setOffset(trackOff);
  aml.setFx(lyrFx());
  $("#lyrics").classList.remove("sharing");
  aml.clear();
  if (pcAml) { pcAml.setOffset(trackOff); pcAml.setFx(lyrFx()); pcAml.clear(); }
  sc.innerHTML = `<p class="l-none">Looking for lyrics…</p>`;
  if ($("#pc-panel-lyrics")) $("#pc-panel-lyrics").innerHTML = `<p class="l-none">Looking for lyrics…</p>`;
  $("#l-badge").textContent = "SEARCHING…";
  $("#l-offv").textContent = (trackOff > 0 ? "+" : "") + trackOff.toFixed(1) + "s";
  sc.scrollTop = 0;
  const src = override || S.lyricSource, strict = override ? (override !== "auto" ? 1 : 0) : (S.lyricStrict && S.lyricSource !== "auto" ? 1 : 0);
  try {
    const d = await api(`/api/lyrics?title=${encodeURIComponent(m.title)}&artist=${encodeURIComponent(m.uploader || "")}&duration=${m.duration || 0}&vid=${encodeURIComponent(vid(m.url))}&source=${src}&strict=${strict}&prefer=${S.lyricWord ? "word" : "line"}`);
    if (my !== lyrSeq) return;
    $("#l-badge").textContent = `${KIND[d.kind] || "LYRICS"}${d.sourceName ? " · " + d.sourceName : ""}`;
    if (d.synced && d.synced.length) {
      lyr.lines = d.synced;
      aml.load({ lines: d.synced }); aml.start();
      if (pcAml) { pcAml.load({ lines: d.synced }); if (pcPanelOpen && pcPanelTab === "lyrics") pcAml.start(); }
      renderPcPanel();
    } else if (d.plain) {
      sc.innerHTML = `<div class="l-plain">${esc(d.plain)}</div>`;
      if ($("#pc-panel-lyrics")) $("#pc-panel-lyrics").innerHTML = `<div class="l-plain">${esc(d.plain)}</div>`;
    } else {
      sc.innerHTML = `<p class="l-none">No lyrics found${strict ? " from this source" : ""}. Tap the badge above to try another source.</p>`;
      if ($("#pc-panel-lyrics")) $("#pc-panel-lyrics").innerHTML = `<p class="l-none">No lyrics found for this track.</p>`;
    }
  } catch (e) { if (my === lyrSeq) { $("#l-badge").textContent = "LYRICS"; sc.innerHTML = `<p class="l-none">Lyrics unavailable right now.</p>`; if ($("#pc-panel-lyrics")) $("#pc-panel-lyrics").innerHTML = `<p class="l-none">Lyrics unavailable right now.</p>`; } }
}
$("#p-lyrics").onclick = () => {
  const willOpen = !$("#lyrics").classList.contains("open");
  $("#lyrics").classList.toggle("open", willOpen);
  $("#player").classList.toggle("lyrics-open", willOpen);
  $("#p-lyrics").classList.toggle("on", willOpen);
  if (willOpen) aml.start(); else aml.stop();
};
$("#l-back").onclick = () => {
  $("#lyrics").classList.remove("open", "sharing");
  $("#player").classList.remove("lyrics-open");
  $("#p-lyrics").classList.remove("on");
  aml.stop();
};
const setOff = (d) => {
  lyr.off = Math.round((lyr.off + d) * 10) / 10;
  aml.setOffset(lyr.off); if (pcAml) pcAml.setOffset(lyr.off);
  $("#l-offv").textContent = (lyr.off > 0 ? "+" : "") + lyr.off.toFixed(1) + "s";
  if (meta && vid(meta.url)) {
    try {
      const allOff = JSON.parse(localStorage.getItem("sv-lyr-offsets") || "{}");
      allOff[vid(meta.url)] = lyr.off;
      localStorage.setItem("sv-lyr-offsets", JSON.stringify(allOff));
    } catch (e) {}
  }
};
function pickLyricSource() {
  openModal(`<h3>Lyrics source</h3>${[{ id: "auto", name: "Auto", kind: "", note: "Tries every source and uses the best match", available: true }, ...SRCS].map((s) => `<button class="opt" data-lsrc="${s.id}"${s.available === false ? " disabled" : ""}><div><b>${esc(s.name)}${s.kind ? " · " + (s.kind === "word" ? "word sync" : "line sync") : ""}</b><span style="color:var(--mut);font-size:.85rem;display:block">${esc(s.note || "")}${s.available === false ? " (not available)" : ""}</span></div></button>`).join("")}`);
}
$("#l-badge").onclick = pickLyricSource;
$("#l-minus").onclick = () => setOff(-0.1); $("#l-plus").onclick = () => setOff(0.1);
$("#l-share").onclick = () => { if (!lyr.lines.length) return toast("Synced lyrics are needed to make a card"); $("#lyrics").classList.toggle("sharing"); lyr.sel.clear(); $$(".am-line").forEach((l) => l.classList.remove("sel")); $("#l-selcount").textContent = "Tap lines to select"; };
$("#l-cancel").onclick = () => $("#lyrics").classList.remove("sharing");
const rr = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
const wrapText = (x, text, maxW) => { const out = []; let line = ""; text.split(" ").forEach((w) => { const t = line ? line + " " + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; };
const loadImg = (u) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = /^https?:\/\//.test(u) ? `/api/art?u=${encodeURIComponent(u)}` : u; });
$("#l-make").onclick = async () => {
  const text = [...lyr.sel].sort((a, b) => a - b).map((i) => lyr.lines[i].text);
  if (!text.length) return toast("Select some lines first");
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d"), cs = getComputedStyle(root);

  const FONT = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "SF Pro", "SF Pro Text", "Noto Sans Devanagari", system-ui, sans-serif';
  let im = null; try { im = await loadImg(poster(meta)); } catch (e) {}

  // 1. Soft blurred backdrop from the artwork's colours (warm top -> cool middle -> dark bottom)
  const c1 = (cs.getPropertyValue("--c1") || "#8a4a32").trim(), c2 = (cs.getPropertyValue("--c2") || "#2a4a63").trim(), c3 = (cs.getPropertyValue("--c3") || "#0b0e14").trim();
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, c1); bg.addColorStop(0.5, c2); bg.addColorStop(1, c3);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  if (im && "filter" in x) {
    x.save(); x.filter = "blur(90px) saturate(1.5)"; x.globalAlpha = 0.75;
    const sc = Math.max(W, H) * 1.25; x.drawImage(im, (W - sc) / 2, (H - sc) / 2 - 120, sc, sc); x.restore();
  }
  const shade = x.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0.10)"); shade.addColorStop(0.55, "rgba(0,0,0,0.30)"); shade.addColorStop(1, "rgba(0,0,0,0.88)");
  x.fillStyle = shade; x.fillRect(0, 0, W, H);

  // 2. Lyrics: big, bold, left aligned, tight line spacing
  const padX = 80, maxTextW = W - padX * 2, barH = 190, barY = H - barH - 70;
  const topPad = 150, bottomLimit = barY - 70, availH = bottomLimit - topPad;
  let size = 96, lines = [], totalH = 0;
  for (; size >= 36; size -= 2) {
    x.font = `800 ${size}px ${FONT}`;
    lines = text.flatMap((t) => wrapText(x, t, maxTextW));
    totalH = lines.length * size * 1.36;
    if (totalH <= availH) break;
  }
  const lineH = size * 1.36;
  let curY = topPad + Math.max(0, (availH - totalH) / 2);
  x.fillStyle = "#ffffff"; x.textBaseline = "top"; x.shadowColor = "rgba(0,0,0,0.25)"; x.shadowBlur = 18;
  lines.forEach((l) => { x.fillText(l, padX, curY); curY += lineH; });
  x.shadowBlur = 0; x.shadowColor = "transparent";

  // 3. Bottom frosted bar: cover, title, artist, "Mixtape"
  const barX = padX - 16, barW = W - barX * 2;
  x.save(); rr(x, barX, barY, barW, barH, 54); x.fillStyle = "rgba(255,255,255,0.15)"; x.fill();
  x.lineWidth = 2.5; x.strokeStyle = "rgba(255,255,255,0.34)"; x.stroke(); x.restore();
  const artSize = 144, artX = barX + 36, artY = barY + (barH - artSize) / 2;
  x.save(); rr(x, artX, artY, artSize, artSize, 24); x.clip();
  if (im) x.drawImage(im, artX, artY, artSize, artSize); else { x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(artX, artY, artSize, artSize); }
  x.restore();

  x.font = `500 38px ${FONT}`; const tagW = x.measureText("Mixtape").width;
  const metaX = artX + artSize + 34, maxMetaW = barX + barW - 40 - tagW - 30 - metaX;
  const fit = (str, font) => { x.font = font; if (x.measureText(str).width <= maxMetaW) return str; let t = str; while (t.length > 1 && x.measureText(t + "…").width > maxMetaW) t = t.slice(0, -1); return t + "…"; };
  x.textBaseline = "alphabetic"; x.fillStyle = "#ffffff";
  const title = meta.title || "Unknown Title", artistName = (first(meta.uploader) || "Unknown Artist").toUpperCase();
  x.fillText(fit(title, `700 46px ${FONT}`), metaX, barY + barH / 2 - 8);
  x.fillStyle = "rgba(255,255,255,0.55)"; x.fillText(fit(artistName, `700 34px ${FONT}`), metaX, barY + barH / 2 + 46);
  x.font = `500 38px ${FONT}`; x.fillStyle = "rgba(255,255,255,0.92)"; x.textAlign = "right"; x.fillText("Mixtape", barX + barW - 40, barY + barH / 2 + 12); x.textAlign = "left";

  lastCard = c;
  $("#lyrics").classList.remove("sharing");
  openModal(`<h3>Lyrics card</h3><img class="card" src="${c.toDataURL("image/png")}" alt="Lyrics card"/><button class="pill pill-acc" data-cardshare>${icon("share")}Share</button> <button class="pill" data-carddl>Download</button> <button class="pill" data-cardlink>Copy link</button>`);
};

/* ---------------- init ---------------- */
applySettings(); renderGenres(); renderQueue();
const d0 = new Date(), h0 = d0.getHours();
$("#greet").textContent = h0 < 5 ? "Good night" : h0 < 12 ? "Good morning" : h0 < 17 ? "Good afternoon" : h0 < 21 ? "Good evening" : "Good night";
$("#date").textContent = d0.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
/* ---------------- user name (saved in this browser) ---------------- */
const getName = () => { const n = store("sv-name"); return typeof n === "string" ? n.trim() : ""; };
const showName = () => { const n = getName() || "MixTape"; $("#brand-text").textContent = n; if ($("#pc-brand-name")) $("#pc-brand-name").textContent = n; };
function nameModal() {
  openModal(`<h3>What's your name?</h3><p style="color:var(--mut);line-height:1.5;margin-bottom:12px">It's saved only in this browser and shown at the top of your home screen.</p><input class="txt" id="user-name" placeholder="Your name" maxlength="30" autocomplete="off" value="${esc(getName())}" /><button class="pill pill-acc" data-namesave>Save</button> <button class="pill" data-nameskip>${getName() ? "Reset" : "Skip"}</button>`);
  setTimeout(() => { const i = $("#user-name"); if (i) { i.focus(); i.select(); } }, 300);
}
$("#brand-name").onclick = nameModal;
$("#modal").addEventListener("click", (e) => {
  if (e.target.closest("[data-namesave]")) {
    const v = $("#user-name").value.trim().slice(0, 30);
    if (v) { store("sv-name", v); toast("Saved"); } else { localStorage.removeItem("sv-name"); }
    showName(); if (curView === "settings") renderSettings(); closeModal();
  } else if (e.target.closest("[data-nameskip]")) {
    localStorage.removeItem("sv-name"); store("sv-name-asked", 1); showName(); if (curView === "settings") renderSettings(); closeModal();
  }
});
$("#modal").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "user-name") $("#modal [data-namesave]").click(); });
showName();
if (!getName() && !store("sv-name-asked")) { store("sv-name-asked", 1); nameModal(); }

document.fonts && document.fonts.ready.then(placeLens);
const warmYT = () => { if (S.engine === "youtube") ytEngine.preload(); };
document.readyState === "complete" ? warmYT() : addEventListener("load", warmYT);
lensLoop(); placePcLens(false); loadSources(); loadSaved().then(loadHome); loadPlaylists();
// Performance: pause ambient blob animations while actively scrolling + RAF-throttled resize
(() => {
  let scrollT = 0, resizeRaf = 0;
  addEventListener("scroll", () => {
    if (!root.classList.contains("is-scrolling")) root.classList.add("is-scrolling");
    clearTimeout(scrollT);
    scrollT = setTimeout(() => root.classList.remove("is-scrolling"), 140);
  }, { passive: true });
  addEventListener("resize", () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; placePcLens(false); });
  }, { passive: true });
})();
if ("serviceWorker" in navigator) {
  addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  pwaPrompt = e;
  $("#pwa-install-btn") && $("#pwa-install-btn").classList.remove("hidden");
  if (curView === "settings") renderSettings();
});
addEventListener("appinstalled", () => {
  pwaPrompt = null;
  $("#pwa-install-btn") && $("#pwa-install-btn").classList.add("hidden");
  toast("MixTape installed");
});

/* ---------------- "use Brave for background playback" notice ---------------- */
(async function braveNotice() {
  try {
    if (store("sv-brave") === "never") return;
    if (navigator.brave && (await navigator.brave.isBrave())) return;
    setTimeout(() => {
      if ($("#modal-back").classList.contains("open")) return;
      openModal(`<h3>Better with Brave</h3><p style="color:var(--mut);line-height:1.5;margin-bottom:6px">For music that keeps playing in the background and with the screen off, open MixTape in the <b style="color:var(--text)">Brave browser</b>.</p><button class="pill pill-acc" data-brave="ok">Got it</button> <button class="pill" data-brave="never">Don't show again</button>`);
    }, 1500);
  } catch (e) {}
})();
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-brave]"); if (!b) return;
  if (b.dataset.brave === "never") store("sv-brave", "never");
  closeModal();
});
