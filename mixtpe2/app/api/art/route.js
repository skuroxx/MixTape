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
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': r.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, immutable',
      }
    });
  } catch (e) {
    return new Response('', { status: 502 });
  }
}
