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
  productionBrowserSourceMaps: false,
  serverExternalPackages: ['@distube/ytdl-core'],
  env: { ASSET_V: Date.now().toString(36) },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/app.js', headers: immutable },
      { source: '/amlyrics.js', headers: immutable },
      { source: '/style.css', headers: immutable },
      { source: '/amlyrics.css', headers: immutable },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
