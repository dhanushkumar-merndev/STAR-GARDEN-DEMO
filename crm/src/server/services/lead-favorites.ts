import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Two independent ways to mark a lead, both visible at once — never hiding
 * one because the other is set (see `20260822120000_lead_favorites` /
 * `20260822130000_lead_pin_independent_of_star`):
 *
 *   - `leads.is_starred` — the pin. One flag, Admin/Super-Admin only,
 *     everyone sees it. Pinned leads sort to the top of every list they
 *     already belong to (by status) — there is no dedicated "Pinned" tab,
 *     because a pin doesn't change what a lead *is*, only where it sits.
 *   - `lead_favorites` — the star. One row per (user, lead), any staff
 *     member, private. The Starred tab shows only this — a personal
 *     bookmark list, independent of what anyone else (including an Admin's
 *     pin) has done with the same lead.
 */

/** Which of the current page's leads this viewer has personally favourited. */
export async function listFavoritedLeadIds(
  user: SessionUser,
  leadIds: string[],
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  const supabase = await createClient();

  const { data } = await supabase
    .from('lead_favorites')
    .select('lead_id')
    .eq('user_id', user.id)
    .in('lead_id', leadIds);

  return new Set((data ?? []).map((row) => row.lead_id));
}

/**
 * Every lead id this viewer has personally favourited, for the Starred tab.
 *
 * A plain `IN (...)` filter on this list is safe at any realistic size — it
 * is bounded by how many leads one person chooses to click a star on, not by
 * the size of the `leads` table, which is the distinction that matters (see
 * the standing scale-safety rule).
 */
export async function listAllFavoritedLeadIds(user: SessionUser): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('lead_favorites').select('lead_id').eq('user_id', user.id);
  return (data ?? []).map((row) => row.lead_id);
}

/** Personal star: any active staff member, private to them. Independent of the pin. */
export async function toggleLeadFavorite(
  user: SessionUser,
  leadId: string,
): Promise<{ favorited: boolean }> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('lead_favorites')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('lead_id', leadId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('lead_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('lead_id', leadId);
    if (error) throw new AppError('INTERNAL', 'Could not remove the favourite.', { cause: error });
    return { favorited: false };
  }

  const { error } = await supabase
    .from('lead_favorites')
    .insert({ user_id: user.id, lead_id: leadId });
  if (error) throw new AppError('INTERNAL', 'Could not favourite the lead.', { cause: error });
  return { favorited: true };
}

/** Global pin: Admin/Super-Admin only, visible to everyone. Independent of any personal star. */
export async function toggleLeadGlobalStar(
  user: SessionUser,
  leadId: string,
): Promise<{ starred: boolean }> {
  if (!user.isAdmin) {
    throw new AppError('FORBIDDEN', 'Only an Admin can pin a lead for everyone.');
  }
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from('leads')
    .select('id, is_starred')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');

  const next = !lead.is_starred;

  const { error } = await supabase.from('leads').update({ is_starred: next }).eq('id', leadId);
  if (error) throw new AppError('INTERNAL', 'Could not update the pin.', { cause: error });

  return { starred: next };
}
