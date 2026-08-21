import type { Metadata } from 'next';
import { AboutApp } from '@/components/public/about-app';

export const metadata: Metadata = {
  title: 'About Star Gardens CRM',
  description:
    'Star Gardens CRM is the internal tool the Star Gardens team uses to manage landscaping ' +
    'enquiries from first contact through site visit, design and execution.',
};

/**
 * Stable public URL for the application description.
 *
 * The same content is served at `/` for signed-out visitors, because Google's
 * branding review follows whichever URL is configured as the homepage and a
 * reviewer will often just try the bare domain. Keeping `/home` as well means
 * the configured link stays valid either way.
 */
export default function HomePage() {
  return <AboutApp />;
}
