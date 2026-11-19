"""Multi-source lyrics. Every provider returns the same shape:
   {"synced": [{"t": sec, "text": str, "words": [{"t","e","text","sp"}]?, "agent": 0|1?, "bg": [{"words": [...]}]?}],
    "plain": str, "kind": "word"|"line"|"plain"}
"""
import base64
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import requests

from src.scraper import YTMusic, ytm

UA = {"User-Agent": "Mozilla/5.0 (MixTape/1.0)"}


def _get(url, params=None, timeout=7, headers=None):
    clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    r = requests.get(url, params=clean, timeout=timeout, headers={**UA, **(headers or {})})
    r.raise_for_status()
    return r


# ----------------------------------------------------------------- parsers
_LRC = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")
_ELRC_W = re.compile(r"<(\d+):(\d+(?:\.\d+)?)>")
_CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]")


def _join(words):
    return "".join(w["text"] + (" " if w.get("sp", True) else "") for w in words).strip()


def _words_from_syllables(sylls):
    """[(start, end, text)] -> words. Syllables without whitespace between them merge into one word."""
    words, cur, closed = [], None, True
    for t, e, text in sylls:
        text = text or ""
        core = text.strip()
        if not core:
            closed = True
            continue
        if cur is not None and not closed and not text[:1].isspace():
            cur["text"] += core
            cur["e"] = e
        else:
            cur = {"t": round(t, 3), "e": round(e, 3), "text": core}
            words.append(cur)
        closed = text[-1:].isspace()
    for w in words:
        w["sp"] = not _CJK.search(w["text"])
    return words


def _line(t, words, text=None):
    text = text if text else _join(words)
    out = {"t": round(t, 3), "text": text}
    if words:
        out["words"] = words
    return out


def parse_lrc(text):
    lines = []
    for raw in text.splitlines():
        stamps = _LRC.findall(raw)
        body = _LRC.sub("", raw).strip()
        if not stamps or not body:
            continue
        for m, s in stamps:
            lines.append({"t": round(int(m) * 60 + float(s), 2), "text": body})
    return sorted(lines, key=lambda l: l["t"])


def parse_elrc(text):
    """Enhanced LRC: [mm:ss.xx]<mm:ss.xx>word <mm:ss.xx>word"""
    out = []
    for raw in text.splitlines():
        stamps = _LRC.findall(raw)
        if not stamps:
            continue
        body = _LRC.sub("", raw, count=len(stamps))
        parts = _ELRC_W.split(body)
        lt = int(stamps[0][0]) * 60 + float(stamps[0][1])
        if len(parts) < 4:
            if body.strip():
                out.append({"t": round(lt, 2), "text": body.strip()})
            continue
        toks = [(int(parts[i]) * 60 + float(parts[i + 1]), parts[i + 2]) for i in range(1, len(parts) - 2, 3)]
        sylls = [(t, toks[k + 1][0] if k + 1 < len(toks) else t + 0.5, txt) for k, (t, txt) in enumerate(toks)]
        words = _words_from_syllables(sylls)
        if words:
            out.append(_line(lt, words))
    return sorted(out, key=lambda l: l["t"])


def _ttml_time(s):
    if not s:
        return None
    s = s.strip()
    try:
        if s.endswith("ms"):
            return float(s[:-2]) / 1000
        if s.endswith("s"):
            return float(s[:-1])
        v = 0.0
        for p in s.split(":"):
            v = v * 60 + float(p)
        return v
    except ValueError:
        return None


def _tag(el):
    return el.tag.split("}")[-1] if isinstance(el.tag, str) else ""


def _attr(el, name):
    return next((v for k, v in el.attrib.items() if k.split("}")[-1] == name), None)


def _collect_sylls(node, in_bg, main, bg):
    """Leaf <span>s -> (start, end, text). Spans inside an x-bg wrapper are background vocals."""
    for ch in node:
        if _tag(ch) != "span":
            continue
        is_bg = in_bg or _attr(ch, "role") == "x-bg"
        if any(_tag(c) == "span" for c in ch):
            _collect_sylls(ch, is_bg, main, bg)
            continue
        st = _ttml_time(ch.get("begin"))
        if st is None:
            continue
        se = _ttml_time(ch.get("end"))
        (bg if is_bg else main).append((st, se if se is not None else st + 0.3, (ch.text or "") + (ch.tail or "")))


