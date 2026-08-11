'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { actionResult, AppError, type ActionResult } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { AuditAction, recordAudit } from '@/lib/audit';
import { formDataToObject } from '@/lib/validation/common';
import {
  inviteStaffSchema,
  parseOrThrow,
  updateSettingSchema,
  updateUserSchema,
  upsertConfigOptionSchema,
} from '@/lib/validation/schemas';
import {
  inviteStaff as inviteStaffService,
  revokeInvite as revokeInviteService,
  updateOwnProfile as updateOwnProfileService,
  updateStaff as updateStaffService,
} from '@/server/services/users';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email';
import { testEmail } from '@/lib/email/templates';
import {
  checkSyncCooldown,
  recordManualSyncTrigger,
  saveFormMapping,
} from '@/server/services/meta-config';
import type { MappingEntry } from '@/lib/meta/mapping';
import type { MetaSyncType } from '@/types/database';

/**
 * Admin Server Actions (AGENTS.md §7.1, §11.7).
 */

export async function inviteStaffAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ inviteId: string }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(inviteStaffSchema, formDataToObject(formData));

    const invite = await inviteStaffService(user, input);

    revalidatePath('/settings/users');
    return { inviteId: invite.id };
  });
}

export async function revokeInviteAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const inviteId = String(formData.get('invite_id') ?? '');

    if (!inviteId) throw new AppError('VALIDATION', 'Missing invite.');

    await revokeInviteService(user, inviteId);
    revalidatePath('/settings/users');
    return undefined;
  });
}

export async function updateStaffAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ userId: string }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(updateUserSchema, formDataToObject(formData));

    const profile = await updateStaffService(user, input);

    revalidatePath('/settings/users');
    return { userId: profile.id };
  });
}

export async function updateOwnProfileAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireUser();

    const fullName = String(formData.get('full_name') ?? '').trim();
    const mobile = String(formData.get('mobile') ?? '').trim();

    if (fullName.length < 1) {
      throw new AppError('VALIDATION', 'Name is required.', {
        fields: { full_name: 'Name is required.' },
      });
    }

    await updateOwnProfileService(user, { full_name: fullName, mobile: mobile || undefined });

    revalidatePath('/profile');
    return undefined;
  });
}

/**
 * Runtime settings, e.g. the upload size limit (§5.3, §11.7).
 *
 * Values are stored as JSONB, so a numeric setting is written as a number and a
 * text setting as a quoted string — otherwise `getSettings()` would read back a
 * string where it expects a number.
 */
export async function updateSettingAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(updateSettingSchema, formDataToObject(formData));
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('key', input.key)
      .maybeSingle();

    if (!existing) throw new AppError('NOT_FOUND', 'Unknown setting.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.value);
    } catch {
      // Plain text entered for a string setting.
      parsed = input.value;
    }

    if (input.key === 'max_upload_size_mb') {
      const mb = Number(parsed);
      if (!Number.isFinite(mb) || mb <= 0 || mb > 500) {
        throw new AppError('VALIDATION', 'Upload limit must be between 1 and 500 MB.', {
          fields: { value: 'Enter a number between 1 and 500.' },
        });
      }
      parsed = mb;
    }

    const { error } = await supabase
      .from('app_settings')
      .update({ value: parsed as never, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('key', input.key);

    if (error) throw new AppError('INTERNAL', 'Could not save the setting.', { cause: error });

    await recordAudit({
      actorUserId: user.id,
      action: AuditAction.SETTING_UPDATED,
      entityType: 'app_setting',
      before: { key: input.key, value: existing.value },
      after: { key: input.key, value: parsed },
    });

    revalidatePath('/settings');
    return undefined;
  });
}

export async function upsertConfigOptionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(upsertConfigOptionSchema, formDataToObject(formData));
    const supabase = await createClient();

    const payload = {
      group_key: input.group_key,
      value: input.value,
      label: input.label,
      sort_order: input.sort_order,
      is_active: input.is_active,
    };

    const { error } = input.id
      ? await supabase.from('config_options').update(payload).eq('id', input.id)
      : await supabase.from('config_options').insert(payload);

    if (error) {
      throw new AppError(
        error.code === '23505' ? 'CONFLICT' : 'INTERNAL',
        error.code === '23505'
          ? 'That value already exists in this group.'
          : 'Could not save the option.',
        { cause: error },
      );
    }

    await recordAudit({
      actorUserId: user.id,
      action: AuditAction.SETTING_UPDATED,
      entityType: 'config_option',
      entityId: input.id ?? null,
      after: payload,
    });

    revalidatePath('/settings/options');
    return undefined;
  });
}

