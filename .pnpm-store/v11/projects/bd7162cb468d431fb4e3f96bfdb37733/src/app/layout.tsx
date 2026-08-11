import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

/**
 * Root layout.
 *
 * The CRM holds customer contact details and private design files, so it is
 * marked `noindex, nofollow` — nothing here should ever appear in a search
 * result (§15).
 */

export const metadata: Metadata = {
  title: {
    default: 'Star Gardens CRM',
    template: '%s · Star Gardens CRM',
  },
  description: 'Internal CRM for Star Gardens — leads, site visits, designs and execution.',
  robots: { index: false, follow: false, nocache: true },
  applicationName: 'Star Gardens CRM',
  appleWebApp: { capable: true, title: 'Star Gardens CRM', statusBarStyle: 'default' },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Staff read design notes on a phone; pinch-zoom must keep working.
  maximumScale: 5,
  themeColor: '#2f6b4f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