def parse_ttml(xml):
    """Apple-style TTML. Also reads the singer (ttm:agent -> "agent": 0/1 for duets) and background vocals ("bg")."""
    root = ET.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    out, agents = [], []
    for p in root.iter():
        if _tag(p) != "p":
            continue
        t = _ttml_time(p.get("begin"))
        main, bgs = [], []
        _collect_sylls(p, False, main, bgs)
        words = _words_from_syllables(main)
        agent = _attr(p, "agent")
        if agent and agent not in agents:
            agents.append(agent)
        if words:
            ln = _line(t if t is not None else words[0]["t"], words)
            bw = _words_from_syllables(bgs)
            if bw:  # background vocals are usually written "(like this)": drop the brackets
                bw[0]["text"] = bw[0]["text"].lstrip("(")
                bw[-1]["text"] = bw[-1]["text"].rstrip(")")
                ln["bg"] = [{"words": [w for w in bw if w["text"]]}]
            if agent:
                ln["_agent"] = agent
            out.append(ln)
        else:
            text = " ".join("".join(p.itertext()).split())
            if text and t is not None:
                out.append({"t": round(t, 3), "text": text})
    if len(agents) > 1:  # a duet: first singer left, everyone else right
        for ln in out:
            ln["agent"] = 0 if ln.get("_agent") in (None, agents[0]) else 1
    for ln in out:
        ln.pop("_agent", None)
    return sorted(out, key=lambda l: l["t"])


def parse_kpoe(j):
    """LyricsPlus (KPoe): lyrics[{time ms, duration ms, text, syllabus[{time, duration, text}]}]"""
    out = []
    for l in j.get("lyrics") or []:
        t = (l.get("time") or 0) / 1000.0
        sy = l.get("syllabus") or []
        words = _words_from_syllables([((s.get("time") or 0) / 1000, ((s.get("time") or 0) + (s.get("duration") or 300)) / 1000, s.get("text") or "") for s in sy])
        text = (l.get("text") or "").strip()
        if words or text:
            out.append(_line(t, words, None if not text else text) if words else {"t": round(t, 3), "text": text})
    return sorted(out, key=lambda l: l["t"])


def parse_pax_apple(j):
    out = []
    for l in (j.get("content") if isinstance(j, dict) else None) or []:
        lt = (l.get("timestamp") or 0) / 1000
        tx = l.get("text")
        if isinstance(tx, list):
            words = []
            for w in tx:
                st = (w.get("timestamp") if w.get("timestamp") is not None else l.get("timestamp") or 0) / 1000
                en = (w.get("endtime") or l.get("endtime") or 0) / 1000
                txt = (w.get("text") or "").strip()
                if not txt:
                    continue
                if w.get("part") and words:
                    words[-1]["text"] += txt
                    words[-1]["e"] = round(en, 3)
                else:
                    words.append({"t": round(st, 3), "e": round(en, 3), "text": txt})
            for w in words:
                w["sp"] = not _CJK.search(w["text"])
            if words:
                ln = _line(lt, words)
                if l.get("oppositeTurn"):
                    ln["agent"] = 1
                out.append(ln)
        elif isinstance(tx, str) and tx.strip():
            ln = {"t": round(lt, 3), "text": tx.strip()}
            if l.get("oppositeTurn"):
                ln["agent"] = 1
            out.append(ln)
    return sorted(out, key=lambda l: l["t"])


def parse_mxm_rich(arr):
    out = []
    for l in arr:
        ts, te = float(l.get("ts", 0)), float(l.get("te", 0))
        parts = l.get("l") or []
        sylls = [(ts + float(p.get("o", 0)), (ts + float(parts[i + 1].get("o", 0))) if i + 1 < len(parts) else te, p.get("c", "")) for i, p in enumerate(parts)]
        words = _words_from_syllables(sylls)
        if words:
            out.append(_line(ts, words, (l.get("x") or "").strip() or None))
    return sorted(out, key=lambda l: l["t"])


