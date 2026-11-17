import os
from typing import List, Dict


class PlaylistManager:
    """Saved tracks in a plain text file: url | title | uploader | thumbnail"""

    def __init__(self, filepath: str = "data/songs.txt"):
        self.filepath = filepath
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        if not os.path.exists(self.filepath):
            with open(self.filepath, "w", encoding="utf-8") as f:
                f.write("")

    def get_all(self) -> List[Dict[str, str]]:
        tracks = []
        with open(self.filepath, "r", encoding="utf-8") as f:
            for idx, line in enumerate(f):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                url = parts[0]
                title = parts[1] if len(parts) > 1 and parts[1] else url
                tracks.append({
                    "id": idx, "url": url, "title": title,
                    "uploader": parts[2] if len(parts) > 2 else "",
                    "thumbnail": parts[3] if len(parts) > 3 else "",
                })
        return tracks

    @staticmethod
    def _line(t: Dict[str, str]) -> str:
        clean = lambda s: (s or "").replace("|", "-").replace("\n", " ").strip()
        return f"{t['url'].strip()} | {clean(t['title'])} | {clean(t.get('uploader'))} | {t.get('thumbnail', '').strip()}\n"

    def add_track(self, url: str, title: str, uploader: str = "", thumbnail: str = "") -> Dict[str, str]:
        track = {"url": url.strip(), "title": title.strip() or url.strip(), "uploader": uploader, "thumbnail": thumbnail}
        with open(self.filepath, "a", encoding="utf-8") as f:
            f.write(self._line(track))
        return track

    def remove_track(self, index: int) -> bool:
        tracks = self.get_all()
        if index < 0 or index >= len(tracks):
            return False
        del tracks[index]
        with open(self.filepath, "w", encoding="utf-8") as f:
            for t in tracks:
                f.write(self._line(t))
        return True
