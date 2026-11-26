import { NextResponse } from 'next/server';

const WINDOW_MS = 60_000;
const HEAVY_LIMIT = 30;   // /api/extract, /api/import
const DEFAULT_LIMIT = 120; // all other /api/* routes
const buckets = new Map();

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(ip, heavy) {
  const now = Date.now();
  const key = `${ip}:${heavy ? 'h' : 'd'}`;
  const limit = heavy ? HEAVY_LIMIT : DEFAULT_LIMIT;
  let entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + WINDOW_MS };
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, entry);
  }
  entry.count += 1;
  return entry.count > limit;
}

function isAllowedOrigin(value, reqHost, extraAllowed) {
  if (!value) return false;
  try {
    const u = new URL(value);
    if (u.host === reqHost) return true;
    if (extraAllowed.includes(u.origin)) return true;
    return false;
  } catch {
    return false;
  }
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const isDev = process.env.NODE_ENV !== 'production';
  const reqHost = request.headers.get('host') || '';
  const extraAllowed = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Block direct browser address-bar navigation to API endpoints
  const fetchMode = request.headers.get('sec-fetch-mode') || '';
  if (fetchMode === 'navigate') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Block cross-site requests
  const fetchSite = request.headers.get('sec-fetch-site') || '';
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate Origin / Referer in production
  if (!isDev) {
    const origin = request.headers.get('origin') || '';
    const referer = request.headers.get('referer') || '';
    const originOk = origin ? isAllowedOrigin(origin, reqHost, extraAllowed) : true;
    const refererOk = referer ? isAllowedOrigin(referer, reqHost, extraAllowed) : false;

    if (!originOk || (!origin && !refererOk && fetchSite !== 'same-origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Sliding-window rate limiting
  const heavy = pathname.startsWith('/api/extract') || pathname.startsWith('/api/import');
  if (isRateLimited(getClientIp(request), heavy)) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