_YRC_L = re.compile(r"^\[(\d+),(\d+)\](.*)$")
_YRC_W = re.compile(r"\((\d+),(\d+),\d+\)([^\(]*)")


def parse_yrc(text):
    out = []
    for raw in text.splitlines():
        m = _YRC_L.match(raw.strip())
        if not m:
            continue
        sylls = [(int(a) / 1000, (int(a) + int(b)) / 1000, txt) for a, b, txt in _YRC_W.findall(m.group(3))]
        words = _words_from_syllables(sylls)
        if words:
            out.append(_line(int(m.group(1)) / 1000, words))
    return sorted(out, key=lambda l: l["t"])


# ----------------------------------------------------------------- helpers
def _res(synced=None, plain=""):
    if synced:
        kind = "word" if any(l.get("words") for l in synced) else "line"
        return {"synced": synced, "plain": "", "kind": kind}
    return {"synced": [], "plain": plain or "", "kind": "plain"} if plain else None


def _pick(items, get_dur, dur):
    """Closest match by length (within 20 s); items with unknown length are a last resort."""
    if not items:
        return None
    if not dur:
        return items[0]
    known = [(abs(get_dur(i) - dur), i) for i in items if get_dur(i)]
    known.sort(key=lambda x: x[0])
    if known and known[0][0] <= 20:
        return known[0][1]
    unknown = [i for i in items if not get_dur(i)]
    return unknown[0] if unknown else None


def _g(o, k, default=None):
    return o.get(k, default) if isinstance(o, dict) else getattr(o, k, default)


# ----------------------------------------------------------------- providers (ctx: title, artist, full_artist, dur, vid)
def p_lrclib(c):
    for q in (f"{c['title']} {c['artist']}".strip(), c["title"]):
        try:
            items = _get("https://lrclib.net/api/search", {"q": q}).json()
        except Exception:
            continue
        synced = [i for i in items if i.get("syncedLyrics")]
        best = _pick(synced, lambda i: i.get("duration") or 0, c["dur"])
        if best:
            return _res(parse_elrc(best["syncedLyrics"]) or parse_lrc(best["syncedLyrics"]))
        for i in items:
            if i.get("plainLyrics"):
                return _res(plain=i["plainLyrics"])
    return None


def p_ytmusic(c):
    if not (YTMusic and c["vid"]):
        return None
    d = ytm().get_watch_playlist(videoId=c["vid"], limit=1)
    bid = d.get("lyrics")
    if not bid:
        return None
    try:
        ly = ytm().get_lyrics(bid, timestamps=True)
    except TypeError:
        ly = ytm().get_lyrics(bid)
    lines = _g(ly, "lyrics")
    if isinstance(lines, list):
        out = []
        for l in lines:
            st, tx = _g(l, "start_time"), (_g(l, "text") or "").strip()
            if st is not None and tx:
                out.append({"t": round(st / 1000, 2), "text": tx})
        if out:
            return _res(out)
        return _res(plain="\n".join((_g(l, "text") or "") for l in lines))
    if isinstance(lines, str):
        return _res(plain=lines)
    return None


def _netease_search(kw):
    h = {"Referer": "https://music.163.com/", "Cookie": "appver=2.0.2"}
    try:
        r = _get("https://music.163.com/api/search/get/web", {"s": kw, "type": 1, "offset": 0, "total": "true", "limit": 6}, headers=h).json()
    except Exception:
        r = requests.post("https://music.163.com/api/search/get", data={"s": kw, "type": 1, "offset": 0, "limit": 6}, headers={**UA, **h}, timeout=7).json()
    return (r.get("result") or {}).get("songs") or [], h


def p_netease(c):
    songs, h = _netease_search(f"{c['title']} {c['artist']}".strip())
    best = _pick(songs, lambda s: (s.get("duration") or s.get("dt") or 0) / 1000, c["dur"])
    if not best:
        return None
    ly = _get("https://music.163.com/api/song/lyric", {"id": best["id"], "lv": -1, "kv": -1, "tv": -1, "yv": -1}, headers=h).json()
    yrc = (ly.get("yrc") or {}).get("lyric")
    if yrc:
        parsed = parse_yrc(yrc)
        if parsed:
            return _res(parsed)
    lrc = (ly.get("lrc") or {}).get("lyric")
    return _res(parse_lrc(lrc)) if lrc else None


