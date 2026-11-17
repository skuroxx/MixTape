import json
import os
import threading
import uuid


class PlaylistStore:
    """User-made playlists kept in data/playlists.json (nothing is auto-generated)."""

    def __init__(self, path: str = "data/playlists.json"):
        self.path = path
        self.lock = threading.Lock()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path):
            self._save([])

    def _load(self) -> list:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, data: list) -> None:
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)

    @staticmethod
    def _slim(t: dict) -> dict:
        return {
            "url": t.get("url", ""), "title": t.get("title", ""), "uploader": t.get("uploader", ""),
            "thumbnail": t.get("thumbnail", ""), "duration": t.get("duration", 0),
        }

    def all(self) -> list:
        with self.lock:
            return self._load()

    def create(self, name: str, tracks=None) -> dict:
        with self.lock:
            data = self._load()
            pl = {"id": uuid.uuid4().hex[:8], "name": (name or "New playlist").strip()[:60],
                  "tracks": [self._slim(t) for t in (tracks or []) if t.get("url")]}
            data.append(pl)
            self._save(data)
            return pl

    def add(self, pid: str, track: dict):
        with self.lock:
            data = self._load()
            for pl in data:
                if pl["id"] == pid:
                    if not any(t["url"] == track.get("url") for t in pl["tracks"]):
                        pl["tracks"].append(self._slim(track))
                    self._save(data)
                    return pl
        return None

    def remove(self, pid: str, index: int) -> bool:
        with self.lock:
            data = self._load()
            for pl in data:
                if pl["id"] == pid and 0 <= index < len(pl["tracks"]):
                    del pl["tracks"][index]
                    self._save(data)
                    return True
        return False

    def delete(self, pid: str) -> bool:
        with self.lock:
            data = self._load()
            new = [p for p in data if p["id"] != pid]
            self._save(new)
            return len(new) != len(data)
