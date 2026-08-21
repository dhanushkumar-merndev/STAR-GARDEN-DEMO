'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { actionResult, AppError, type ActionResult } from '@/lib/errors';
import {
  listPurgeCandidates,
  requestLeadPurgeOtp,
  verifyAndPurgeLeads,
  type PurgeCandidate,
} from '@/server/services/lead-purge';

export async function requestLeadPurgeOtpAction(
  leadIds: string[],
): Promise<ActionResult<{ challengeId: string; sentTo: string; expiresAt: string }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    if (!Array.isArray(leadIds) || leadIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new AppError('VALIDATION', 'Invalid lead selection.');
    }
    return requestLeadPurgeOtp(user, leadIds);
  });
}

export async function confirmLeadPurgeAction(
  challengeId: string,
  code: string,
): Promise<ActionResult<{ deletedCount: number }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code)) {
      throw new AppError('VALIDATION', 'Enter the six-digit verification code.');
    }
    const result = await verifyAndPurgeLeads(user, challengeId, code);
    revalidatePath('/settings');
    revalidatePath('/leads');
    revalidatePath('/dashboard');
    return result;
  });
}

/**
 * One page of purge candidates.
 *
 * The dialog searches the whole table through this rather than filtering a
 * pre-loaded list, so a lead is findable whether it is the newest or the
 * ten-thousandth.
 */
export async function searchPurgeLeadsAction(
  q: string,
  page: number,
): Promise<ActionResult<{ items: PurgeCandidate[]; total: number; page: number; pageSize: number }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    return listPurgeCandidates(user, { q, page });
  });
}