def p_kugou(c):
    kw = f"{c['title']} {c['artist']}".strip()
    s = _get("https://mobileservice.kugou.com/api/v3/search/song", {"format": "json", "keyword": kw, "page": 1, "pagesize": 8}).json()
    infos = (s.get("data") or {}).get("info") or []
    best = _pick(infos, lambda i: i.get("duration") or 0, c["dur"])
    if not best:
        return None
    cand = _get("https://lyrics.kugou.com/search", {"ver": 1, "man": "yes", "client": "pc", "keyword": kw, "duration": int(c["dur"] * 1000) if c["dur"] else "", "hash": best.get("hash")}).json().get("candidates") or []
    if not cand:
        return None
    d = _get("https://lyrics.kugou.com/download", {"ver": 1, "client": "pc", "id": cand[0]["id"], "accesskey": cand[0]["accesskey"], "fmt": "lrc", "charset": "utf8"}).json()
    txt = base64.b64decode(d.get("content") or "").decode("utf-8", "ignore").lstrip("\ufeff")
    return _res(parse_lrc(txt)) if txt else None


def p_simpmusic(c):
    if not c["vid"]:
        return None
    items = _get(f"https://api-lyrics.simpmusic.org/v1/{c['vid']}").json().get("data") or []
    best = _pick(items, lambda i: i.get("durationSeconds") or 0, c["dur"]) or (items[0] if items else None)
    if not best:
        return None
    rich = best.get("richSyncLyrics")
    if rich:
        try:
            parsed = parse_mxm_rich(json.loads(rich)) if rich.lstrip().startswith("[{") else parse_elrc(rich)
            if parsed:
                return _res(parsed)
        except Exception:
            pass
    if best.get("syncedLyrics"):
        return _res(parse_lrc(best["syncedLyrics"]))
    return _res(plain=best.get("plainLyric") or "")


def p_betterlyrics(c):
    for path in ("/getLyrics", "/ttml/getLyrics"):
        try:
            r = _get("https://lyrics-api.boidu.dev" + path, {"s": c["title"], "a": c["artist"]}, timeout=8)
        except Exception:
            continue
        txt = r.text.strip()
        try:
            j = r.json()
            txt = j.get("ttml") or j.get("lyrics") or "" if isinstance(j, dict) else ""
        except ValueError:
            pass
        if txt.lstrip().startswith("<"):
            parsed = parse_ttml(txt)
            if parsed:
                return _res(parsed)
    return None


def p_lyricsplus(c):
    bases = [b.strip() for b in os.environ.get("LYRICSPLUS_URLS", "https://lyricsplus.prjktla.my.id").split(",") if b.strip()]
    for base in bases:
        try:
            j = _get(base.rstrip("/") + "/v2/lyrics/get", {"title": c["title"], "artist": c["artist"], "duration": int(c["dur"]) if c["dur"] else "", "source": "apple,lyricsplus,musixmatch,spotify,musixmatch-word"}, timeout=9).json()
        except Exception:
            continue
        parsed = parse_kpoe(j) if isinstance(j, dict) else []
        if parsed:
            return _res(parsed)
    return None


def p_paxsenix(c):
    s = _get("https://itunes.apple.com/search", {"term": f"{c['title']} {c['artist']}".strip(), "entity": "song", "limit": 6}).json().get("results") or []
    best = _pick(s, lambda i: (i.get("trackTimeMillis") or 0) / 1000, c["dur"])
    if not best:
        return None
    j = _get("https://lyrics.paxsenix.org/apple-music/lyrics", {"id": best["trackId"]}, timeout=10).json()
    return _res(parse_pax_apple(j))


def p_karalyr(c):
    base = os.environ.get("KARALYR_URL", "").rstrip("/")
    if not base:
        return None
    j = _get(base + "/api/get", {"artist_name": c["artist"], "track_name": c["title"], "duration": int(c["dur"]) if c["dur"] else ""}).json()
    synced = j.get("syncedLyrics") if isinstance(j, dict) else None
    return _res(parse_elrc(synced) or parse_lrc(synced)) if synced else None


