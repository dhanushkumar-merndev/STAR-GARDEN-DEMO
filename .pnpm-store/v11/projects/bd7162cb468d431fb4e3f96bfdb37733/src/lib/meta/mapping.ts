/**
 * Meta lead-form field mapping (add-on §6).
 *
 * Pure functions only — no database, no network — so the validation rules and
 * the mapping itself can be unit tested directly, which the add-on's test list
 * asks for in items 3–5.
 *
 * The single most important rule lives here: `MAPPABLE_CRM_FIELDS` does not
 * include call notes, follow-ups, site-visit notes or lead stage. Those are the
 * BDM's own record of a conversation, and no Meta sync may ever write to them.
 */

import type { MetaCrmField, MetaFormQuestion } from '@/types/database';

/** The only destinations a Meta answer may land in. */
export const MAPPABLE_CRM_FIELDS: readonly MetaCrmField[] = [
  'customer_name',
  'mobile',
  'email',
  'location_text',
  'requirement_summary',
  'IGNORE',
];

export const CRM_FIELD_LABELS: Record<MetaCrmField, string> = {
  customer_name: 'Customer name',
  mobile: 'Phone',
  email: 'Email',
  location_text: 'Location',
  requirement_summary: 'Requirement summary',
  IGNORE: 'Ignore this question',
};

/** Destinations that must be mapped before a form can accept leads. */
export const REQUIRED_CRM_FIELDS: readonly MetaCrmField[] = ['customer_name', 'mobile'];

/** Destinations that may appear at most once. `IGNORE` is exempt. */
const SINGLE_USE_FIELDS: readonly MetaCrmField[] = [
  'customer_name',
  'mobile',
  'email',
  'location_text',
  'requirement_summary',
];

export interface MappingEntry {
  metaFieldKey: string;
  metaFieldLabel?: string | null;
  crmField: MetaCrmField;
}

export interface MappingValidationResult {
  valid: boolean;
  /** Keyed by Meta field key, plus `_form` for whole-mapping problems. */
  errors: Record<string, string>;
}

/**
 * Validates a complete mapping for one form.
 *
 * Returns every problem at once rather than the first, so an Admin fixes the
 * form in one pass instead of playing whack-a-mole.
 */
export function validateMapping(entries: MappingEntry[]): MappingValidationResult {
  const errors: Record<string, string> = {};

  if (entries.length === 0) {
    return { valid: false, errors: { _form: 'Map at least the name and phone questions.' } };
  }

  // A Meta question may only appear once — it has one answer.
  const seenKeys = new Set<string>();
  for (const entry of entries) {
    const key = entry.metaFieldKey.trim();

    if (key === '') {
      errors._form = 'A question is missing its Meta field key.';
      continue;
    }

    if (seenKeys.has(key)) {
      errors[key] = 'This Meta question appears more than once.';
    }
    seenKeys.add(key);

    if (!MAPPABLE_CRM_FIELDS.includes(entry.crmField)) {
      errors[key] = `${entry.crmField} is not a CRM destination that Meta may write to.`;
    }
  }

  // Each real destination may be claimed once. Two questions writing to
  // `mobile` would silently discard one answer.
  for (const field of SINGLE_USE_FIELDS) {
    const claimants = entries.filter((entry) => entry.crmField === field);

    if (claimants.length > 1) {
      for (const claimant of claimants) {
        errors[claimant.metaFieldKey] =
          `${CRM_FIELD_LABELS[field]} is mapped ${claimants.length} times. Map it once.`;
      }
    }
  }

  // Required destinations.
  for (const field of REQUIRED_CRM_FIELDS) {
    const mapped = entries.some((entry) => entry.crmField === field);
    if (!mapped) {
      errors._form = errors._form
        ? `${errors._form} ${CRM_FIELD_LABELS[field]} must be mapped.`
        : `${CRM_FIELD_LABELS[field]} must be mapped before this form can accept leads.`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/* -------------------------------------------------------------------------- */
/* Applying a mapping                                                          */
/* -------------------------------------------------------------------------- */

export interface MetaFieldDatum {
  name: string;
  values: string[];
}

export interface MappedLeadFields {
  customerName: string | null;
  mobile: string | null;
  email: string | null;
  locationText: string | null;
  requirementSummary: string | null;
  /** Answers to questions with no active mapping, preserved for context. */
  unmapped: Record<string, string>;
}

/**
 * Projects a Meta submission through a saved mapping.
 *
 * Unmapped answers are not discarded — they are returned separately and the
 * intake service appends them to `requirement_summary`, so a question an Admin
 * forgot to map still reaches the BDM instead of vanishing.
 */
export function applyMapping(
  fieldData: MetaFieldDatum[],
  entries: MappingEntry[],
): MappedLeadFields {
  const byKey = new Map<string, MetaCrmField>();
  for (const entry of entries) {
    byKey.set(normalizeKey(entry.metaFieldKey), entry.crmField);
  }

  const result: MappedLeadFields = {
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

    const destination = byKey.get(normalizeKey(field.name));

    switch (destination) {
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
        // Several questions could legitimately be summarised together if an
        // Admin later relaxes the single-use rule; joining is safer than
        // overwriting.
        result.requirementSummary = result.requirementSummary
          ? `${result.requirementSummary}\n${value}`
          : value;
        break;
      case 'IGNORE':
        break;
      default:
        result.unmapped[field.name] = value;
    }
  }

  return result;
}

/** Meta field names arrive with inconsistent case and spacing across forms. */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Builds the requirement text stored on the lead: the mapped summary first,
 * then anything that had no destination, labelled.
 */
export function composeRequirement(mapped: MappedLeadFields): string | null {
  const extras = Object.entries(mapped.unmapped).map(
    ([key, value]) => `${humanizeFieldName(key)}: ${value}`,
  );

  const parts = [mapped.requirementSummary, extras.length ? extras.join('\n') : null].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length ? parts.join('\n\n') : null;
}

export function humanizeFieldName(name: string): string {
  const spaced = name.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Suggests a destination for each question when an Admin first opens a form.
 *
 * A starting point only — nothing is saved until the Admin confirms it. Being
 * wrong here costs a click; being wrong silently at intake costs a customer.
 */
export function suggestMapping(questions: MetaFormQuestion[]): MappingEntry[] {
  const HINTS: [MetaCrmField, string[]][] = [
    ['customer_name', ['full_name', 'name', 'first_name', 'your_name', 'customer_name']],
    ['mobile', ['phone_number', 'phone', 'mobile', 'mobile_number', 'contact_number', 'whatsapp']],
    ['email', ['email', 'email_address', 'work_email']],
    ['location_text', ['city', 'town', 'location', 'area', 'address', 'street_address', 'pin_code']],
    [
      'requirement_summary',
      ['message', 'requirement', 'comments', 'notes', 'details', 'service', 'looking_for'],
    ],
  ];

  const claimed = new Set<MetaCrmField>();

  return questions.map((question) => {
    const key = normalizeKey(question.key);

    for (const [crmField, needles] of HINTS) {
      if (claimed.has(crmField)) continue;
      if (needles.some((needle) => key === needle || key.includes(needle))) {
        claimed.add(crmField);
        return { metaFieldKey: question.key, metaFieldLabel: question.label, crmField };
      }
    }

    return { metaFieldKey: question.key, metaFieldLabel: question.label, crmField: 'IGNORE' };
  });
}

/** A form can accept leads only when both required destinations are mapped. */
export function isMappingComplete(entries: MappingEntry[]): boolean {
  return REQUIRED_CRM_FIELDS.every((field) => entries.some((entry) => entry.crmField === field));
}
