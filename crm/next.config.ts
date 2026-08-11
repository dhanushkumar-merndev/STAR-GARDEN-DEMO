import type { NextConfig } from 'next';

/**
 * Security headers applied to every response. AGENTS.md §15 requires HTTPS-only
 * production behaviour and forbids leaking customer data through public URLs.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // The repository root also holds the marketing SPA and its own lockfile, so
  // Next.js has to be told which directory this app actually lives in.
  outputFileTracingRoot: __dirname,

  // Uploaded files are never served from Next.js — they live in a private Tigris
  // bucket and are reached only through short-lived presigned URLs (§4.3).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.storage.tigris.dev' }],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
