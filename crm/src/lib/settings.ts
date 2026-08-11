import 'server-only';

import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured, uploadEnv } from '@/lib/env';
import { DEFAULT_MAX_UPLOAD_MB } from '@/lib/utils/files';

/**
 * Runtime settings (AGENTS.md §2, §5.3, §11.7).
 *
 * Business options live in `app_settings` so an Admin can change the upload
 * limit or a reminder window without a redeploy. Environment variables are only
 * the fallback for when the row is missing.
 *
 * Read with the service-role client because settings are needed on paths with
 * no user session (the public enquiry form, the reminder cron) — and they are
 * non-secret configuration in any case.
 */

export interface AppSettings {
  maxUploadSizeMb: number;
  followUpReminderLeadHours: number;
  designDueReminderLeadHours: number;
  duplicateLookbackDays: number;
  defaultCountryCode: string;
}

const DEFAULTS: AppSettings = {
  maxUploadSizeMb: DEFAULT_MAX_UPLOAD_MB,
  followUpReminderLeadHours: 24,
  designDueReminderLeadHours: 48,
  duplicateLookbackDays: 365,
  defaultCountryCode: '+91',
};

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** De-duplicated per request. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const envFallback: AppSettings = {
    ...DEFAULTS,
    maxUploadSizeMb: uploadEnv.maxSizeMbFallback,
  };

  if (!isSupabaseConfigured()) return envFallback;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('app_settings').select('key, value');
    if (error || !data) return envFallback;

    const map = new Map(data.map((row) => [row.key, row.value]));

    return {
      maxUploadSizeMb: asNumber(map.get('max_upload_size_mb'), envFallback.maxUploadSizeMb),
      followUpReminderLeadHours: asNumber(
        map.get('follow_up_reminder_lead_hours'),
        DEFAULTS.followUpReminderLeadHours,
      ),
      designDueReminderLeadHours: asNumber(
        map.get('design_due_reminder_lead_hours'),
        DEFAULTS.designDueReminderLeadHours,
      ),
      duplicateLookbackDays: asNumber(
        map.get('duplicate_lookback_days'),
        DEFAULTS.duplicateLookbackDays,
      ),
      defaultCountryCode: asString(map.get('default_country_code'), DEFAULTS.defaultCountryCode),
    };
  } catch (error) {
    console.error('[settings] falling back to defaults', error);
    return envFallback;
  }
});

/** Configurable dropdown values — loss reasons, requirement types (§7.1). */
export const getConfigOptions = cache(
  async (groupKey: string): Promise<{ value: string; label: string }[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('config_options')
        .select('value, label')
        .eq('group_key', groupKey)
        .eq('is_active', true)
        .order('sort_order');
      return data ?? [];
    } catch {
      return [];
    }
  },
);
