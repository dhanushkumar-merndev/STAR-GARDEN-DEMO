/**
 * Indian mobile number normalization (AGENTS.md §8.1).
 *
 * Duplicate detection is only as good as this function: two records for the
 * same person must produce byte-identical `mobile_normalized` values whether
 * the number arrived as "+91 98450 12345", "098450-12345" or "9845012345".
 *
 * Pure and dependency-free so it can be unit tested directly (§20.1).
 */

export const DEFAULT_COUNTRY_CODE = '+91';

/** Indian mobile numbers are 10 digits and never start with 0–5. */
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

export interface NormalizedPhone {
  /** e.g. "+91" */
  countryCode: string;
  /** National significant number, digits only. For India, 10 digits. */
  national: string;
  /** Convenience join, e.g. "+919845012345". */
  e164: string;
}

export class PhoneNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneNormalizationError';
  }
}

/**
 * Strips formatting and resolves the country code.
 *
 * Handles the shapes that actually arrive from Meta Lead Ads, the website form
 * and manual entry:
 *
 *   "+91 98450 12345"   -> +91 / 9845012345
 *   "0091-9845012345"   -> +91 / 9845012345
 *   "09845012345"       -> +91 / 9845012345   (trunk prefix)
 *   "919845012345"      -> +91 / 9845012345
 *   "9845012345"        -> +91 / 9845012345
 *
 * Non-Indian numbers are accepted but only lightly validated: we keep the
 * leading country code and the remaining digits, because the MVP serves an
 * Indian market and a stricter rule would reject legitimate outliers.
 */
export function normalizeMobile(input: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): NormalizedPhone {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new PhoneNormalizationError('Mobile number is required.');
  }

  const hadPlus = input.trim().startsWith('+');
  let digits = input.replace(/\D/g, '');

  if (digits === '') {
    throw new PhoneNormalizationError('Mobile number must contain digits.');
  }

  // "00" is the international access prefix; treat it exactly like a leading +.
  if (digits.startsWith('00')) digits = digits.slice(2);

  const defaultDigits = defaultCountryCode.replace(/\D/g, '');

  // Indian numbers: peel the country code, then the domestic trunk prefix.
  if (digits.startsWith(defaultDigits) && digits.length > 10) {
    digits = digits.slice(defaultDigits.length);
  }
  while (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length === 10) {
    if (!INDIAN_MOBILE.test(digits)) {
      throw new PhoneNormalizationError(
        'Enter a valid 10-digit Indian mobile number (it must start with 6, 7, 8 or 9).',
      );
    }
    return {
      countryCode: defaultCountryCode,
      national: digits,
      e164: `${defaultCountryCode}${digits}`,
    };
  }

  // Not 10 digits after peeling: either an international number, or junk.
  if (!hadPlus && !input.trim().startsWith('00')) {
    throw new PhoneNormalizationError(
      'Enter a valid 10-digit Indian mobile number, or include the country code for an international number.',
    );
  }

  if (digits.length < 8 || digits.length > 15) {
    throw new PhoneNormalizationError('Mobile number length is not valid.');
  }

  // Longest-match against the country codes we plausibly see. Anything else
  // keeps a 1-digit code, which is imperfect but never loses information —
  // countryCode + national always reconstitutes the original digits.
  const KNOWN_CODES = ['971', '966', '974', '968', '965', '973', '977', '94', '65', '61', '44', '1'];
  const code = KNOWN_CODES.find((c) => digits.startsWith(c)) ?? digits.slice(0, 1);

  return {
    countryCode: `+${code}`,
    national: digits.slice(code.length),
    e164: `+${digits}`,
  };
}

/** Non-throwing variant for bulk intake, where one bad row must not abort the batch. */
export function tryNormalizeMobile(
  input: string | null | undefined,
  defaultCountryCode = DEFAULT_COUNTRY_CODE,
): NormalizedPhone | null {
  if (!input) return null;
  try {
    return normalizeMobile(input, defaultCountryCode);
  } catch {
    return null;
  }
}

/** "+91 98450 12345" — display only; never store this form. */
export function formatMobile(countryCode: string, national: string): string {
  if (countryCode === DEFAULT_COUNTRY_CODE && national.length === 10) {
    return `${countryCode} ${national.slice(0, 5)} ${national.slice(5)}`;
  }
  return `${countryCode} ${national}`;
}

/**
 * The `tel:` target for the device dialler (§6.1). This is the entire extent of
 * the CRM's involvement in a call — there is no telephony API (§3.2, §6.3).
 */
export function telHref(countryCode: string, national: string): string {
  return `tel:${countryCode}${national}`;
}

/** Email is compared lowercased for duplicate detection (§8.1). */
export function normalizeEmail(input: string | null | undefined): string | null {
  const trimmed = input?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}
