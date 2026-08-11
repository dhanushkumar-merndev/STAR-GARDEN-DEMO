'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { actionResult, AppError, type ActionResult } from '@/lib/errors';

/**
 * Notification centre actions (AGENTS.md §11.2, §13).
 *
 * Marking as read is scoped to the caller's own rows by the `user_id` filter
 * here and by the `notifications_select`/`notifications_update_own` policies —
 * a user cannot mark someone else's notifications read even by guessing an id.
 */

export async function markNotificationReadAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireUser();
    const supabase = await createClient();

    const notificationId = String(formData.get('notification_id') ?? '');
    const markAll = formData.get('all') === 'on' || formData.get('all') === 'true';

    if (!markAll && !notificationId) {
      throw new AppError('VALIDATION', 'Nothing to mark as read.');
    }

    const query = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);

    const { error } = markAll ? await query : await query.eq('id', notificationId);

    if (error) {
      throw new AppError('INTERNAL', 'Could not update notifications.', { cause: error });
    }

    revalidatePath('/notifications');
    revalidatePath('/dashboard');
    return undefined;
  });
}
