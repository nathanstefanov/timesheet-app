// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Disable CDN/browser cache for app pages that depend on auth/data
    const noStore = [
      "/admin",
      "/dashboard",
      "/new-shift",
      "/shift/:id*",
    ].map((p) => ({
      source: p,
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    }));

    return noStore;
  },
};

module.exports = nextConfig;
