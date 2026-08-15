import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Next.js request proxy: refreshes auth and applies the coarse route gate. */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /* Static assets do not need a session refresh. */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|webmanifest)$).*)',
  ],
};
