/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Todas as rotas não-API servem o index.html (SPA mode)
      {
        source: '/((?!api|_next|icons|manifest.json|sw.js|favicon.ico).*)',
        destination: '/index.html',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/index.html',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self)' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

module.exports = nextConfig;
