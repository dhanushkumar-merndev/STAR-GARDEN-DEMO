import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any -- temporary until generated Supabase types include the purge migration */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteStoredObject, storageConfigured } from '@/lib/tigris';
import { sendEmail } from '@/lib/email';
import type { SessionUser } from '@/lib/auth/session';

const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_LEADS_PER_PURGE = 100;
const MAX_LEADS = MAX_LEADS_PER_PURGE;

/**
 * Where the deletion code goes — always, whoever asked for it.
 *
 * The point of the second factor is that the person pressing delete is not the
 * only person who has to agree. Mailing the code to the requester's own inbox
 * made it a formality any one Admin could complete alone; sending it to the
 * business owner means a permanent, irreversible deletion needs two people.
 *
 * Overridable by environment so a staging deployment does not mail the owner,
 * but it is never derived from the session.
 */
export const PURGE_OTP_RECIPIENT =
  process.env.LEAD_PURGE_OTP_EMAIL?.trim() || 'abhi@stargardens.in';

export interface PurgeCandidate {
  id: string;
  customer_name: string;
  mobile_country_code: string;
  mobile_normalized: string;
  email: string | null;
  status: string;
  source: string;
}

/**
 * One page of leads that could be purged.
 *
 * Paged and searched on the server: the dialog used to load a flat hundred, so
 * on a database of ten thousand the other 9,900 were simply unreachable — and
 * the one lead someone needed to remove was, by definition, unlikely to be in
 * the most recent hundred.
 */
export async function listPurgeCandidates(
  user: SessionUser,
  options: { q?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: PurgeCandidate[]; total: number; page: number; pageSize: number }> {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'Admin access is required.');

  const admin = createAdminClient() as any;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, options.pageSize ?? 20));
  const from = (page - 1) * pageSize;

  let query = admin
    .from('leads')
    .select('id, customer_name, mobile_country_code, mobile_normalized, email, status, source', {
      count: 'exact',
    });

  const search = options.q?.trim();
  if (search) {
    const digits = search.replace(/\D/g, '');
    const escaped = search.replace(/[%_,]/g, ' ');
    query =
      digits.length >= 4
        ? query.or(
            `mobile_normalized.ilike.%${digits}%,customer_name.ilike.%${escaped}%,lead_code.ilike.%${escaped}%`,
          )
        : query.or(
            `customer_name.ilike.%${escaped}%,lead_code.ilike.%${escaped}%,email.ilike.%${escaped}%`,
          );
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new AppError('INTERNAL', 'Could not load leads.', { cause: error });

  return { items: (data ?? []) as PurgeCandidate[], total: count ?? 0, page, pageSize };
}

const hashCode = (challengeId: string, code: string) =>
  createHash('sha256').update(`${challengeId}:${code}`).digest('hex');

export async function requestLeadPurgeOtp(user: SessionUser, leadIds: string[]) {
  if (!user.isAdmin || !user.email) throw new AppError('FORBIDDEN', 'An Admin email is required.');
  const unique = [...new Set(leadIds)];
  if (!unique.length) throw new AppError('VALIDATION', 'Select at least one lead.');

  // Refuse rather than silently truncate. The old `.slice()` would have taken
  // the first hundred of a larger selection and reported success, leaving the
  // rest in place with nobody told which.
  if (unique.length > MAX_LEADS) {
    throw new AppError(
      'VALIDATION',
      `Select up to ${MAX_LEADS} leads at a time. You have ${unique.length} selected.`,
    );
  }
  const ids = unique;

  const admin = createAdminClient() as any;
  const { data: leads, error: leadError } = await admin
    .from('leads').select('id').in('id', ids);
  if (leadError || leads?.length !== ids.length) {
    throw new AppError('VALIDATION', 'One or more selected leads no longer exist.');
  }

  const { data: recent } = await admin.from('lead_purge_challenges')
    .select('created_at').eq('admin_user_id', user.id)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString()).limit(1);
  if (recent?.length) throw new AppError('RATE_LIMITED', 'Wait one minute before requesting another code.');

  const code = String(randomInt(100000, 1000000));
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const { error } = await admin.from('lead_purge_challenges').insert({
    id: challengeId,
    admin_user_id: user.id,
    lead_ids: ids,
    code_hash: hashCode(challengeId, code),
    expires_at: expiresAt,
  });
  if (error) throw new AppError('INTERNAL', 'Could not create deletion verification.', { cause: error });

  const rendered = purgeOtpEmail(code, ids.length, user.profile.full_name, user.email);
  const sent = await sendEmail({
    to: PURGE_OTP_RECIPIENT,
    ...rendered,
    emailType: 'security.lead_purge_otp',
    relatedEntityType: 'lead_batch',
  });
  if (!sent.ok) {
    await admin.from('lead_purge_challenges').delete().eq('id', challengeId);
    throw new AppError('INTERNAL', sent.error ?? 'Could not email the verification code.');
  }

  // The real address, not a masked one: it is a fixed internal mailbox every
  // Admin already knows, and naming it is the whole instruction — "ask Abhishek
  // for the code" is only actionable if the screen says where it went.
  return { challengeId, sentTo: PURGE_OTP_RECIPIENT, expiresAt };
}

