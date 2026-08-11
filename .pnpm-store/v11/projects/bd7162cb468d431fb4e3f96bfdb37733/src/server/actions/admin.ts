'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { actionResult, AppError, type ActionResult } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { AuditAction, recordAudit } from '@/lib/audit';
import { formDataToObject } from '@/lib/validation/common';
import {
  businessSettingsSchema,
  inviteStaffSchema,
  normalizationSettingsSchema,
  parseOrThrow,
  selectAdAccountSchema,
  selectCampaignsSchema,
  updateSettingSchema,
  updateUserSchema,
  upsertConfigOptionSchema,
} from '@/lib/validation/schemas';
import { normalizeWhatsappNumber } from '@/lib/settings';
import {
  inviteStaff as inviteStaffService,
  revokeInvite as revokeInviteService,
  updateOwnProfile as updateOwnProfileService,
  updateStaff as updateStaffService,
} from '@/server/services/users';
import { checkRateLimit } from '@/lib/rate-limit';
import { activeEmailProvider, sendEmail } from '@/lib/email';
import { testEmail } from '@/lib/email/templates';
import {
  checkSyncCooldown,
  recordManualSyncTrigger,
  saveCampaignSelection,
  saveFormMapping,
  selectAdAccount,
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
/**
 * The business-contact panel, saved as one unit.
 *
 * Deliberately not six independent `updateSettingAction` calls: these values
 * are read together — a WhatsApp button needs the number *and* the message
 * template, an email footer needs the name *and* the phone — and saving them
 * one at a time lets a half-updated set reach a customer.
 */
export async function updateBusinessSettingsAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(businessSettingsSchema, formDataToObject(formData));
    const supabase = await createClient();

    const whatsapp = input.business_whatsapp_number?.trim() ?? '';

    // Reject a number that cannot make a working `wa.me` link here, rather
    // than storing it and letting every button open WhatsApp on an error.
    if (whatsapp !== '' && !normalizeWhatsappNumber(whatsapp)) {
      throw new AppError('VALIDATION', 'That WhatsApp number does not look complete.', {
        fields: {
          business_whatsapp_number:
            'Include the country code, e.g. +919876543210.',
        },
      });
    }

    const rows = [
      { key: 'business_name', value: input.business_name },
      { key: 'business_whatsapp_number', value: whatsapp },
      { key: 'business_phone', value: input.business_phone ?? '' },
      { key: 'business_email', value: input.business_email ?? '' },
      {
        key: 'whatsapp_default_message',
        value:
          input.whatsapp_default_message?.trim() ||
          'Hello {{customer_name}}, this is {{business_name}} regarding your garden enquiry {{lead_code}}.',
      },
      { key: 'client_portal_enabled', value: input.client_portal_enabled === true },
      { key: 'bdm_role_enabled', value: input.bdm_role_enabled === true },
    ];

    const { error } = await supabase.from('app_settings').upsert(
      rows.map((row) => ({
        key: row.key,
        value: row.value as never,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'key' },
    );

    if (error) {
      throw new AppError('INTERNAL', 'Could not save the business details.', { cause: error });
    }

    await recordAudit({
      actorUserId: user.id,
      action: AuditAction.SETTING_UPDATED,
      entityType: 'app_setting',
      after: Object.fromEntries(rows.map((row) => [row.key, row.value])),
    });

    // The contact block appears in the header of every customer-facing page and
    // in every outbound email, so the whole app is stale after this.
    revalidatePath('/settings');
    revalidatePath('/portal', 'layout');
    revalidatePath('/leads', 'layout');

    return undefined;
  });
}

/** The one-time lead-cleaning setup. Saved as one JSON object. */
export async function updateNormalizationSettingsAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(normalizationSettingsSchema, formDataToObject(formData));
    const supabase = await createClient();

    // An unchecked checkbox sends nothing at all, so absence means false —
    // which is exactly what an untouched toggle should mean here.
    const value = {
      trimWhitespace: input.trimWhitespace === true,
      collapseSpaces: input.collapseSpaces === true,
      titleCaseNames: input.titleCaseNames === true,
      lowercaseEmail: input.lowercaseEmail === true,
      stripPhoneFormatting: input.stripPhoneFormatting === true,
      dropPlaceholderEmails: input.dropPlaceholderEmails === true,
    };

    const { error } = await supabase.from('app_settings').upsert(
      {
        key: 'lead_normalization',
        value: value as never,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );

    if (error) {
      throw new AppError('INTERNAL', 'Could not save the cleaning rules.', { cause: error });
    }

    await recordAudit({
      actorUserId: user.id,
      action: AuditAction.SETTING_UPDATED,
      entityType: 'app_setting',
      after: { lead_normalization: value },
    });

    revalidatePath('/settings');
    return undefined;
  });
}

/* -------------------------------------------------------------------------- */
/* Meta setup                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Picks the ad account the syncs will use.
 *
 * Stored in Supabase, not in the deployment environment — which is the point:
 * the owner switches account from this screen and the next sync picks it up ten
 * minutes later, with no Vercel change and no redeploy.
 */
export async function selectAdAccountAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ adAccountId: string }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(selectAdAccountSchema, formDataToObject(formData));

    await selectAdAccount(user, input.meta_ad_account_id);

    revalidatePath('/settings/integrations/meta');
    revalidatePath('/settings/integrations');
    revalidatePath('/marketing/meta-ads');

    return { adAccountId: input.meta_ad_account_id };
  });
}

/** Saves which campaigns feed the CRM. */
export async function saveCampaignSelectionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ mode: 'ALL' | 'SELECTED'; count: number }>> {
  return actionResult(async () => {
    const user = await requireAdmin();

    // `getAll` rather than `formDataToObject`: a checkbox group sends the same
    // key many times, and collapsing it to one value would silently drop every
    // campaign but the last.
    const campaignIds = formData
      .getAll('campaign_ids')
      .map((value) => String(value).trim())
      .filter(Boolean);

    const input = parseOrThrow(selectCampaignsSchema, {
      meta_ad_account_id: formData.get('meta_ad_account_id') ?? '',
      campaign_ids: campaignIds,
      selection_mode: formData.get('selection_mode') ?? 'SELECTED',
    });

    await saveCampaignSelection(user, {
      adAccountId: input.meta_ad_account_id || null,
      campaignIds: input.campaign_ids,
      mode: input.selection_mode,
    });

    revalidatePath('/settings/integrations/meta');
    revalidatePath('/marketing/meta-ads');

    return { mode: input.selection_mode, count: input.campaign_ids.length };
  });
}

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
    const rate = await checkRateLimit({
      bucket: 'admin_test_email',
      identifier: user.id,
      limit: 3,
      windowSeconds: 24 * 60 * 60,
    });
    if (!rate.allowed) {
      throw new AppError('RATE_LIMITED', 'You can send up to 3 test emails per day. Please try again tomorrow.', {
        meta: { retryAfterSeconds: rate.retryAfterSeconds },
      });
    }

    const recipient = user.email ?? user.profile.email;
    if (!recipient) throw new AppError('VALIDATION', 'Your profile has no email address.');

    // Naming the transport in the message is what makes the test diagnostic:
    // "it arrived" is much less useful than "it arrived via Brevo".
    const rendered = testEmail(user.profile.full_name, activeEmailProvider());
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
