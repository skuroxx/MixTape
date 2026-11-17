const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const root = document.documentElement;
root.classList.add("js");
const FMT = new Audio().canPlayType('audio/webm; codecs="opus"') ? "opus" : "aac";
const JSON_H = { "Content-Type": "application/json" };
const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* ---------------- settings ---------------- */
const DEF = { theme: "system", bold: false, hideNav: false, miniShape: "squircle", anim: "full", lite: false, fullArt: true, blend: true, fluid: true, dynColors: true, quality: "auto", autoplay: false, fade: 0, speed: 1, keepPitch: true, eq: "flat", eqCustom: [0, 0, 0, 0, 0], lyricSource: "auto", lyricStrict: false, lyricWord: true };
let S = { ...DEF, ...(store("sv-settings") || {}) };
const EQP = { flat: [0, 0, 0, 0, 0], bass: [6, 3, 0, 0, 0], vocal: [-2, 0, 3, 3, 0], acoustic: [3, 1, 0, 2, 3], treble: [0, 0, 0, 3, 6] };
const FREQ = ["60 Hz", "230 Hz", "910 Hz", "3.6 kHz", "14 kHz"];
const SET = [
  { title: "Appearance", rows: [
    { k: "theme", t: "seg", label: "Theme", opts: [["system", "System"], ["light", "Light"], ["dark", "Dark"], ["amoled", "AMOLED"]] },
    { k: "bold", t: "tog", label: "Bold text", desc: "Thicker fonts everywhere, including lyrics" },
    { k: "hideNav", t: "tog", label: "Hide navigation tabs" },
    { k: "miniShape", t: "seg", label: "Mini player artwork", opts: [["squircle", "Squircle"], ["circle", "Circle"]] }] },
  { title: "Artwork", rows: [
    { k: "fullArt", t: "tog", label: "Full-screen artwork", desc: "Edge-to-edge cover in the player" },
    { k: "blend", t: "tog", label: "Gradient blur", desc: "Blend the cover's bottom into the background" },
    { k: "fluid", t: "tog", label: "Fluid lyrics background", desc: "Slowly rotating blurred artwork" },
    { k: "dynColors", t: "tog", label: "Colours from artwork", desc: "Tint the whole app to match the playing song" }] },
  { title: "Audio & playback", rows: [
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
let saved = [], playlists = [], lists = {}, homeSecs = [], meta = null;
let queue = [], hist = [], origList = [], uidc = 0, srcLabel = "Queue";
let shuffleOn = false, repeatMode = 0, curPl = null, libTab = "liked", extending = false;
let toastTimer, searchTimer, sgTimer, searchSeq = 0, playSeq = 0, lyrSeq = 0, curVol = 0.85;
let artCache = store("sv-art") || {}, ST = store("sv-stats") || { sec: 0, plays: {}, artists: {} }, statDirty = false;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => { if (!Number.isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${r < 10 ? "0" : ""}${r}`; };
const hue = (s = "") => Math.abs([...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 360;
const vid = (u = "") => (u.match(/[?&]v=([^&]+)/) || [])[1] || u;
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

const engine = new AudioPlaybackEngine();

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
  c.toggle("no-fullart", !S.fullArt); c.toggle("no-blend", !S.blend); c.toggle("no-fluid", !S.fluid);
  engine.setPlaybackRate(+S.speed, S.keepPitch);
  applyEQ(); applyVol();
  if (!S.dynColors) resetTheme(); else if (meta && poster(meta)) { themeUrl = null; themeFrom(poster(meta)); }
  $("#auto-btn") && $("#auto-btn").classList.toggle("on", S.autoplay);
  placeLens();
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
  $("#settings-body").innerHTML = SET.map((sec) => `<div class="card-sec glass set-card"><h4>${sec.title}</h4>${sec.rows.map(setRow).join("")}</div>`).join("") +
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
function placeLens() {
  const lens = $("#lens"), b = $("#nav button.active");
  if (!b) { lens.classList.add("off"); return; }
  lens.classList.toggle("off", !NAVV.includes(curView));
  lens.style.left = b.offsetLeft + "px"; lens.style.top = b.offsetTop + "px"; lens.style.width = b.offsetWidth + "px"; lens.style.height = b.offsetHeight + "px";
}
function lensLoop(ms = 750) {
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
  $("#view-title").textContent = v === "playlist" ? ((playlists.find((p) => p.id === curPl) || {}).name || "Playlist") : VT[v];
  $("#back-btn").classList.toggle("hidden", NAVV.includes(v));
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
const acard = (a) => `<div class="acard pop" data-artist="${esc(a.name)}"><div class="art" style="${art(a)}"></div><b>${esc(a.name)}</b></div>`;
const hs = (arr, k) => `<div class="hscroll">${arr.map((t, i) => card(t, i, k)).join("")}</div>`;
const shelf = (title, sub, inner, shuf) => `<div class="card-sec glass"><div class="sec-head"><div><h4>${esc(title)}</h4><p>${esc(sub)}</p></div><div class="sec-tools">${inner.includes('class="hscroll"') ? `<button class="cbtn sm hs" data-hs="-1" style="--r:90deg" title="Scroll left">${icon("down")}</button><button class="cbtn sm hs" data-hs="1" style="--r:-90deg" title="Scroll right">${icon("down")}</button>` : ""}${shuf ? `<button class="cbtn acc" data-shuf="${shuf}" title="Shuffle play">${icon("shuffle")}</button>` : ""}</div></div>${inner}</div>`;
const getRecent = () => store("sv-recent") || [];
const GENRES = [["Pop", 330], ["Rock", 12], ["Hip Hop", 38], ["Indie", 150], ["Electronic", 190], ["R&B", 280], ["Metal", 0], ["Jazz", 45], ["Classical", 210], ["Country", 28], ["K-pop", 320], ["Punjabi", 55], ["Bollywood", 8], ["Lo-fi", 200]];
const renderGenres = () => { $("#genres").innerHTML = GENRES.map(([n]) => `<button class="gchip pop" data-genre="${esc(n)}">${esc(n)}</button>`).join(""); popIn($("#genres")); };

function renderHome() {
  const parts = [], all = [], rec = getRecent();
  if (rec.length) { lists.recent = rec; parts.push(shelf("Listen again", "From your listening history", hs(rec, "recent"), "recent")); }
  homeSecs.forEach((s, n) => {
    const k = "h" + n;
    if (s.kind === "artists") { parts.push(shelf(s.title, s.subtitle, `<div class="hscroll">${s.tracks.map(acard).join("")}</div>`)); return; }
    lists[k] = s.tracks; all.push(...s.tracks);
    parts.push(shelf(s.title, s.subtitle, s.kind === "list" ? `<div class="rows cols">${s.tracks.map((t, i) => row(t, i, k)).join("")}</div>` : hs(s.tracks, k), k));
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
  const p = playlists.find((x) => x.id === curPl); if (!p) { back(); return; }
  lists.pl = p.tracks;
  $("#view-title").textContent = p.name;
  $("#pl-body").innerHTML = `<div class="q-head"><h2>${esc(p.name)}</h2><p>${p.tracks.length} songs</p><div class="qbar"><button class="pill pill-acc sm" data-plplay>${icon("play")}Play</button><button class="pill sm glass" data-plshuf>${icon("shuffle")}Shuffle</button><button class="pill sm glass" data-pldel>${icon("trash")}Delete</button></div></div>` +
    (p.tracks.length ? `<div class="rows glass-list">${p.tracks.map((t, i) => row(t, i, "pl")).join("")}</div>` : `<p class="empty">Empty playlist. Use ⋯ on any song to add it here.</p>`);
  popIn($("#pl-body"));
}
function renderQueue() {
  $("#q-count").textContent = `${queue.length} song${queue.length === 1 ? "" : "s"}`;
  $("#auto-btn").classList.toggle("on", S.autoplay);
  const b = $("#queue-body");
  if (!queue.length) { b.innerHTML = `<p class="empty">Queue is empty. Play a song, or use ⋯ → Add to queue.</p>`; return; }
  const now = queue[0], up = queue.slice(1);
  b.innerHTML = `<div class="qsec">Now playing</div><div class="rows glass-list"><div class="row qrow now"><div class="art" style="${art(now)}"></div><div class="t"><b>${esc(now.title)}</b><span>${esc(now.uploader || "")}</span></div></div></div>` +
    (up.length ? `<div class="qsec">Next up</div><div class="rows glass-list">${up.map((t, i) => `<div class="row qrow" data-qj="${i + 1}"><span class="grip" data-grip title="Drag to reorder">${icon("grip")}</span><div class="art" style="${art(t)}"></div><div class="t"><b>${esc(t.title)}</b><span>${esc(t.uploader || "")}</span></div><button class="del" data-qrm="${i + 1}" title="Remove">${icon("close")}</button></div>`).join("")}</div>` : `<p class="empty">Nothing up next.</p>`);
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
}

/* ---------------- data ---------------- */
async function loadSaved() { try { saved = (await api("/api/playlist")).tracks || []; } catch (e) { saved = []; } renderLibrary(); renderTiles(); refreshMarks(); fixPosters(); }
async function loadHome() { try { homeSecs = (await api("/api/home")).sections || []; } catch (e) { homeSecs = []; } renderHome(); refreshMarks(); }
async function loadPlaylists() { try { playlists = (await api("/api/playlists")).playlists || []; } catch (e) { playlists = []; } if (curView === "library") renderLibrary(); if (curView === "playlist") renderPlaylist(); }
async function toggleSave(t) {
  if (!t) return;
  const idx = saved.findIndex((s) => vid(s.url) === vid(t.url));
  try {
    if (idx >= 0) { await api(`/api/playlist/${idx}`, { method: "DELETE" }); toast("Removed from liked"); }
    else { await api("/api/playlist", { method: "POST", headers: JSON_H, body: JSON.stringify(slim(t)) }); toast("Added to liked songs"); }
    await loadSaved();
  } catch (e) { toast("Error: " + e.message); }
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
  else if (act === "rmpl") { const p = playlists.find((x) => x.id === curPl); const i = p ? p.tracks.findIndex((x) => vid(x.url) === vid(t.url)) : -1; if (i >= 0) { try { await api(`/api/playlists/${curPl}/tracks/${i}`, { method: "DELETE" }); } catch (er) {} await loadPlaylists(); } }
});
function pickPlaylist(t) {
  menuT = t;
  openModal(`<h3>Add to playlist</h3>${playlists.map((p) => `<button class="opt" data-addpl="${p.id}"><div class="art" style="${art(p.tracks[0])}"></div><div><b>${esc(p.name)}</b><span style="color:var(--mut);font-size:.85rem">${p.tracks.length} songs</span></div></button>`).join("")}<input class="txt" id="np-name" placeholder="New playlist name" maxlength="60" style="margin-top:12px" /><button class="pill pill-acc" data-npcreate>Create & add</button>`);
}
function newPlaylistModal() { menuT = null; openModal(`<h3>New playlist</h3><input class="txt" id="np-name" placeholder="Playlist name" maxlength="60" /><button class="pill pill-acc" data-npcreate>Create</button>`); setTimeout(() => $("#np-name") && $("#np-name").focus(), 300); }
$("#modal").addEventListener("click", async (e) => {
  const add = e.target.closest("[data-addpl]"), mk = e.target.closest("[data-npcreate]");
  try {
    if (add) { await api(`/api/playlists/${add.dataset.addpl}/tracks`, { method: "POST", headers: JSON_H, body: JSON.stringify(slim(menuT)) }); closeModal(); toast("Added to playlist"); await loadPlaylists(); }
    if (mk) { const name = ($("#np-name").value || "").trim() || "New playlist"; const d = await api("/api/playlists", { method: "POST", headers: JSON_H, body: JSON.stringify({ name, tracks: menuT ? [slim(menuT)] : [] }) }); closeModal(); toast(`Created “${d.playlist.name}”`); await loadPlaylists(); }
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
  $("#play-pause-btn").innerHTML = i; $("#l-play").innerHTML = i; $("#mini-play").innerHTML = i;
  $("#mini").classList.toggle("playing", p); $("#player").classList.toggle("playing", p);
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
  $("#p-poster").setAttribute("style", st); $("#l-bg").setAttribute("style", st);
  $("#p-title").textContent = m.title; $("#p-artist").textContent = a1; marquee();
  $("#l-title").textContent = `${m.title}${a1 ? " • " + a1 : ""}`; $("#p-src").textContent = m.title || srcLabel;
  document.title = `MixTape - ${m.title}`;
  themeFrom(p); refreshMarks();
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: m.title, artist: m.uploader || "", artwork: p ? [{ src: p }] : [] });
}
const qual = () => (S.quality === "auto" ? (navigator.connection && (navigator.connection.saveData || /2g|3g/.test(navigator.connection.effectiveType || "")) ? "medium" : "high") : S.quality);
async function streamTrack(t) {
  const my = ++playSeq;
  setMeta({ ...t }); $("#codec-text").textContent = "Loading…";
  try {
    const qs = `fmt=${FMT}&quality=${qual()}`;
    const m = await api(`/api/extract?q=${encodeURIComponent(t.url)}&${qs}`);
    if (my !== playSeq) return;
    const full = { ...t }; if (!t.title || t.title === t.url) full.title = m.title; if (!t.uploader) full.uploader = m.uploader; if (!poster(t)) full.thumbnail = m.thumbnail; if (!t.duration) full.duration = m.duration;
    if (queue[0] && queue[0].uid === t.uid) queue[0] = full;
    setMeta(full); addRecent(full); countPlay(full);
    $("#codec-text").textContent = m.codec || "Streaming";
    loadLyrics(full);
    applyVol();
    await engine.loadAndPlay(`/stream?q=${encodeURIComponent(t.url)}&${qs}`, +S.speed);
    if (my !== playSeq) return;
    setPlayingUI(true);
  } catch (err) { if (my === playSeq) toast(`Error: ${err.message}`); }
}
function startCurrent() { if (!queue[0]) return; renderQueue(); streamTrack(queue[0]); maybeExtend(); }
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
    queue.push(...d.tracks.filter((t) => !have.has(vid(t.url))).map(withUid)); if (curView === "queue") renderQueue();
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
function resetSearch() { searchSeq++; qinput.value = ""; $("#clear-btn").classList.add("hidden"); $("#results").innerHTML = ""; $("#suggest").classList.add("hidden"); $("#browse").classList.remove("hidden"); }
function openSearch() { if (curView !== "search") push("search"); resetSearch(); setTimeout(() => qinput.focus(), 400); }
async function doSearch(q) {
  const my = ++searchSeq; $("#browse").classList.add("hidden");
  $("#results").innerHTML = `<div class="skel-block" style="height:200px;margin:8px"></div>`;
  try {
    const d = await api(`/api/search?q=${encodeURIComponent(q)}&n=12`);
    if (my !== searchSeq) return;
    lists.res = d.tracks;
    $("#results").innerHTML = d.tracks.length ? d.tracks.map((t, i) => row(t, i, "res")).join("") : `<p class="empty">No songs found for "${esc(q)}".</p>`;
    popIn($("#results"));
  } catch (e) { if (my === searchSeq) $("#results").innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}
async function suggest(q) {
  try {
    const d = await api(`/api/suggest?q=${encodeURIComponent(q)}`); if (qinput.value.trim() !== q) return;
    const list = (d.suggestions || []).filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 6), box = $("#suggest");
    box.innerHTML = list.map((s) => `<button data-sg="${esc(s)}">${icon("search", "s")}<span>${esc(s)}</span></button>`).join(""); box.classList.toggle("hidden", !list.length);
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
  if ((x = g("[data-sg]"))) { qinput.value = x.dataset.sg; $("#suggest").classList.add("hidden"); return doSearch(x.dataset.sg); }
  if ((x = g("[data-artist]"))) { if (curView !== "search") push("search"); qinput.value = x.dataset.artist; $("#clear-btn").classList.remove("hidden"); return doSearch(x.dataset.artist); }
  if ((x = g("[data-genre]"))) return startGenre(x.dataset.genre);
  if ((x = g("[data-lib]"))) { libTab = x.dataset.lib; return renderLibrary(); }
  if ((x = g("[data-pl]"))) { curPl = x.dataset.pl; renderPlaylist(); return push("playlist"); }
  if (g("[data-newpl]")) return newPlaylistModal();
  if (g("[data-gosettings]")) return push("settings");
  if (g("[data-libplay]")) return playList(saved, 0, "Liked songs");
  if (g("[data-libshuf]")) { shuffleOn = true; $("#shuffle-btn").classList.add("on"); return playList(saved, Math.floor(Math.random() * saved.length), "Liked songs"); }
  if (g("[data-plplay]")) return playList(lists.pl, 0, "Playlist");
  if (g("[data-plshuf]")) { shuffleOn = true; $("#shuffle-btn").classList.add("on"); const l = lists.pl; return playList(l, Math.floor(Math.random() * l.length), "Playlist"); }
  if (g("[data-pldel]")) { if (confirm("Delete this playlist?")) api(`/api/playlists/${curPl}`, { method: "DELETE" }).then(() => { back(); loadPlaylists(); }); return; }
  if ((x = g("[data-tog]"))) { const k = x.dataset.tog; setS(k, !S[k]); x.classList.toggle("on", S[k]); if ((k === "lyricStrict" || k === "lyricWord") && meta) loadLyrics(meta); return x.setAttribute("aria-checked", S[k]); }
  if ((x = g("[data-seg]"))) { const k = x.dataset.seg, v = x.dataset.v; setS(k, v); if (k === "lyricSource" && meta) loadLyrics(meta); if (k === "eq" || k === "lyricSource") renderSettings(); else x.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === x)); return; }
  if (g("[data-import]")) return doImport();
  if ((x = g("[data-l]"))) return playList(lists[x.dataset.l], +x.dataset.i, labelOf(x.dataset.l));
});
async function doImport() {
  const inp = $("#imp-url"), url = (inp.value || "").trim(), btn = $("[data-import]");
  if (!url) return toast("Paste a playlist link first");
  btn.disabled = true; btn.textContent = "Importing…"; toast("Importing. Big playlists can take a minute.");
  try { const d = await api("/api/import", { method: "POST", headers: JSON_H, body: JSON.stringify({ url }) }); toast(`Imported ${d.playlist.tracks.length} songs into “${d.playlist.name}”`); inp.value = ""; await loadPlaylists(); const c = $("#pl-count"); if (c) c.textContent = `${playlists.length} playlists`; }
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
$("#volume-bar").oninput = (e) => { curVol = parseFloat(e.target.value); paintRange(e.target); applyVol(); };
paintRange($("#volume-bar"));
$("#mute-btn").onclick = () => { engine.setMuted(!engine.muted); $("#mute-btn").classList.toggle("on", engine.muted); };
$("#p-like").onclick = () => toggleSave(meta);
$("#p-more").onclick = () => meta && showMenu(meta, "player");
$("#p-codec").onclick = () => { closePlayer(); push("settings"); };
$("#queue-btn").onclick = () => { closePlayer(); push("queue"); };
$("#auto-btn").onclick = () => { setS("autoplay", !S.autoplay); toast(S.autoplay ? "Autoplay on: similar songs keep playing" : "Autoplay off"); if (S.autoplay) maybeExtend(); };
$("#q-clear").onclick = () => { queue = queue.slice(0, 1); renderQueue(); };
const openPlayer = () => { $("#player").classList.add("open"); $("#player").setAttribute("aria-hidden", "false"); };
function closePlayer() { $("#lyrics").classList.remove("open", "sharing"); $("#player").classList.remove("open"); $("#player").setAttribute("aria-hidden", "true"); }
$("#p-close").onclick = closePlayer;
const mini = $("#mini"); let mg = null;
mini.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; mg = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; mini.setPointerCapture(e.pointerId); });
mini.addEventListener("pointermove", (e) => { if (!mg) return; mg.dx = e.clientX - mg.x; mg.dy = e.clientY - mg.y; mini.style.translate = `${mg.dx * 0.5}px ${Math.min(0, mg.dy) * 0.4}px`; });
mini.addEventListener("pointerup", () => { if (!mg) return; const { dx, dy } = mg; mg = null; mini.style.translate = ""; if (dy < -40 && Math.abs(dy) > Math.abs(dx)) openPlayer(); else if (dx < -70) next(); else if (dx > 70) prev(); else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) openPlayer(); });
mini.addEventListener("pointercancel", () => { mg = null; mini.style.translate = ""; });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if ($("#modal-back").classList.contains("open")) closeModal(); else if ($("#sheet").classList.contains("open")) closeSheet(); else if ($("#lyrics").classList.contains("open")) $("#l-back").click(); else closePlayer(); }
  if (e.code === "Space" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); toggle(); }
});
if ("mediaSession" in navigator) { const ms = navigator.mediaSession; ms.setActionHandler("play", toggle); ms.setActionHandler("pause", toggle); ms.setActionHandler("nexttrack", next); ms.setActionHandler("previoustrack", prev); }
engine.on("ended", () => { if (repeatMode === 2) { engine.currentTime = 0; engine.play(); } else next(); });
let lastT = 0;
engine.on("timeupdate", () => {
  const d = engine.duration, t = engine.currentTime, dt = t - lastT; lastT = t;
  if (dt > 0 && dt < 1.5 && !engine.paused && meta) { ST.sec += dt; const a = first(meta.uploader) || "Unknown"; ST.artists[a] = (ST.artists[a] || 0) + dt; statDirty = true; }
  if (S.fade > 0) applyVol();
  if (!Number.isFinite(d)) return;
  const p = (t / d) * 100;
  $$(".seek").forEach((s) => s.style.setProperty("--p", p));
  $("#mini-prog").style.width = `calc((100% - 60px)*${p / 100})`;
  $("#current-time").textContent = $("#l-cur").textContent = fmt(t);
  $("#duration-time").textContent = $("#l-left").textContent = "-" + fmt(d - t);
});
function bindSeek(seek) {
  const to = (e) => { const r = seek.getBoundingClientRect(), p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); if (Number.isFinite(engine.duration)) { engine.seek(p * engine.duration); $$(".seek").forEach((s) => s.style.setProperty("--p", p * 100)); } };
  const end = () => { seek.onpointermove = null; seek.classList.remove("drag"); };
  seek.addEventListener("pointerdown", (e) => { seek.setPointerCapture(e.pointerId); seek.classList.add("drag"); to(e); seek.onpointermove = to; });
  seek.addEventListener("pointerup", end); seek.addEventListener("pointercancel", end);
}
bindSeek($("#seek")); bindSeek($("#l-seek"));

/* ---------------- lyrics (estimated word sync) + share card ---------------- */
let lyr = { lines: [], words: [], idx: -1, off: 0, sel: new Set() }, raf = 0;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const KIND = { word: "WORD SYNC", line: "LINE SYNC", plain: "PLAIN TEXT", none: "NO LYRICS" };
async function loadLyrics(m, override) {
  const my = ++lyrSeq, sc = $("#l-scroll");
  lyr = { lines: [], words: [], idx: -1, off: lyr.off, sel: new Set() }; $("#lyrics").classList.remove("sharing");
  sc.innerHTML = `<p class="l-none">Looking for lyrics…</p>`; $("#l-badge").textContent = "SEARCHING…"; sc.scrollTop = 0;
  const src = override || S.lyricSource, strict = override ? (override !== "auto" ? 1 : 0) : (S.lyricStrict && S.lyricSource !== "auto" ? 1 : 0);
  try {
    const d = await api(`/api/lyrics?title=${encodeURIComponent(m.title)}&artist=${encodeURIComponent(m.uploader || "")}&duration=${m.duration || 0}&vid=${encodeURIComponent(vid(m.url))}&source=${src}&strict=${strict}&prefer=${S.lyricWord ? "word" : "line"}`);
    if (my !== lyrSeq) return;
    $("#l-badge").textContent = `${KIND[d.kind] || "LYRICS"}${d.sourceName ? " · " + d.sourceName : ""}`;
    if (d.synced && d.synced.length) {
      lyr.lines = d.synced;
      sc.innerHTML = d.synced.map((l, i) => `<div class="l-line" data-i="${i}">${(l.words || l.text.split(/\s+/).map((w) => ({ text: w, sp: true }))).map((w) => `<span class="w">${esc(w.text)}</span>${w.sp === false ? "" : " "}`).join("")}</div>`).join("");
      lyr.words = d.synced.map((l, i) => {
        const ws = [...sc.children[i].querySelectorAll(".w")];
        if (l.words && l.words.length === ws.length) return ws.map((el, k) => ({ el, ts: l.words[k].t, te: Math.max(l.words[k].e, l.words[k].t + 0.08) }));
        const nxt = d.synced[i + 1], span = Math.min((nxt ? nxt.t : l.t + 5) - l.t, 8) || 1, tot = ws.reduce((n, w) => n + w.textContent.length + 1, 0); let acc = 0;
        return ws.map((el) => { const s = acc / tot; acc += el.textContent.length + 1; return { el, ts: l.t + s * span, te: l.t + (acc / tot) * span }; });
      });
      lyrKick();
    } else if (d.plain) sc.innerHTML = `<div class="l-plain">${esc(d.plain)}</div>`;
    else sc.innerHTML = `<p class="l-none">No lyrics found${strict ? " from this source" : ""}. Tap the badge above to try another source.</p>`;
  } catch (e) { if (my === lyrSeq) { $("#l-badge").textContent = "LYRICS"; sc.innerHTML = `<p class="l-none">Lyrics unavailable right now.</p>`; } }
}
function tickLyrics(force) {
  const L = lyr.lines; if (!L.length) return;
  const t = engine.currentTime + lyr.off; let lo = 0, hi = L.length - 1, i = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (L[mid].t <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
  const sc = $("#l-scroll");
  if (i !== lyr.idx || force) {
    lyr.idx = i; [...sc.children].forEach((el, k) => { el.classList.toggle("now", k === i); el.classList.toggle("past", k < i); });
    if (i < 0) sc.scrollTo({ top: 0 }); else { const el = sc.children[i]; if (el) sc.scrollTo({ top: el.offsetTop - sc.clientHeight * 0.3, behavior: "smooth" }); }
  }
  if (i >= 0) lyr.words[i].forEach((w) => w.el.style.setProperty("--f", clamp01((t - w.ts) / Math.max(0.05, w.te - w.ts))));
}
function lyrKick() { if (raf) return; const f = () => { raf = 0; if (!$("#lyrics").classList.contains("open") || !lyr.lines.length) return; tickLyrics(); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
$("#p-lyrics").onclick = () => { $("#lyrics").classList.add("open"); lyr.idx = -2; lyrKick(); };
$("#l-back").onclick = () => { $("#lyrics").classList.remove("open", "sharing"); };
const setOff = (d) => { lyr.off = Math.round((lyr.off + d) * 10) / 10; $("#l-offv").textContent = (lyr.off > 0 ? "+" : "") + lyr.off.toFixed(1) + "s"; };
function pickLyricSource() {
  openModal(`<h3>Lyrics source</h3>${[{ id: "auto", name: "Auto", kind: "", note: "Tries every source and uses the best match", available: true }, ...SRCS].map((s) => `<button class="opt" data-lsrc="${s.id}"${s.available === false ? " disabled" : ""}><div><b>${esc(s.name)}${s.kind ? " · " + (s.kind === "word" ? "word sync" : "line sync") : ""}</b><span style="color:var(--mut);font-size:.85rem;display:block">${esc(s.note || "")}${s.available === false ? " (not available)" : ""}</span></div></button>`).join("")}`);
}
$("#l-badge").onclick = pickLyricSource;
$("#l-minus").onclick = () => setOff(-0.5); $("#l-plus").onclick = () => setOff(0.5);
$("#l-share").onclick = () => { if (!lyr.lines.length) return toast("Synced lyrics are needed to make a card"); $("#lyrics").classList.toggle("sharing"); lyr.sel.clear(); $$(".l-line").forEach((l) => l.classList.remove("sel")); $("#l-selcount").textContent = "Tap lines to select"; };
$("#l-cancel").onclick = () => $("#lyrics").classList.remove("sharing");
$("#l-scroll").addEventListener("click", (e) => {
  const el = e.target.closest(".l-line"); if (!el) return; const i = +el.dataset.i;
  if ($("#lyrics").classList.contains("sharing")) { if (lyr.sel.has(i)) lyr.sel.delete(i); else if (lyr.sel.size < 6) lyr.sel.add(i); else toast("Up to 6 lines"); el.classList.toggle("sel", lyr.sel.has(i)); $("#l-selcount").textContent = lyr.sel.size ? `${lyr.sel.size} line${lyr.sel.size > 1 ? "s" : ""} selected` : "Tap lines to select"; }
  else engine.seek(Math.max(0, lyr.lines[i].t - lyr.off));
});
const rr = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
const wrapText = (x, text, maxW) => { const out = []; let line = ""; text.split(" ").forEach((w) => { const t = line ? line + " " + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; };
const loadImg = (u) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = /^https:\/\//.test(u) ? `/api/art?u=${encodeURIComponent(u)}` : u; });
$("#l-make").onclick = async () => {
  const text = [...lyr.sel].sort((a, b) => a - b).map((i) => lyr.lines[i].text); if (!text.length) return toast("Select some lines first");
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"), cs = getComputedStyle(root);
  const c1 = cs.getPropertyValue("--c1") || "#8a4a32", c2 = cs.getPropertyValue("--c2") || "#4b3a7a", c3 = cs.getPropertyValue("--c3") || "#1a0f0b";
  let g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, c3); x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(W * 0.9, H * 0.15, 0, W * 0.9, H * 0.15, W * 0.8); g.addColorStop(0, c2); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  rr(x, 70, 90, W - 140, H - 180, 64); x.fillStyle = "rgba(255,255,255,.13)"; x.fill(); x.lineWidth = 3; x.strokeStyle = "rgba(255,255,255,.4)"; x.stroke();
  try { const im = await loadImg(poster(meta)); x.save(); rr(x, 130, 150, 170, 170, 34); x.clip(); x.drawImage(im, 130, 150, 170, 170); x.restore(); } catch (e) {}
  x.fillStyle = "#fff"; x.textBaseline = "alphabetic"; x.font = '800 46px "Google Sans","Segoe UI",Roboto,sans-serif';
  const t1 = wrapText(x, meta.title, W - 520)[0] || meta.title; x.fillText(t1.length < meta.title.length ? t1 + "…" : t1, 330, 215);
  x.font = '600 36px "Google Sans","Segoe UI",Roboto,sans-serif'; x.fillStyle = "rgba(255,255,255,.75)"; x.fillText(first(meta.uploader), 330, 272);
  let size = 72, lines; const maxH = H - 560;
  for (; size >= 36; size -= 4) { x.font = `800 ${size}px "Google Sans","Segoe UI",Roboto,sans-serif`; lines = text.flatMap((t) => wrapText(x, t, W - 300)); if (lines.length * size * 1.28 <= maxH) break; }
  x.fillStyle = "#fff"; lines.forEach((l, i) => x.fillText(l, 130, 430 + (i + 1) * size * 1.28 - size * 0.3));
  x.font = '800 30px "Google Sans","Segoe UI",Roboto,sans-serif'; x.fillStyle = "rgba(255,255,255,.8)"; x.fillText("MIXTAPE", 130, H - 140);
  lastCard = c; $("#lyrics").classList.remove("sharing");
  openModal(`<h3>Lyrics card</h3><img class="card" src="${c.toDataURL("image/png")}" alt="Lyrics card"/><button class="pill pill-acc" data-cardshare>${icon("share")}Share</button> <button class="pill" data-carddl>Download</button> <button class="pill" data-cardlink>Copy link</button>`);
};

/* ---------------- init ---------------- */
applySettings(); renderGenres(); renderQueue();
const d0 = new Date(), h0 = d0.getHours();
$("#greet").textContent = h0 < 5 ? "Good night" : h0 < 12 ? "Good morning" : h0 < 17 ? "Good afternoon" : h0 < 21 ? "Good evening" : "Good night";
$("#date").textContent = d0.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
document.fonts && document.fonts.ready.then(placeLens);
lensLoop(); loadSources(); loadSaved().then(loadHome); loadPlaylists();
