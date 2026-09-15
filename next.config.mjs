/** @type {import('next').NextConfig} */
const frameAncestors =
  process.env.FRAME_ANCESTORS ||
  "'self' https://crm.zoho.eu https://*.zoho.eu https://one.zoho.eu https://crm.zoho.com https://*.zoho.com";

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors}` },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};
export default nextConfig;
