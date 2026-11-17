import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import requests
import yt_dlp

try:
    from ytmusicapi import YTMusic
except Exception:  # ytmusicapi missing: fall back to plain YouTube search
    YTMusic = None

# ---------------------------------------------------------------------------
# tiny in-memory TTL cache (nothing is written to disk)
# ---------------------------------------------------------------------------
_cache: dict = {}


def _cached(key: str, ttl: int, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    value = fn()
    _cache[key] = (time.time(), value)
    return value


# ---------------------------------------------------------------------------
# Audio stream resolving (Opus preferred, AAC fallback for browsers without Opus)
# ---------------------------------------------------------------------------
_FMT = {
    ("opus", "high"): "bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio/best",
    ("opus", "medium"): "bestaudio[acodec=opus][abr<=135]/bestaudio[abr<=135]/bestaudio/best",
    ("opus", "low"): "bestaudio[acodec=opus][abr<=70]/worstaudio[acodec=opus]/worstaudio/best",
    ("aac", "high"): "bestaudio[ext=m4a]/bestaudio/best",
    ("aac", "medium"): "bestaudio[ext=m4a][abr<=130]/bestaudio[ext=m4a]/bestaudio/best",
    ("aac", "low"): "worstaudio[ext=m4a]/worstaudio/best",
}


def _codec_label(acodec: str, abr) -> str:
    acodec = (acodec or "").lower()
    if "opus" in acodec:
        name, short = "Opus", "OPUS"
    elif "mp4a" in acodec or "aac" in acodec:
        name, short = "AAC", "AAC"
    else:
        name = short = acodec.upper() or "AUDIO"
    rate = f" {round(abr)} kbps" if abr else ""
    return f"{name} \u2022 {short}{rate}"


def extract_stream_info(query_or_url: str, prefer: str = "opus", quality: str = "high") -> dict:
    """Resolve a direct audio stream URL + metadata. Nothing is downloaded."""
    target = query_or_url.strip()
    if not target.startswith(("http://", "https://")):
        target = f"ytsearch1:{target}"
    prefer = prefer if prefer in ("opus", "aac") else "opus"
    quality = quality if quality in ("high", "medium", "low") else "high"

    def run():
        opts = {
            "format": _FMT[(prefer, quality)], "noplaylist": True, "quiet": True,
            "no_warnings": True, "extract_flat": False, "skip_download": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(target, download=False)
            if "entries" in info and info["entries"]:
                info = info["entries"][0]
            stream_url = info.get("url")
            if not stream_url:
                raise ValueError("Could not resolve a direct audio stream URL.")
            return {
                "title": info.get("title", "Unknown Track"),
                "uploader": (info.get("artist") or info.get("uploader") or "Unknown Artist").replace(" - Topic", ""),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "webpage_url": info.get("webpage_url", query_or_url),
                "stream_url": stream_url,
                "http_headers": info.get("http_headers", {}),
                "acodec": info.get("acodec"),
                "abr": info.get("abr"),
                "ext": info.get("ext"),
                "codec": _codec_label(info.get("acodec"), info.get("abr")),
            }

    return _cached(f"x:{prefer}:{quality}:{target}", 1200, run)


# ---------------------------------------------------------------------------
# YouTube Music: square cover art, songs, radio and artists
# ---------------------------------------------------------------------------
_ytm = None


def ytm():
    global _ytm
    if _ytm is None:
        try:
            _ytm = YTMusic(language="en", location=os.environ.get("YTM_LOCATION", "IN"))
        except Exception:
            _ytm = YTMusic()
    return _ytm


def _art(thumbs, size: int = 544) -> str:
    if not thumbs:
        return ""
    best = sorted(thumbs, key=lambda t: t.get("width", 0))[-1]["url"]
    if "googleusercontent" in best or "ggpht" in best:
        best = re.sub(r"=w\d+-h\d+[^\s]*$", f"=w{size}-h{size}-l90-rj", best)
        best = re.sub(r"=s\d+[^\s]*$", f"=s{size}-c", best)
    return best


def _dur(v) -> int:
    if isinstance(v, (int, float)):
        return int(v)
    try:
        secs = 0
        for part in str(v).split(":"):
            secs = secs * 60 + int(part)
        return secs
    except Exception:
        return 0


def _song(r: dict):
    vid = r.get("videoId")
    if not vid:
        return None
    artists = ", ".join(a["name"] for a in (r.get("artists") or []) if a.get("name"))
    album = r.get("album")
    return {
        "id": vid,
        "title": r.get("title") or "Unknown Track",
        "uploader": artists,
        "album": album.get("name", "") if isinstance(album, dict) else "",
        "duration": r.get("duration_seconds") or _dur(r.get("duration") or r.get("length")),
        "thumbnail": _art(r.get("thumbnails") or r.get("thumbnail") or []),
        "url": f"https://www.youtube.com/watch?v={vid}",
    }


def _yt_flat(query: str, limit: int) -> list:
    """Fallback: plain YouTube search (video thumbnails)."""
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    out = []
    for e in (info or {}).get("entries") or []:
        vid = e.get("id")
        if vid:
            out.append({
                "id": vid, "title": e.get("title") or "Unknown Track",
                "uploader": (e.get("uploader") or e.get("channel") or "").replace(" - Topic", ""),
                "duration": e.get("duration") or 0, "album": "",
                "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "url": f"https://www.youtube.com/watch?v={vid}",
            })
    return out


def search_tracks(query: str, limit: int = 8) -> list:
    def run():
        if YTMusic:
            try:
                res = ytm().search(query, filter="songs", limit=limit)
                out = [s for s in map(_song, res) if s]
                if out:
                    return out[:limit]
            except Exception:
                pass
        return _yt_flat(query, limit)

    return _cached(f"s:{limit}:{query.lower()}", 600, run)


def get_radio(video_id: str, limit: int = 25) -> list:
    """YouTube Music 'up next' radio for a song, used for suggestions and autoplay."""

    def run():
        d = ytm().get_watch_playlist(videoId=video_id, radio=True, limit=limit)
        return [s for s in map(_song, d.get("tracks") or []) if s and s["id"] != video_id]

    return _cached(f"r:{video_id}", 1800, run)


def _artist_card(name: str):
    def run():
        try:
            r = ytm().search(name, filter="artists", limit=1)
            if r:
                return {"name": r[0].get("artist") or name, "thumbnail": _art(r[0].get("thumbnails"))}
        except Exception:
            pass
        return None

    return _cached(f"a:{name.lower()}", 86400, run)


def build_home(seeds: list) -> list:
    """YouTube-Music-style home. `seeds` = [{vid,title,uploader}] newest saved first."""
    jobs = []
    if seeds and YTMusic:
        s = seeds[0]
        jobs.append(("list", "Quick picks", "Songs picked from what you play", lambda s=s: get_radio(s["vid"], 12)[:8]))
    else:
        jobs.append(("list", "Quick picks", "Trending songs worth playing now", lambda: search_tracks("top trending songs", 8)))
    if YTMusic:
        for s in seeds[:2]:
            who = (s.get("uploader") or s["title"]).split(",")[0][:30]
            jobs.append(("cards", f"Similar to {who}", "Songs you might like", lambda s=s: get_radio(s["vid"], 20)[:12]))
    jobs += [
        ("cards", "Trending now", "What everyone is playing", lambda: search_tracks("top songs this week", 12)),
        ("cards", "Feel good", "Bright, easy songs", lambda: search_tracks("feel good songs", 12)),
        ("cards", "Chill", "Slow it down", lambda: search_tracks("chill vibes songs", 12)),
        ("cards", "Fresh finds", "New tracks beyond your usual rotation", lambda: search_tracks("new songs this month", 12)),
    ]

    def run(job):
        try:
            return job[3]()
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(run, jobs))
    sections = [{"kind": j[0], "title": j[1], "subtitle": j[2], "tracks": r} for j, r in zip(jobs, results) if r]

    if YTMusic and sections:
        names, seen = [], set()
        for sec in sections:
            for t in sec["tracks"]:
                n = (t.get("uploader") or "").split(",")[0].strip()
                if n and n.lower() not in seen:
                    seen.add(n.lower()); names.append(n)
        with ThreadPoolExecutor(max_workers=5) as pool:
            artists = [a for a in pool.map(_artist_card, names[:8]) if a and a["thumbnail"]]
        if artists:
            sections.insert(1, {"kind": "artists", "title": "Artists for you", "subtitle": "Worth another listen", "tracks": artists})
    return sections


# ---------------------------------------------------------------------------
# Lyrics (lrclib.net, time-synced when available)
# ---------------------------------------------------------------------------
_LRC = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")


def _parse_lrc(text: str) -> list:
    lines = []
    for raw in text.splitlines():
        stamps = _LRC.findall(raw)
        body = _LRC.sub("", raw).strip()
        if not stamps or not body:
            continue
        for m, s in stamps:
            lines.append({"t": round(int(m) * 60 + float(s), 2), "text": body})
    return sorted(lines, key=lambda l: l["t"])


def get_lyrics(title: str, artist: str = "", duration: float = 0) -> dict:
    clean = re.sub(r"[\(\[].*?[\)\]]", "", title)
    clean = re.sub(r"(?i)\b(official|video|audio|lyrical|lyrics|hd|4k|music video)\b", "", clean)
    clean = re.sub(r"\s+", " ", clean.split("|")[0]).strip(" -")
    artist = re.sub(r"(?i)\s*-\s*topic|vevo", "", artist or "").strip()
    duration = float(duration or 0)

    def run():
        for q in (f"{clean} {artist}".strip(), clean):
            try:
                r = requests.get("https://lrclib.net/api/search", params={"q": q}, timeout=8,
                                 headers={"User-Agent": "MixTape/1.0"})
                items = r.json() if r.ok else []
            except Exception:
                continue
            synced = [it for it in items if it.get("syncedLyrics")]
            if synced:
                if duration:
                    synced.sort(key=lambda it: abs((it.get("duration") or 0) - duration))
                return {"synced": _parse_lrc(synced[0]["syncedLyrics"]), "plain": ""}
            for it in items:
                if it.get("plainLyrics"):
                    return {"synced": [], "plain": it["plainLyrics"]}
        return {"synced": [], "plain": ""}

    return _cached(f"l:{clean.lower()}:{artist.lower()}:{int(duration)}", 3600, run)


def get_suggestions(q: str) -> list:
    """Search autocomplete (YouTube Music)."""

    def run():
        try:
            return ytm().get_search_suggestions(q)[:8]
        except Exception:
            return []

    return _cached(f"g:{q.lower()}", 600, run)


def _import_spotify(url: str) -> dict:
    m = re.search(r"(playlist|album)[/:]([A-Za-z0-9]+)", url)
    if not m:
        raise ValueError("Only Spotify playlist and album links are supported.")
    kind, sid = m.groups()
    r = requests.get(f"https://open.spotify.com/embed/{kind}/{sid}", timeout=12, headers={"User-Agent": "Mozilla/5.0"})
    mm = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
    if not mm:
        raise ValueError("Couldn't read that Spotify link.")
    ent = json.loads(mm.group(1))["props"]["pageProps"]["state"]["data"]["entity"]
    items = ent.get("trackList") or []

    def resolve(it):
        try:
            res = search_tracks(f'{it.get("title", "")} {it.get("subtitle", "")}'.strip(), 1)
            return res[0] if res else None
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        found = list(pool.map(resolve, items[:80]))
    return {"name": ent.get("name") or ent.get("title") or "Spotify import", "tracks": [t for t in found if t]}


def import_playlist(url: str) -> dict:
    """Turn a YouTube Music / Spotify playlist link into a list of playable songs."""
    url = (url or "").strip()
    if "spotify" in url:
        return _import_spotify(url)
    m = re.search(r"[?&]list=([\w-]+)", url)
    if m and YTMusic:
        d = ytm().get_playlist(m.group(1), limit=300)
        return {"name": d.get("title") or "Imported playlist", "tracks": [s for s in map(_song, d.get("tracks") or []) if s]}
    raise ValueError("Paste a YouTube Music or Spotify playlist link.")