SOURCES = [
    {"id": "betterlyrics", "name": "BetterLyrics", "kind": "word", "note": "Apple Music style syllable timing from a community API", "fn": p_betterlyrics},
    {"id": "lyricsplus", "name": "LyricsPlus", "kind": "word", "note": "Word sync gathered from Apple Music, Spotify and Musixmatch", "fn": p_lyricsplus},
    {"id": "paxsenix", "name": "Apple Music (Paxsenix)", "kind": "word", "note": "Apple Music lyrics through the Paxsenix proxy", "fn": p_paxsenix},
    {"id": "netease", "name": "NetEase Cloud Music", "kind": "word", "note": "Word sync when available, otherwise line sync", "fn": p_netease},
    {"id": "karalyr", "name": "Karalyr", "kind": "word", "note": "Open karaoke database (set KARALYR_URL to enable)", "fn": p_karalyr, "env": "KARALYR_URL"},
    {"id": "lrclib", "name": "LRCLIB", "kind": "line", "note": "Open database of line-synced lyrics", "fn": p_lrclib},
    {"id": "ytmusic", "name": "YouTube Music", "kind": "line", "note": "Lyrics shown in YouTube Music", "fn": p_ytmusic},
    {"id": "simpmusic", "name": "SimpMusic", "kind": "line", "note": "Community lyrics matched by YouTube video", "fn": p_simpmusic},
    {"id": "kugou", "name": "KuGou", "kind": "line", "note": "Large catalogue, strong for Asian music", "fn": p_kugou},
]
_BY_ID = {s["id"]: s for s in SOURCES}


def _available(s):
    if s.get("env") and not os.environ.get(s["env"]):
        return False
    return not (s["id"] == "ytmusic" and not YTMusic)


def list_sources():
    return [{k: v for k, v in s.items() if k != "fn"} | {"available": _available(s)} for s in SOURCES]


# ----------------------------------------------------------------- orchestration
_cache = {}


def _clean_title(title):
    t = re.sub(r"[\(\[].*?[\)\]]", "", title or "")
    t = re.sub(r"(?i)\b(official|video|audio|lyrical|lyrics|hd|4k|music video)\b", "", t)
    return re.sub(r"\s+", " ", t.split("|")[0]).strip(" -")


def fetch_lyrics(title, artist="", duration=0, vid="", source="auto", strict=False, prefer="word"):
    full = re.sub(r"(?i)\s*-\s*topic|vevo", "", artist or "").strip()
    ctx = {"title": _clean_title(title), "artist": re.split(r",|&| feat\.?| ft\.?", full)[0].strip(), "full_artist": full, "dur": float(duration or 0), "vid": vid or ""}
    key = (ctx["title"].lower(), ctx["artist"].lower(), int(ctx["dur"] // 5), ctx["vid"], source, bool(strict), prefer)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < (3600 if hit[1].get("source") else 300):
        return hit[1]

    base = [s["id"] for s in SOURCES if _available(s)]
    if prefer == "line":
        base = [i for i in base if _BY_ID[i]["kind"] == "line"] + [i for i in base if _BY_ID[i]["kind"] == "word"]
    if source in _BY_ID and _available(_BY_ID[source]):
        order = [source] if strict else [source] + [i for i in base if i != source]
    else:
        order = base

    def run(pid):
        try:
            r = _BY_ID[pid]["fn"](ctx)
        except Exception:
            return None
        return {**r, "source": pid, "sourceName": _BY_ID[pid]["name"]} if r else None

    pool = ThreadPoolExecutor(max_workers=max(1, len(order)))
    futs = [(pid, pool.submit(run, pid)) for pid in order]
    deadline, found, plain = time.time() + 10, None, None
    for pid, f in futs:
        try:
            r = f.result(timeout=max(0.05, deadline - time.time()))
        except Exception:
            continue
        if not r:
            continue
        if r["synced"]:
            found = r
            break
        plain = plain or r
    pool.shutdown(wait=False, cancel_futures=True)
    out = found or plain or {"synced": [], "plain": "", "kind": "none", "source": None, "sourceName": ""}
    _cache[key] = (time.time(), out)
    return out
