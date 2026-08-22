'use server';

import { requireUser } from '@/lib/auth/session';
import {
  listActiveDesigners,
  listActiveExecutionStaff,
  listAssignableBdms,
} from '@/server/services/leads';

/**
 * People pickers (`<Select onSearch={…}>`).
 *
 * A picker sends what has been typed and gets back one screenful of matching
 * names, instead of the page shipping every member of the role up front and
 * the browser filtering a list it already paid to download. The 500ms debounce
 * lives in the control, so a name typed at speed costs one query, not one per
 * letter.
 *
 * These read the staff directory, which every signed-in CRM user can already
 * see through the pickers themselves — so `requireUser` is the right gate, and
 * it is still a gate: a Server Action is a public endpoint, and the portal's
 * client sessions have no business enumerating staff.
 */

export type PersonChoice = { value: string; label: string };

/** Search results share the picker's option shape so the control can render them directly. */
function toChoices(rows: { id: string; full_name: string | null }[]): PersonChoice[] {
  return rows.map((row) => ({ value: row.id, label: row.full_name ?? 'Unnamed' }));
}

async function assertStaff() {
  const user = await requireUser();
  if (user.role === 'CLIENT') {
    throw new Error('Not authorised to browse staff.');
  }
  return user;
}

/** Owners: BDMs plus Admins, per the BDM role toggle. */
export async function searchOwnersAction(search: string): Promise<PersonChoice[]> {
  await assertStaff();
  return toChoices(await listAssignableBdms({ search }));
}

/** Landscape designers. */
export async function searchDesignersAction(search: string): Promise<PersonChoice[]> {
  await assertStaff();
  return toChoices(await listActiveDesigners({ search }));
}

/** Execution staff. */
export async function searchExecutionStaffAction(search: string): Promise<PersonChoice[]> {
  await assertStaff();
  return toChoices(await listActiveExecutionStaff({ search }));
}
