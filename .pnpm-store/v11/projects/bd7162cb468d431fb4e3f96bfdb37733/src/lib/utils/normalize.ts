/**
 * Lead normalization — the "one-time setup" applied at every intake door.
 *
 * Meta, the website form and manual entry all produce the same customer typed
 * three different ways. Without a single cleaning pass, `"  RAVI  KUMAR "` and
 * `"Ravi Kumar"` are two leads, and `"+91 98765 43210"` never matches
 * `"9876543210"` in duplicate detection.
 *
 * Every function here is pure so the rules can be tested directly, and so the
 * Settings screen can preview a change before it is saved.
 */

/* -------------------------------------------------------------------------- */
/* Rules                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How raw inbound values are cleaned before they become a lead.
 *
 * Defined here rather than in `lib/settings` so this module stays free of
 * `server-only` — these are pure functions and the tests need to import them
 * without dragging in the Supabase client.
 */
export interface LeadNormalizationSettings {
  trimWhitespace: boolean;
  collapseSpaces: boolean;
  titleCaseNames: boolean;
  lowercaseEmail: boolean;
  stripPhoneFormatting: boolean;
  /** Discards `noreply@…`, `test@test.com` and Meta's own placeholders. */
  dropPlaceholderEmails: boolean;
}

/**
 * Everything on.
 *
 * A lead cleaned too eagerly is a cosmetic problem; a lead stored with a phone
 * number the duplicate check cannot match is a real one. So the fallback errs
 * towards cleaning.
 */
export const NORMALIZATION_DEFAULTS: LeadNormalizationSettings = {
  trimWhitespace: true,
  collapseSpaces: true,
  titleCaseNames: true,
  lowercaseEmail: true,
  stripPhoneFormatting: true,
  dropPlaceholderEmails: true,
};

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

export function cleanText(
  value: string | null | undefined,
  settings: LeadNormalizationSettings,
): string | null {
  if (value == null) return null;

  let out = String(value);
  if (settings.trimWhitespace) out = out.trim();
  // Also folds newlines and tabs, which paste in from ad creatives constantly.
  if (settings.collapseSpaces) out = out.replace(/\s+/g, ' ');

  return out === '' ? null : out;
}

/**
 * Title-cases a person's name without mangling the parts that are not words.
 *
 * Only touches strings that are entirely one case. A name the customer typed as
 * "McDonald" or "D'Souza" already carries deliberate capitalisation, and
 * "fixing" it would be wrong; a name typed as "RAVI KUMAR" or "ravi kumar"
 * carries none, and is what this exists for.
 */
export function normalizeName(
  value: string | null | undefined,
  settings: LeadNormalizationSettings,
): string | null {
  const cleaned = cleanText(value, settings);
  if (!cleaned) return null;
  if (!settings.titleCaseNames) return cleaned;

  const isSingleCase = cleaned === cleaned.toUpperCase() || cleaned === cleaned.toLowerCase();
  if (!isSingleCase) return cleaned;

  // Lowercase first, then raise the word starts. Capitalising in place would
  // leave "RAVI KUMAR" untouched, since its first letters are already capital —
  // the rest of each word is what has to come down.
  return cleaned.toLowerCase().replace(
    // A letter that starts a word, including after an apostrophe or hyphen.
    /(^|[\s'’-])(\p{L})/gu,
    (_match, boundary: string, letter: string) => boundary + letter.toUpperCase(),
  );
}

/* -------------------------------------------------------------------------- */
/* Email                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Addresses that mean "this person did not give us an email".
 *
 * Meta's lead forms hand back a literal placeholder when the field was optional
 * and skipped, and storing it would send our follow-up mail into a black hole —
 * or worse, to someone else's real inbox.
 */
const PLACEHOLDER_EMAILS = new Set([
  'noreply@example.com',
  'no-reply@example.com',
  'test@test.com',
  'test@example.com',
  'a@a.com',
  'na@na.com',
  'none@none.com',
  'null@null.com',
]);

const PLACEHOLDER_LOCAL_PARTS = /^(no-?reply|donotreply|do-not-reply|noemail|no-email|na|n\/a|none|null|test|dummy|xxx+)$/i;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(
  value: string | null | undefined,
  settings: LeadNormalizationSettings,
): string | null {
  const cleaned = cleanText(value, settings);
  if (!cleaned) return null;

  // Whitespace inside an address is always a paste artefact.
  const candidate = settings.lowercaseEmail
    ? cleaned.toLowerCase().replace(/\s/g, '')
    : cleaned.replace(/\s/g, '');

  if (!EMAIL_SHAPE.test(candidate)) return null;

  if (settings.dropPlaceholderEmails) {
    const local = candidate.slice(0, candidate.indexOf('@'));
    if (PLACEHOLDER_EMAILS.has(candidate.toLowerCase())) return null;
    if (PLACEHOLDER_LOCAL_PARTS.test(local)) return null;
  }

  return candidate;
}

/* -------------------------------------------------------------------------- */
/* Phone                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Strips a phone number back to digits and a possible leading `+`.
 *
 * Deliberately does NOT decide the country code — that is `lib/utils/phone`'s
 * job, which knows the configured default. This only removes the spaces,
 * brackets, dashes and stray letters that stop the parser seeing a number at
 * all.
 */
export function stripPhoneFormatting(
  value: string | null | undefined,
  settings: LeadNormalizationSettings,
): string | null {
  if (value == null) return null;
  if (!settings.stripPhoneFormatting) return cleanText(value, settings);

  const raw = String(value).trim();
  const hasPlus = raw.startsWith('+') || raw.startsWith('00');
  const digits = raw.replace(/\D/g, '');

  if (digits === '') return null;

  // `00` is the international prefix in dialled form; `+` is the stored form.
  const normalized = raw.startsWith('00') ? digits.replace(/^00/, '') : digits;

  return hasPlus ? `+${normalized}` : normalized;
}

/* -------------------------------------------------------------------------- */
/* Whole-record pass                                                           */
/* -------------------------------------------------------------------------- */

export interface RawLeadFields {
  customerName?: string | null;
  phone?: string | null;
  email?: string | null;
  locationText?: string | null;
  siteAddress?: string | null;
  requirementSummary?: string | null;
}

export interface NormalizedLeadFields {
  customerName: string | null;
  phone: string | null;
  email: string | null;
  locationText: string | null;
  siteAddress: string | null;
  requirementSummary: string | null;
}

/**
 * Applies every rule to one inbound record.
 *
 * Note that `requirementSummary` keeps its line breaks: it is free text a human
 * will read, and collapsing it would run a bulleted requirement into one line.
 */
export function normalizeLeadFields(
  raw: RawLeadFields,
  settings: LeadNormalizationSettings,
): NormalizedLeadFields {
  return {
    customerName: normalizeName(raw.customerName, settings),
    phone: stripPhoneFormatting(raw.phone, settings),
    email: normalizeEmail(raw.email, settings),
    locationText: cleanText(raw.locationText, settings),
    siteAddress: cleanText(raw.siteAddress, settings),
    requirementSummary: cleanText(raw.requirementSummary, {
      ...settings,
      collapseSpaces: false,
    }),
  };
}
