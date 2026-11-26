export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const u = searchParams.get('u') || '';
  try {
    const url = new URL(u);
    const host = url.hostname;
    const allowed = (
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.ggpht.com') ||
      host.endsWith('.ytimg.com') ||
      host.endsWith('.mzstatic.com') ||
      host.endsWith('.deezer.com') ||
      host.endsWith('.scdn.co') ||
      host.endsWith('.sndcdn.com')
    );

    if (url.protocol !== 'https:' || !allowed) {
      return new Response('', { status: 400 });
    }

    const r = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return new Response('', { status: 502 });

    const ct = (r.headers.get('Content-Type') || '').toLowerCase();
    if (!ct.startsWith('image/') || ct.includes('svg')) {
      return new Response('', { status: 415 });
    }

    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': ct,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=604800, immutable',
      }
    });
  } catch {
    return new Response('', { status: 502 });
  }
}
