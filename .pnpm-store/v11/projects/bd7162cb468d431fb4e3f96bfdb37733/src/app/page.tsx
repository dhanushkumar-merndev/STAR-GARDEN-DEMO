import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

/** Routing depends on the session, so there is nothing to prerender. */
export const dynamic = 'force-dynamic';

/** The CRM has no marketing surface of its own — the root just routes. */
export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? '/dashboard' : '/login');
}
