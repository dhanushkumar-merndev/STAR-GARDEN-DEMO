import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AboutApp } from '@/components/public/about-app';

export const metadata: Metadata = {
  title: 'Star Gardens CRM',
  description:
    'Star Gardens CRM is the internal tool the Star Gardens team uses to manage landscaping ' +
    'enquiries from first contact through site visit, design and execution.',
};

/** Routing depends on the session, so there is nothing to prerender. */
export const dynamic = 'force-dynamic';

/**
 * The root: a signed-in visitor goes to work, everyone else gets the public
 * description of the application.
 *
 * It used to redirect anonymous visitors straight to `/login`, which is what
 * failed Google's OAuth branding review — a reviewer following the bare domain
 * reached a sign-in form and reported, correctly, that the homepage explained
 * nothing about the app. Serving the description here means the review passes
 * whether the configured homepage is `/` or `/home`.
 *
 * Staff are unaffected: signed in, `/` still lands on the dashboard.
 */
export default async function RootPage() {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return <AboutApp />;
}
