from pathlib import Path
import re
from urllib.parse import urlparse

import requests
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from src.scraper import extract_stream_info, search_tracks, build_home, get_lyrics, get_radio, get_suggestions, import_playlist
from src.playlists import PlaylistStore
from src.lyrics import fetch_lyrics, list_sources
from src.playlist_manager import PlaylistManager

app = Flask(__name__)
DATA_DIR = Path(__file__).resolve().parent / "data"
playlist = PlaylistManager(str(DATA_DIR / "songs.txt"))
playlists = PlaylistStore(str(DATA_DIR / "playlists.json"))


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/playlist", methods=["GET"])
def list_playlist():
    return jsonify({"tracks": playlist.get_all()})


@app.route("/api/playlist", methods=["POST"])
def add_to_playlist():
    data = request.get_json(silent=True) or {}
    # Fast path: the UI already knows the metadata (from search / suggestions)
    if data.get("url") and data.get("title"):
        saved = playlist.add_track(data["url"], data["title"], data.get("uploader", ""), data.get("thumbnail", ""))
        return jsonify({"track": saved}), 201
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "URL or search query is required."}), 400
    try:
        info = extract_stream_info(query)
        saved = playlist.add_track(info["webpage_url"], info["title"], info["uploader"], info["thumbnail"])
        return jsonify({"track": saved, "meta": info}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/art")
def art_proxy():
    """Same-origin cover proxy so the browser can read colours from the poster."""
    u = request.args.get("u", "")
    p = urlparse(u)
    host = p.hostname or ""
    if p.scheme != "https" or not host.endswith((".googleusercontent.com", ".ggpht.com", ".ytimg.com")):
        return ("", 400)
    try:
        r = requests.get(u, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        return Response(r.content, mimetype=r.headers.get("Content-Type", "image/jpeg"),
                        headers={"Cache-Control": "public, max-age=86400"})
    except Exception:
        return ("", 502)


@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"tracks": []})
    try:
        n = min(max(int(request.args.get("n", 8)), 1), 20)
        return jsonify({"tracks": search_tracks(q, n)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/home")
def home():
    seeds = []
    for t in reversed(playlist.get_all()):
        m = re.search(r"[?&]v=([^&]+)", t["url"])
        if m:
            seeds.append({"vid": m.group(1), "title": t["title"], "uploader": t.get("uploader", "")})
    try:
        return jsonify({"sections": build_home(seeds)})
    except Exception as exc:
        return jsonify({"error": str(exc), "sections": []}), 500


@app.route("/api/radio")
def radio():
    v = request.args.get("v", "").strip()
    if not v:
        return jsonify({"tracks": []})
    try:
        return jsonify({"tracks": get_radio(v)})
    except Exception as exc:
        return jsonify({"error": str(exc), "tracks": []}), 500


@app.route("/api/suggest")
def suggest():
    q = request.args.get("q", "").strip()
    return jsonify({"suggestions": get_suggestions(q) if q else []})


@app.route("/api/playlists", methods=["GET"])
def playlists_list():
    return jsonify({"playlists": playlists.all()})


@app.route("/api/playlists", methods=["POST"])
def playlists_create():
    d = request.get_json(silent=True) or {}
    return jsonify({"playlist": playlists.create(d.get("name", ""), d.get("tracks"))}), 201


@app.route("/api/playlists/<pid>", methods=["DELETE"])
def playlists_delete(pid):
    if playlists.delete(pid):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "Not found"}), 404


@app.route("/api/playlists/<pid>/tracks", methods=["POST"])
def playlists_add(pid):
    pl = playlists.add(pid, request.get_json(silent=True) or {})
    return (jsonify({"playlist": pl}), 201) if pl else (jsonify({"error": "Playlist not found"}), 404)


@app.route("/api/playlists/<pid>/tracks/<int:idx>", methods=["DELETE"])
def playlists_remove(pid, idx):
    return jsonify({"status": "removed"}) if playlists.remove(pid, idx) else (jsonify({"error": "Not found"}), 404)


@app.route("/api/import", methods=["POST"])
def import_link():
    d = request.get_json(silent=True) or {}
    try:
        res = import_playlist(d.get("url", ""))
        if not res["tracks"]:
            return jsonify({"error": "No songs could be imported from that link."}), 422
        return jsonify({"playlist": playlists.create(res["name"], res["tracks"])}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/lyrics")
def lyrics():
    title = request.args.get("title", "").strip()
    if not title:
        return jsonify({"synced": [], "plain": "", "kind": "none"})
    return jsonify(fetch_lyrics(
        title, request.args.get("artist", ""), request.args.get("duration", 0) or 0,
        request.args.get("vid", ""), request.args.get("source", "auto"),
        request.args.get("strict", "0") == "1", request.args.get("prefer", "word"),
    ))


@app.route("/api/lyrics/sources")
def lyrics_sources():
    return jsonify({"sources": list_sources()})


@app.route("/api/playlist/<int:track_id>", methods=["DELETE"])
def delete_from_playlist(track_id: int):
    if playlist.remove_track(track_id):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "Track not found."}), 404


@app.route("/api/extract", methods=["GET"])
def extract():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Missing query parameter 'q'."}), 400
    try:
        info = extract_stream_info(query, request.args.get("fmt", "opus"), request.args.get("quality", "high"))
        return jsonify(info)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/stream")
def stream_audio():
    """
    Streams audio bytes directly from upstream CDN to the browser in RAM.
    Zero files are ever written to disk.
    """
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Missing query parameter 'q'."}), 400

    try:
        info = extract_stream_info(query, request.args.get("fmt", "opus"), request.args.get("quality", "high"))
        upstream_url = info["stream_url"]
        headers = dict(info.get("http_headers", {}))  # copy: info is cached

        # Forward Range header so browser seeking/scrubbing works seamlessly
        if "Range" in request.headers:
            headers["Range"] = request.headers["Range"]

        upstream = requests.get(upstream_url, headers=headers, stream=True, timeout=15)

        excluded_headers = {"content-encoding", "content-length", "transfer-encoding", "connection"}
        response_headers = [
            (k, v) for k, v in upstream.headers.items() if k.lower() not in excluded_headers
        ]

        return Response(
            stream_with_context(upstream.iter_content(chunk_size=65536)),
            status=upstream.status_code,
            headers=response_headers,
            content_type=upstream.headers.get("Content-Type", "audio/webm"),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
