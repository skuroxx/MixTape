import json
import os
import shutil
import threading
import uuid

from src.playlist_manager import atomic_write, video_id


class PlaylistStore:
    """User-made playlists kept in data/playlists.json (nothing is auto-generated)."""

    def __init__(self, path: str = "data/playlists.json"):
        self.path = path
        self.lock = threading.RLock()
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        if not os.path.exists(path):
            self._save([])

    def _load(self) -> list:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return data
            raise ValueError("playlists.json is not a list")
        except FileNotFoundError:
            return []
        except Exception:
            # Corrupt file: keep a copy instead of silently overwriting the user's playlists.
            try:
                shutil.copyfile(self.path, self.path + ".bak")
            except OSError:
                pass
            return []

    def _save(self, data: list) -> None:
        atomic_write(self.path, json.dumps(data, ensure_ascii=False, indent=1))

    @staticmethod
    def _slim(t: dict) -> dict:
        try:
            duration = int(float(t.get("duration") or 0))
        except (TypeError, ValueError):
            duration = 0
        return {"url": str(t.get("url", "")), "title": str(t.get("title", "") or ""),
                "uploader": str(t.get("uploader", "") or ""), "thumbnail": str(t.get("thumbnail", "") or ""),
                "duration": duration}

    def all(self) -> list:
        with self.lock:
            return self._load()

    def create(self, name: str, tracks=None) -> dict:
        with self.lock:
            data = self._load()
            seen, items = set(), []
            for t in tracks or []:
                if not isinstance(t, dict) or not t.get("url"):
                    continue
                k = video_id(t["url"])
                if k not in seen:
                    seen.add(k)
                    items.append(self._slim(t))
            pl = {"id": uuid.uuid4().hex[:8], "name": (name or "").strip()[:60] or "New playlist", "tracks": items}
            data.append(pl)
            self._save(data)
            return pl

    def add(self, pid: str, track: dict):
        """Returns (playlist, added) or (None, False) when the playlist doesn't exist."""
        if not isinstance(track, dict) or not track.get("url"):
            return None, False
        with self.lock:
            data = self._load()
            for pl in data:
                if pl["id"] == pid:
                    key = video_id(track["url"])
                    if any(video_id(t["url"]) == key for t in pl["tracks"]):
                        return pl, False
                    pl["tracks"].append(self._slim(track))
                    self._save(data)
                    return pl, True
        return None, False

    def remove(self, pid: str, index: int) -> bool:
        with self.lock:
            data = self._load()
            for pl in data:
                if pl["id"] == pid and 0 <= index < len(pl["tracks"]):
                    del pl["tracks"][index]
                    self._save(data)
                    return True
        return False

    def remove_by_id(self, pid: str, vid: str) -> bool:
        with self.lock:
            data = self._load()
            for pl in data:
                if pl["id"] == pid:
                    keep = [t for t in pl["tracks"] if video_id(t["url"]) != vid]
                    if len(keep) == len(pl["tracks"]):
                        return False
                    pl["tracks"] = keep
                    self._save(data)
                    return True
        return False

    def rename(self, pid: str, name: str):
        with self.lock:
            data = self._load()
            for pl in data:
                if pl["id"] == pid:
                    pl["name"] = (name or "").strip()[:60] or pl["name"]
                    self._save(data)
                    return pl
        return None

    def delete(self, pid: str) -> bool:
        with self.lock:
            data = self._load()
            new = [p for p in data if p["id"] != pid]
            if len(new) == len(data):
                return False
            self._save(new)
            return True
