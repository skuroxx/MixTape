# MixTape

Zero-storage music streaming player (Flask + yt-dlp + YouTube Music metadata).

Run: `pip install -r requirements.txt` then `python app.py` (set `FLASK_DEBUG=1` for the reloader; `MIXTAPE_DATA_DIR` moves the data folder).

- Liquid-glass UI, light / dark / AMOLED themes, colours that follow the playing song's cover
- Feed, Stats and Library tabs; account button opens Settings
- Queue (drag to reorder, played songs clear, play next, optional autoplay), custom playlists
- Synced lyrics (lrclib.net) with estimated word highlighting and a shareable lyrics card
- Playback picks its source automatically: the YouTube player first, the server's Opus stream (yt-dlp, with EQ and quality) when a song can't be embedded or the player is unreachable
- Opus streaming with quality control, EQ, speed, fade between songs
- Import Spotify / YouTube Music playlists by link (Settings)
- Optional env var: `YTM_LOCATION` (two-letter country code, default IN) for regional suggestions

## Lyrics sources
Pick one in Settings → Lyrics (or tap the badge on the lyrics screen). Sources: BetterLyrics, LyricsPlus,
Apple Music (Paxsenix), NetEase, Karalyr, LRCLIB, YouTube Music, SimpMusic, KuGou.
Optional env vars: `KARALYR_URL` (enables Karalyr), `LYRICSPLUS_URLS` (comma-separated mirrors).