/** Replays a failed Meta webhook event (§14 "support safe retry"). */
export async function retryMetaEventAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ outcome: string }>> {
  return actionResult(async () => {
    await requireAdmin();
    const eventId = String(formData.get('event_id') ?? '');

    if (!eventId) throw new AppError('VALIDATION', 'Missing event.');

    const supabase = await createClient();
    const { data: event, error: eventError } = await supabase
      .from('meta_webhook_events')
      .select('payload, processing_status')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError || !event) throw new AppError('NOT_FOUND', 'Webhook event not found.');
    if (event.processing_status === 'PROCESSED') return { outcome: 'SKIPPED' };
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      throw new AppError('VALIDATION', 'The stored webhook payload is not replayable.');
    }

    const { data, error } = await supabase.functions.invoke('meta-webhook', {
      body: event.payload as Record<string, unknown>,
    });
    if (error) throw new AppError('INTERNAL', 'The webhook retry failed.', { cause: error });

    const result = data as { created?: number; duplicates?: number; unmapped?: number; failed?: number } | null;
    const outcome = result?.created
      ? 'CREATED'
      : result?.duplicates
        ? 'DUPLICATE'
        : result?.unmapped
          ? 'UNMAPPED_FORM'
          : result?.failed
            ? 'FAILED'
            : 'SKIPPED';
    revalidatePath('/settings/integrations');
    revalidatePath('/settings/integrations/issues');

    return { outcome };
  });
}

export async function sendTestEmailAction(): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    await enforceRateLimit({
      bucket: 'admin_test_email',
      identifier: user.id,
      limit: 3,
      windowSeconds: 60 * 60,
    });

    const recipient = user.email ?? user.profile.email;
    if (!recipient) throw new AppError('VALIDATION', 'Your profile has no email address.');

    const rendered = testEmail(user.profile.full_name);
    const result = await sendEmail({
      to: recipient,
      ...rendered,
      emailType: 'admin.test',
      relatedEntityType: 'profile',
      relatedEntityId: user.id,
    });

    if (!result.ok) {
      throw new AppError('INTERNAL', result.error ?? 'The test email could not be sent.');
    }

    revalidatePath('/settings/integrations');
    return undefined;
  });
}

export async function syncMetaAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ syncType: MetaSyncType }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const syncType = String(formData.get('sync_type') ?? '') as MetaSyncType;
    if (syncType !== 'CAMPAIGNS' && syncType !== 'INSIGHTS') {
      throw new AppError('VALIDATION', 'Unknown Meta sync type.');
    }

    const remaining = await checkSyncCooldown(user, syncType);
    if (remaining > 0) {
      throw new AppError('RATE_LIMITED', `Try again in ${remaining} seconds.`);
    }

    const supabase = await createClient();
    const functionName = syncType === 'CAMPAIGNS' ? 'meta-sync' : 'meta-insights-sync';
    const { error } = await supabase.functions.invoke(functionName, {
      body: { source: 'admin' },
    });
    if (error) throw new AppError('INTERNAL', `Meta ${syncType.toLowerCase()} sync failed.`, { cause: error });

    await recordManualSyncTrigger(user, syncType);
    revalidatePath('/settings/integrations');
    revalidatePath('/marketing/meta-ads');
    return { syncType };
  });
}

export async function saveMetaMappingAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const metaFormId = String(formData.get('meta_form_id') ?? '');
    const raw = String(formData.get('entries') ?? '[]');

    let entries: MappingEntry[];
    try {
      entries = JSON.parse(raw) as MappingEntry[];
    } catch {
      throw new AppError('VALIDATION', 'The field mapping payload is malformed.');
    }

    await saveFormMapping(user, { metaFormId, entries });
    revalidatePath('/settings/integrations/mapping');
    revalidatePath('/settings/integrations');
    return undefined;
  });
}
