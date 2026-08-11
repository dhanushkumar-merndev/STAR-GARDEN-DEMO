'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { markNotificationReadAction } from '@/server/actions/notifications';

/**
 * Opening the notification centre IS reading it.
 *
 * The manual "mark read" buttons this replaces made the user do bookkeeping the
 * app could do itself: nobody visits this page and then wants the badge to keep
 * claiming the same items are unread.
 *
 * The sequence matters. The page renders first with the unread styling intact,
 * so the user still sees which items are new; only then does this fire and
 * clear the badge. Marking during the server render would have shown a page
 * where nothing was ever new.
 */
export function AutoMarkRead({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  // A ref rather than state: this must run once per mount, and re-rendering on
  // it would be pointless work.
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (!hasUnread || fired.current) return;
    fired.current = true;

    const formData = new FormData();
    formData.set('all', 'true');

    void markNotificationReadAction(null, formData).then((result) => {
      // `router.refresh()` is what repaints the header badge. A failure is
      // deliberately silent: the user came here to read, not to be told that
      // an invisible bookkeeping write did not land.
      if (result.ok) router.refresh();
    });
  }, [hasUnread, router]);

  return null;
}
