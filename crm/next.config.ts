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
  // Every page here is either authenticated or session-dependent, so none of
  // them should be cached — by an intermediary, or by the browser's own
  // back-forward cache. Without this, signing out doesn't stop the previous
  // page from reappearing instantly (from bfcache) on a Back-button press,
  // even though the session backing it is already gone (§15).
  { key: 'Cache-Control', value: 'no-store' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Next 16's draggable development indicator can try to release a pointer
  // after Chrome device emulation has already cancelled it during navigation,
  // producing a noisy NotFoundError in the browser console. The application
  // has its own error UI, so the indicator is not needed here.
  devIndicators: false,

  // The repository root also holds the marketing SPA and its own lockfile, so
  // Next.js has to be told which directory this app actually lives in.
  outputFileTracingRoot: __dirname,

  // Uploaded files are never served from Next.js — they live in a private Tigris
  // bucket and are reached only through short-lived presigned URLs (§4.3).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.storage.tigris.dev' }],
  },

  async headers() {
    return [
      {
        // Excludes hashed static assets (JS/CSS chunks, images, fonts) — those
        // are immutable per build and should keep Next's own long-lived cache,
        // unlike every actual page/route, which is session-dependent. Same
        // pattern as the proxy's own matcher in src/proxy.ts.
        source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|webmanifest)$).*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
