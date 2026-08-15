import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any -- temporary until generated Supabase types include the purge migration */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteStoredObject, storageConfigured } from '@/lib/tigris';
import { sendEmail } from '@/lib/email';
import type { SessionUser } from '@/lib/auth/session';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_LEADS = 100;

const hashCode = (challengeId: string, code: string) =>
  createHash('sha256').update(`${challengeId}:${code}`).digest('hex');

export async function requestLeadPurgeOtp(user: SessionUser, leadIds: string[]) {
  if (!user.isAdmin || !user.email) throw new AppError('FORBIDDEN', 'An Admin email is required.');
  const ids = [...new Set(leadIds)].slice(0, MAX_LEADS);
  if (!ids.length) throw new AppError('VALIDATION', 'Select at least one lead.');

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

  const rendered = purgeOtpEmail(code, ids.length);
  const sent = await sendEmail({
    to: user.email,
    ...rendered,
    emailType: 'security.lead_purge_otp',
    relatedEntityType: 'lead_batch',
  });
  if (!sent.ok) {
    await admin.from('lead_purge_challenges').delete().eq('id', challengeId);
    throw new AppError('INTERNAL', sent.error ?? 'Could not email the verification code.');
  }

  return { challengeId, maskedEmail: maskEmail(user.email), expiresAt };
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

function maskEmail(email: string) {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

function purgeOtpEmail(code: string, count: number) {
  const subject = 'Confirm permanent lead deletion — Star Gardens';
  const text = `Your verification code is ${code}. It expires in 10 minutes. This permanently deletes ${count} selected lead${count === 1 ? '' : 's'} and their CRM history. If you did not request this, do not share the code.`;
  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>Permanent deletion verification</h2><p>Use this code to permanently delete <strong>${count}</strong> selected lead${count === 1 ? '' : 's'} and their CRM history:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>The code expires in 10 minutes. If you did not request this, do not share the code.</p></div>`,
  };
}
