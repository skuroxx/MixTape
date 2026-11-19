# MixTape

Music player (Flask + ytmdl + YouTube Music metadata).

Run: install **ffmpeg**, then `pip install -r requirements.txt` and `python app.py`.

- Liquid-glass UI, light / dark / AMOLED themes, colours that follow the playing song's cover
- Feed, Stats and Library tabs; account button opens Settings
- Queue (drag to reorder, played songs clear, play next, optional autoplay), custom playlists
- Synced lyrics (lrclib.net) with estimated word highlighting and a shareable lyrics card
- Two playback engines (Settings → Audio & playback): **YouTube iframe** (default) plays through a live YouTube player kept rendered behind the artwork, so only the cover is visible while the iframe keeps the audio going; **Direct stream** (audio fetched with [ytmdl](https://github.com/deepjyoti30/ytmdl)) supports EQ and speed. A song that can't be embedded automatically falls back to Direct stream
- Opus streaming with quality control, EQ, speed, fade between songs
- Import Spotify / YouTube Music playlists by link (Settings)
- Optional env var: `YTM_LOCATION` (two-letter country code, default IN) for regional suggestions

## Lyrics sources
Pick one in Settings → Lyrics (or tap the badge on the lyrics screen). Sources: BetterLyrics, LyricsPlus,
Apple Music (Paxsenix), NetEase, Karalyr, LRCLIB, YouTube Music, SimpMusic, KuGou.
Optional env vars: `KARALYR_URL` (enables Karalyr), `LYRICSPLUS_URLS` (comma-separated mirrors).

## ytmdl engine (Direct stream)
ytmdl is a downloader, not a stream resolver, so Direct stream now works like this: `/api/extract` returns the song's
metadata (ytmusicapi) and starts `ytmdl` in the background; `/stream` serves the finished file with Range support.
Files live in a temp folder and are deleted after `MIXTAPE_CACHE_TTL` seconds (default 1800) or beyond `MIXTAPE_CACHE_MAX`
songs (default 12), so "zero storage" is now "short-lived storage". The first play of a song waits for the download.
The streaming-quality setting no longer changes anything (ytmdl fetches the best audio). ytmdl itself uses yt-dlp internally.
Env: `MIXTAPE_CACHE_DIR`, `MIXTAPE_CACHE_TTL`, `MIXTAPE_CACHE_MAX`, `YTMDL_TIMEOUT`, `YTMDL_PROXY`, `YTMDL_BIN`.

## Apple Music-style lyrics
`static/amlyrics.js` + `static/amlyrics.css` render the lyrics screen: word-by-word fill, stretched-word zoom, pop,
left/right duet alignment, nested background vocals, pulsing instrumental-break dots, 60fps clock, click-to-seek.
Try it without audio at `/lyrics-demo` (sample data in `static/sample-lyrics.json`).
