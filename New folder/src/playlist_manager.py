import os
import re
import tempfile
import threading
from typing import Dict, List

_VID = re.compile(r"(?:[?&]v=|youtu\.be/|/shorts/|/embed/)([\w-]{11})")


def video_id(url: str) -> str:
    """Stable key for a track: the YouTube video id, or the whole URL when there is none."""
    url = (url or "").strip()
    m = _VID.search(url)
    return m.group(1) if m else url


def atomic_write(path: str, text: str) -> None:
    """Write via a temp file + rename so a crash can never leave a half-written file."""
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class PlaylistManager:
    """Liked songs in a plain text file: url | title | uploader | thumbnail | duration"""

    def __init__(self, filepath: str = "data/songs.txt"):
        self.filepath = filepath
        self.lock = threading.RLock()
        os.makedirs(os.path.dirname(os.path.abspath(self.filepath)), exist_ok=True)
        if not os.path.exists(self.filepath):
            atomic_write(self.filepath, "")

    # -- parsing -----------------------------------------------------------
    def _read(self) -> List[Dict]:
        tracks, seen = [], set()
        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            return []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            url = parts[0]
            key = video_id(url)
            if not url or key in seen:  # also heals duplicates already in the file
                continue
            seen.add(key)
            try:
                duration = int(float(parts[4])) if len(parts) > 4 and parts[4] else 0
            except ValueError:
                duration = 0
            tracks.append({
                "url": url, "title": parts[1] if len(parts) > 1 and parts[1] else url,
                "uploader": parts[2] if len(parts) > 2 else "",
                "thumbnail": parts[3] if len(parts) > 3 else "", "duration": duration,
            })
        return tracks

    @staticmethod
    def _line(t: Dict) -> str:
        clean = lambda s: str(s or "").replace("|", "-").replace("\r", " ").replace("\n", " ").strip()
        return " | ".join([t["url"].strip(), clean(t.get("title")), clean(t.get("uploader")),
                           clean(t.get("thumbnail")), str(int(t.get("duration") or 0))]) + "\n"

    def _write(self, tracks: List[Dict]) -> None:
        atomic_write(self.filepath, "".join(self._line(t) for t in tracks))

    # -- public API --------------------------------------------------------
    def get_all(self) -> List[Dict]:
        with self.lock:
            return [{"id": i, **t} for i, t in enumerate(self._read())]

    def add_track(self, url: str, title: str, uploader: str = "", thumbnail: str = "", duration=0) -> Dict:
        """Idempotent: liking the same song twice keeps one copy."""
        try:
            duration = int(float(duration or 0))
        except (TypeError, ValueError):
            duration = 0
        track = {"url": url.strip(), "title": (title or "").strip() or url.strip(),
                 "uploader": uploader or "", "thumbnail": thumbnail or "", "duration": duration}
        with self.lock:
            tracks = self._read()
            key = video_id(track["url"])
            if not any(video_id(t["url"]) == key for t in tracks):
                tracks.append(track)
                self._write(tracks)
        return track

    def remove_by_id(self, vid: str) -> bool:
        with self.lock:
            tracks = self._read()
            keep = [t for t in tracks if video_id(t["url"]) != vid]
            if len(keep) == len(tracks):
                return False
            self._write(keep)
            return True

    def remove_track(self, index: int) -> bool:  # kept for old clients
        with self.lock:
            tracks = self._read()
            if index < 0 or index >= len(tracks):
                return False
            del tracks[index]
            self._write(tracks)
            return True
