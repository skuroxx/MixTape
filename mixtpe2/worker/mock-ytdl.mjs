// Test double for @distube/ytdl-core (the real one needs the network).
export class Ytdl {
  constructor(opts) { this.opts = opts; globalThis.__ytdlOpts = opts; }
  async getInfo(id) {
    if (globalThis.__ytdlFails) throw new Error('YouTube visitor data request failed');
    globalThis.__ytdlCalls = (globalThis.__ytdlCalls || 0) + 1;
    const a = { hasAudio: true, hasVideo: false, client: 'visionos' };
    return { client: 'visionos', videoDetails: { title: 'Ytdl Song', author: { name: 'Ytdl Artist - Topic' }, lengthSeconds: 123, thumbnails: [{ url: 'https://t/y.jpg' }] },
      formats: [
        { url: 'https://gv/video2', mimeType: 'video/mp4; codecs="avc1.4d401f"', hasAudio: false, hasVideo: true, bitrate: 900000, client: 'visionos' },
        { ...a, url: 'https://gv/y-aac', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, contentLength: 10000 },
        { ...a, url: 'https://gv/y-opus', mimeType: 'audio/webm; codecs="opus"', bitrate: 150000, averageBitrate: 140000, contentLength: 10000 },
        { ...a, url: undefined, mimeType: 'audio/webm; codecs="opus"', bitrate: 250000 } ] };
  }
}
