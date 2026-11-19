"""Audio engine built on ytmdl (https://github.com/deepjyoti30/ytmdl).

ytmdl is a *downloader*: it fetches a song, transcodes it with ffmpeg and writes a file. It cannot hand
back a direct stream URL the way yt-dlp's extractor can. So this engine does the closest honest thing:

  1. run `ytmdl --url <video> --skip-meta -q ...` into a private temp folder,
  2. let Flask serve that file (with HTTP Range, so seeking works),
  3. delete it again after MIXTAPE_CACHE_TTL seconds / when the cache holds more than MIXTAPE_CACHE_MAX songs.

`prefetch()` starts a download in the background (called from /api/extract) so it overlaps with the UI
setting up; `get()` waits for it. Several requests for the same song share one download.

Needs: `pip install ytmdl` and ffmpeg on PATH.
Env: MIXTAPE_CACHE_DIR, MIXTAPE_CACHE_TTL (s, default 1800), MIXTAPE_CACHE_MAX (default 12),
     YTMDL_TIMEOUT (s, default 240), YTMDL_PROXY (optional), YTMDL_BIN (optional custom command).
"""
import importlib.util
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time

CACHE_DIR = os.environ.get("MIXTAPE_CACHE_DIR") or os.path.join(tempfile.gettempdir(), "mixtape-ytmdl")
TTL = int(os.environ.get("MIXTAPE_CACHE_TTL", "1800"))
MAX_FILES = int(os.environ.get("MIXTAPE_CACHE_MAX", "12"))
TIMEOUT = int(os.environ.get("YTMDL_TIMEOUT", "240"))

# what the browser asks for (opus | aac)  ->  ytmdl --format value
FORMATS = {"opus": "opus", "aac": "m4a"}
MIME = {".opus": "audio/ogg", ".ogg": "audio/ogg", ".webm": "audio/webm", ".m4a": "audio/mp4",
        ".mp4": "audio/mp4", ".mp3": "audio/mpeg"}


class EngineError(RuntimeError):
    pass


class _Job:
    def __init__(self, folder):
        self.folder, self.path, self.error = folder, None, None
        self.done = threading.Event()
        self.touched = time.time()


_lock = threading.Lock()
_jobs: dict = {}


def _command() -> list:
    custom = os.environ.get("YTMDL_BIN", "").strip()
    if custom:
        return shlex.split(custom)
    if importlib.util.find_spec("ytmdl"):
        # same interpreter/venv as the app; `ytmdl:entry` is the console-script entry point
        return [sys.executable, "-c", "from ytmdl import entry; entry()"]
    found = shutil.which("ytmdl")
    if found:
        return [found]
    raise EngineError("ytmdl is not installed. Run: pip install ytmdl (and install ffmpeg).")


def _build_args(vid: str, fmt: str, folder: str) -> list:
    args = _command() + [
        "--url", f"https://www.youtube.com/watch?v={vid}",
        "--skip-meta",          # we already have metadata (ytmusicapi); skip ytmdl's tagging step
        "-q",                   # never ask questions
        "--nolocal",            # don't look for an already-downloaded copy elsewhere
        "--ignore-chapters",    # one file per video
        "--disable-file",       # no ytmdl log files
        "--format", FORMATS[fmt],
        "--filename", vid,
        "-o", folder,
    ]
    if fmt == "opus":
        args.append("--dont-transcode")  # keep YouTube's Opus as-is: much faster, no quality loss
    if os.environ.get("YTMDL_PROXY"):
        args += ["--proxy", os.environ["YTMDL_PROXY"]]
    return args


def _find_output(folder: str):
    best = None
    for name in os.listdir(folder):
        p = os.path.join(folder, name)
        if name.endswith((".part", ".ytdl", ".tmp")) or not os.path.isfile(p):
            continue
        if os.path.splitext(name)[1].lower() in MIME and (best is None or os.path.getsize(p) > os.path.getsize(best)):
            best = p
    return best


def _purge():
    """Drop expired songs, then the oldest ones beyond MAX_FILES. Call with _lock held."""
    now = time.time()
    for key, job in list(_jobs.items()):
        if job.done.is_set() and now - job.touched > TTL:
            shutil.rmtree(job.folder, ignore_errors=True)
            _jobs.pop(key, None)
    finished = sorted((j for j in _jobs.values() if j.done.is_set()), key=lambda j: j.touched)
    for job in finished[: max(0, len(finished) - MAX_FILES)]:
        shutil.rmtree(job.folder, ignore_errors=True)
        for key, j in list(_jobs.items()):
            if j is job:
                _jobs.pop(key, None)


def _run(job: _Job, vid: str, fmt: str):
    try:
        os.makedirs(job.folder, exist_ok=True)
        proc = subprocess.run(_build_args(vid, fmt, job.folder), capture_output=True, text=True,
                              timeout=TIMEOUT, stdin=subprocess.DEVNULL)
        path = _find_output(job.folder)
        if not path:
            tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
            raise EngineError("ytmdl didn't produce a file" + (": " + " | ".join(tail) if tail else "."))
        job.path = path
    except subprocess.TimeoutExpired:
        job.error = EngineError(f"ytmdl timed out after {TIMEOUT}s.")
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller through the job
        job.error = exc if isinstance(exc, EngineError) else EngineError(str(exc))
    finally:
        job.touched = time.time()
        if job.error:
            shutil.rmtree(job.folder, ignore_errors=True)  # don't keep empty/partial folders
        job.done.set()
        with _lock:
            _purge()  # enforce MIXTAPE_CACHE_MAX as soon as a song lands, not only on the next request


def prefetch(vid: str, fmt: str = "opus") -> _Job:
    """Start (or reuse) the download for this song and return immediately."""
    fmt = fmt if fmt in FORMATS else "opus"
    key = f"{vid}:{fmt}"
    with _lock:
        _purge()
        job = _jobs.get(key)
        if job and job.done.is_set() and (job.error or not (job.path and os.path.exists(job.path))):
            _jobs.pop(key, None)  # failed or deleted: allow a retry
            job = None
        if job is None:
            os.makedirs(CACHE_DIR, exist_ok=True)
            job = _jobs[key] = _Job(os.path.join(CACHE_DIR, f"{vid}-{fmt}"))
            threading.Thread(target=_run, args=(job, vid, fmt), daemon=True).start()
        job.touched = time.time()
        return job


def get(vid: str, fmt: str = "opus"):
    """Block until the song is on disk. Returns (path, mimetype)."""
    job = prefetch(vid, fmt)
    if not job.done.wait(TIMEOUT + 15):
        raise EngineError("Timed out waiting for ytmdl.")
    if job.error:
        raise job.error
    job.touched = time.time()
    return job.path, MIME.get(os.path.splitext(job.path)[1].lower(), "audio/mpeg")


def cleanup_all():
    with _lock:
        for job in _jobs.values():
            shutil.rmtree(job.folder, ignore_errors=True)
        _jobs.clear()
