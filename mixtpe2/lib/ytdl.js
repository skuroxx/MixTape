import { Ytdl } from '@distube/ytdl-core';

let _instance = null;

export function getYtdl() {
  if (!_instance) {
    const opts = {};
    if (process.env.YT_COOKIE) {
      opts.cookies = process.env.YT_COOKIE;
    }
    _instance = new Ytdl(opts);
  }
  return _instance;
}

const VID_RE = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/;

export function extractVideoId(query) {
  const q = (query || '').trim();
  if (/^[\w-]{11}$/.test(q)) return q;
  const m = VID_RE.exec(q);
  return m ? m[1] : null;
}