export async function verifyAndPurgeLeads(user: SessionUser, challengeId: string, code: string) {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'Admin access required.');
  const admin = createAdminClient() as any;
  const { data: challenge } = await admin.from('lead_purge_challenges').select('*')
    .eq('id', challengeId).eq('admin_user_id', user.id).maybeSingle();
  if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
    throw new AppError('VALIDATION', 'This verification code has expired. Request a new one.');
  }
  if (challenge.attempt_count >= 5) throw new AppError('VALIDATION', 'Too many incorrect attempts. Request a new code.');

  const actual = Buffer.from(hashCode(challengeId, code));
  const expected = Buffer.from(challenge.code_hash);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    await admin.from('lead_purge_challenges').update({ attempt_count: challenge.attempt_count + 1 }).eq('id', challengeId);
    throw new AppError('VALIDATION', 'Incorrect verification code.');
  }

  const leadIds: string[] = challenge.lead_ids;
  const objectKeys = await getLeadObjectKeys(admin, leadIds);
  if (objectKeys.length && !storageConfigured()) {
    throw new AppError('NOT_CONFIGURED', 'File storage is unavailable, so these leads cannot be safely deleted.');
  }

  await admin.from('lead_purge_challenges').update({ verified_at: new Date().toISOString() }).eq('id', challengeId);
  for (const objectKey of objectKeys) await deleteStoredObject(objectKey);

  const { data, error } = await admin.rpc('purge_leads_for_verified_challenge', {
    p_challenge_id: challengeId,
    p_actor_user_id: user.id,
  });
  if (error) throw new AppError('INTERNAL', 'Files were removed, but the database purge failed. Contact support.', { cause: error });
  return { deletedCount: Number(data ?? 0) };
}

async function getLeadObjectKeys(admin: any, leadIds: string[]): Promise<string[]> {
  const [{ data: visits }, { data: designs }, { data: executions }] = await Promise.all([
    admin.from('site_visits').select('id').in('lead_id', leadIds),
    admin.from('design_projects').select('id').in('lead_id', leadIds),
    admin.from('execution_projects').select('id').in('lead_id', leadIds),
  ]);
  const visitIds = (visits ?? []).map((row: any) => row.id);
  const designIds = (designs ?? []).map((row: any) => row.id);
  const executionIds = (executions ?? []).map((row: any) => row.id);
  const { data: tasks } = executionIds.length
    ? await admin.from('execution_tasks').select('id').in('execution_project_id', executionIds)
    : { data: [] };
  const taskIds = (tasks ?? []).map((row: any) => row.id);
  const filters = [`lead_id.in.(${leadIds.join(',')})`];
  if (visitIds.length) filters.push(`site_visit_id.in.(${visitIds.join(',')})`);
  if (designIds.length) filters.push(`design_project_id.in.(${designIds.join(',')})`);
  if (executionIds.length) filters.push(`execution_project_id.in.(${executionIds.join(',')})`);
  if (taskIds.length) filters.push(`execution_task_id.in.(${taskIds.join(',')})`);
  const { data, error } = await admin.from('files').select('object_key').or(filters.join(','));
  if (error) throw new AppError('INTERNAL', 'Could not inspect related files.', { cause: error });
  return [...new Set((data ?? []).map((row: any) => row.object_key))] as string[];
}


/**
 * Names the requester, because the recipient is usually not them.
 *
 * The code now goes to the owner's mailbox whoever pressed the button, so "if
 * you did not request this, ignore it" is the wrong instruction — the owner
 * never requests it. They need to know who is asking and what for, so they can
 * decide whether to hand the code over.
 */
function purgeOtpEmail(code: string, count: number, requestedBy: string, requesterEmail?: string) {
  const who = requesterEmail ? `${requestedBy} (${requesterEmail})` : requestedBy;
  const subject = 'Approve permanent lead deletion — Star Gardens';
  const text = `${who} is asking to permanently delete ${count} lead${count === 1 ? '' : 's'} and all their CRM history. Verification code: ${code}. It expires in 10 minutes. Only share it if you agree to the deletion — it cannot be undone.`;
  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>Approve permanent deletion</h2><p><strong>${who}</strong> is asking to permanently delete <strong>${count}</strong> lead${count === 1 ? '' : 's'} and all of their CRM history — calls, follow-ups, visits, designs, execution records and stored files.</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>The code expires in 10 minutes. Only share it if you agree to the deletion — <strong>it cannot be undone</strong>.</p></div>`,
  };
}
