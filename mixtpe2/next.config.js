/** @type {import('next').NextConfig} */
const immutable = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  productionBrowserSourceMaps: false, // never ship source maps: the browser only gets minified/obfuscated code
  serverExternalPackages: ['@distube/ytdl-core'],
  // new value every build -> /app.js?v=... is cache-busted, so the client files can be cached forever
  env: { ASSET_V: Date.now().toString(36) },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/app.js', headers: immutable },
      { source: '/amlyrics.js', headers: immutable },
      { source: '/style.css', headers: immutable },
      { source: '/amlyrics.css', headers: immutable },
    ];
  },
};

module.exports = nextConfig;
