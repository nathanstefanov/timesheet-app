/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Keep your current ESLint behavior
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ✅ Add response headers to prevent CDN/browser caching on dynamic pages
  async headers() {
    const noStoreRoutes = [
      '/admin',
      '/dashboard',
      '/new-shift',
      '/shift/:id*',
      // add more dynamic/auth pages here if needed
    ];

    return noStoreRoutes.map((source) => ({
      source,
      headers: [
        { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        { key: 'Pragma', value: 'no-cache' },
        { key: 'Expires', value: '0' },
      ],
    }));
  },

  reactStrictMode: true,
};

module.exports = nextConfig;
