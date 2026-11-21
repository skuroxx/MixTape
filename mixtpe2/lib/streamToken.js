// Short-lived HMAC tokens so only your site can use the stream Worker. Works in Node 18+ (Vercel) and Cloudflare Workers (Web Crypto).
const enc = new TextEncoder();

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signStream(secret, id, fmt, quality, ttlSec = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${exp}.${await hmac(secret, `${id}.${fmt}.${quality}.${exp}`)}`;
}

export async function verifyStream(secret, id, fmt, quality, token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || !(+exp > Date.now() / 1000)) return false;
  const good = await hmac(secret, `${id}.${fmt}.${quality}.${exp}`);
  if (good.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
