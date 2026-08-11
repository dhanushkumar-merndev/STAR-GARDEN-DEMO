/**
 * Phone normalization and field mapping for Edge Functions.
 *
 * Intentionally a small, self-contained port of `src/lib/utils/phone.ts` and
 * `src/lib/meta/mapping.ts`. Deno functions cannot import from the Next.js
 * `src/` tree, and the alternative — a shared npm package for two pure
 * functions — is more machinery than an MVP warrants.
 *
 * **If the normalization rules change, change them in both places.** They must
 * agree, because duplicate detection compares the output of one against rows
 * written by the other.
 */

export const DEFAULT_COUNTRY_CODE = '+91';

const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

export interface NormalizedPhone {
  countryCode: string;
  national: string;
}

/** Mirrors `normalizeMobile()` in the app. Returns null instead of throwing. */
export function normalizeMobile(input: string | null | undefined): NormalizedPhone | null {
  if (!input || typeof input !== 'string') return null;

  const hadPlus = input.trim().startsWith('+');
  let digits = input.replace(/\D/g, '');
  if (digits === '') return null;

  if (digits.startsWith('00')) digits = digits.slice(2);

  const defaultDigits = DEFAULT_COUNTRY_CODE.replace(/\D/g, '');
  if (digits.startsWith(defaultDigits) && digits.length > 10) {
    digits = digits.slice(defaultDigits.length);
  }
  while (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length === 10) {
    if (!INDIAN_MOBILE.test(digits)) return null;
    return { countryCode: DEFAULT_COUNTRY_CODE, national: digits };
  }

  if (!hadPlus && !input.trim().startsWith('00')) return null;
  if (digits.length < 8 || digits.length > 15) return null;

  const KNOWN_CODES = ['971', '966', '974', '968', '965', '973', '977', '94', '65', '61', '44', '1'];
  const code = KNOWN_CODES.find((c) => digits.startsWith(c)) ?? digits.slice(0, 1);

  return { countryCode: `+${code}`, national: digits.slice(code.length) };
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const trimmed = input?.trim().toLowerCase();
  return trimmed && trimmed.includes('@') ? trimmed : null;
}

/* -------------------------------------------------------------------------- */
/* Field mapping                                                               */
/* -------------------------------------------------------------------------- */

export type CrmField =
  | 'customer_name'
  | 'mobile'
  | 'email'
  | 'location_text'
  | 'requirement_summary'
  | 'IGNORE';

export interface MappingEntry {
  meta_field_key: string;
  crm_field: CrmField;
}

export interface MappedLead {
  customerName: string | null;
  mobile: string | null;
  email: string | null;
  locationText: string | null;
  requirementSummary: string | null;
  unmapped: Record<string, string>;
}

/** Mirrors `applyMapping()` in the app. */
export function applyMapping(
  fieldData: { name: string; values: string[] }[],
  entries: MappingEntry[],
): MappedLead {
  const byKey = new Map<string, CrmField>();
  for (const entry of entries) {
    byKey.set(entry.meta_field_key.trim().toLowerCase(), entry.crm_field);
  }

  const result: MappedLead = {
    customerName: null,
    mobile: null,
    email: null,
    locationText: null,
    requirementSummary: null,
    unmapped: {},
  };

  for (const field of fieldData ?? []) {
    const value = (field.values ?? [])
      .filter((v) => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim())
      .join(', ');

    if (value === '') continue;

    switch (byKey.get(field.name.trim().toLowerCase())) {
      case 'customer_name':
        result.customerName = value;
        break;
      case 'mobile':
        result.mobile = value;
        break;
      case 'email':
        result.email = value;
        break;
      case 'location_text':
        result.locationText = value;
        break;
      case 'requirement_summary':
        result.requirementSummary = result.requirementSummary
          ? `${result.requirementSummary}\n${value}`
          : value;
        break;
      case 'IGNORE':
        break;
      default:
        // No mapping for this question. Kept, not dropped — the BDM still sees
        // the answer under the requirement summary.
        result.unmapped[field.name] = value;
    }
  }

  return result;
}

export function composeRequirement(mapped: MappedLead): string | null {
  const extras = Object.entries(mapped.unmapped).map(([key, value]) => {
    const label = key.replace(/[_-]+/g, ' ').trim();
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${value}`;
  });

  const parts = [mapped.requirementSummary, extras.length ? extras.join('\n') : null].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length ? parts.join('\n\n') : null;
}
