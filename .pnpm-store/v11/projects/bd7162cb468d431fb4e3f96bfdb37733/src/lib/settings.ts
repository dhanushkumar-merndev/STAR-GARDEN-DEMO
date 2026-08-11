import 'server-only';

import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured, uploadEnv } from '@/lib/env';
import { DEFAULT_MAX_UPLOAD_MB } from '@/lib/utils/files';
import {
  NORMALIZATION_DEFAULTS,
  type LeadNormalizationSettings,
} from '@/lib/utils/normalize';

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

/**
 * The company's own contact details.
 *
 * Kept apart from `AppSettings` because these are the values that appear in
 * front of a *customer* — in an email footer, on the portal, behind a WhatsApp
 * button — whereas `AppSettings` is internal tuning.
 */
export interface BusinessSettings {
  name: string;
  /** Digits with a leading `+`, or null when the Admin has not set one yet. */
  whatsappNumber: string | null;
  phone: string | null;
  email: string | null;
  whatsappTemplate: string;
  clientPortalEnabled: boolean;
  /**
   * Whether BDM is a separate role.
   *
   * Off today — the two Admins do the calling themselves. The role is never
   * removed from the enum, so turning this on later reveals the controls
   * without needing a data migration or reassigning historical leads.
   */
  bdmRoleEnabled: boolean;
}

/**
 * The normalization rules live in `lib/utils/normalize` alongside the pure
 * functions that apply them, so those stay importable without `server-only`.
 * Re-exported here because this is where the rest of the app reads settings.
 */
export type { LeadNormalizationSettings };
export { NORMALIZATION_DEFAULTS };

const DEFAULTS: AppSettings = {
  maxUploadSizeMb: DEFAULT_MAX_UPLOAD_MB,
  followUpReminderLeadHours: 24,
  designDueReminderLeadHours: 48,
  duplicateLookbackDays: 365,
  defaultCountryCode: '+91',
};

const BUSINESS_DEFAULTS: BusinessSettings = {
  name: 'Star Gardens',
  whatsappNumber: null,
  phone: null,
  email: null,
  whatsappTemplate:
    'Hello {{customer_name}}, this is {{business_name}} regarding your garden enquiry {{lead_code}}.',
  clientPortalEnabled: true,
  bdmRoleEnabled: false,
};

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** Returns null rather than a fallback — an unset contact detail must stay unset. */
function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

/**
 * Reduces a number to what `wa.me` accepts: digits only, country code included.
 *
 * Returns null for anything too short to be a real number, because a malformed
 * `wa.me` link opens WhatsApp on an error rather than failing visibly here.
 */
export function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
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

/**
 * Company contact details, de-duplicated per request.
 *
 * Read with the service-role client for the same reason `getSettings` does: the
 * customer portal and outbound email both need these on paths where the caller
 * is not a staff member, and none of it is secret.
 */
export const getBusinessSettings = cache(async (): Promise<BusinessSettings> => {
  if (!isSupabaseConfigured()) return BUSINESS_DEFAULTS;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'business_name',
        'business_whatsapp_number',
        'business_phone',
        'business_email',
        'whatsapp_default_message',
        'client_portal_enabled',
        'bdm_role_enabled',
      ]);

    if (error || !data) return BUSINESS_DEFAULTS;

    const map = new Map(data.map((row) => [row.key, row.value]));

    return {
      name: asString(map.get('business_name'), BUSINESS_DEFAULTS.name),
      whatsappNumber: normalizeWhatsappNumber(
        asOptionalString(map.get('business_whatsapp_number')),
      ),
      phone: asOptionalString(map.get('business_phone')),
      email: asOptionalString(map.get('business_email')),
      whatsappTemplate: asString(
        map.get('whatsapp_default_message'),
        BUSINESS_DEFAULTS.whatsappTemplate,
      ),
      clientPortalEnabled: asBoolean(
        map.get('client_portal_enabled'),
        BUSINESS_DEFAULTS.clientPortalEnabled,
      ),
      bdmRoleEnabled: asBoolean(map.get('bdm_role_enabled'), BUSINESS_DEFAULTS.bdmRoleEnabled),
    };
  } catch (error) {
    console.error('[settings] business defaults', error);
    return BUSINESS_DEFAULTS;
  }
});

/**
 * The one-time normalization setup, applied to every intake path.
 *
 * Falls back to "everything on" when the row is missing: a lead cleaned too
 * eagerly is a cosmetic problem, whereas a lead stored with a phone number the
 * duplicate check cannot match is a real one.
 */
export const getNormalizationSettings = cache(
  async (): Promise<LeadNormalizationSettings> => {
    if (!isSupabaseConfigured()) return NORMALIZATION_DEFAULTS;

    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('app_settings')
        .select('value')
        .eq('key', 'lead_normalization')
        .maybeSingle();

      const raw = (data?.value ?? {}) as Record<string, unknown>;

      return {
        trimWhitespace: asBoolean(raw.trimWhitespace, NORMALIZATION_DEFAULTS.trimWhitespace),
        collapseSpaces: asBoolean(raw.collapseSpaces, NORMALIZATION_DEFAULTS.collapseSpaces),
        titleCaseNames: asBoolean(raw.titleCaseNames, NORMALIZATION_DEFAULTS.titleCaseNames),
        lowercaseEmail: asBoolean(raw.lowercaseEmail, NORMALIZATION_DEFAULTS.lowercaseEmail),
        stripPhoneFormatting: asBoolean(
          raw.stripPhoneFormatting,
          NORMALIZATION_DEFAULTS.stripPhoneFormatting,
        ),
        dropPlaceholderEmails: asBoolean(
          raw.dropPlaceholderEmails,
          NORMALIZATION_DEFAULTS.dropPlaceholderEmails,
        ),
      };
    } catch {
      return NORMALIZATION_DEFAULTS;
    }
  },
);

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
