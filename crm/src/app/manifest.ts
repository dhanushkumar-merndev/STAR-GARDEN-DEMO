import type { MetadataRoute } from 'next';

/**
 * PWA shell (AGENTS.md §4.1: "an optional installable PWA shell").
 *
 * Installable so BDMs can pin the CRM to a phone home screen. No service
 * worker and no offline caching — cached customer data on a shared or lost
 * device is a liability, and §15 keeps customer information off the client.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Star Garden CRM',
    short_name: 'SG CRM',
    description: 'Internal CRM for Star Garden.',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7faf8',
    theme_color: '#2f6b4f',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
