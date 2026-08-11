import { z } from 'zod';
import { normalizeMobile, PhoneNormalizationError } from '@/lib/utils/phone';

/**
 * Shared Zod primitives (AGENTS.md §15: "Validate input using shared Zod
 * schemas"). Client forms and server actions import the *same* schema, so the
 * browser can never submit a shape the server has not agreed to.
 */

export const uuid = z.string().uuid('Not a valid identifier.');

export const trimmed = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max, `Keep this under ${max} characters.`));

/** Optional free text: empty string and whitespace both become undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : undefined;
    })
    .pipe(z.string().max(max, `Keep this under ${max} characters.`).optional());

export const requiredText = (label: string, max = 200) =>
  z
    .string({ required_error: `${label} is required.` })
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, `${label} is required.`)
        .max(max, `${label} must be under ${max} characters.`),
    );

/**
 * Mobile input. Parses to the normalized split form the database stores, so a
 * caller can never persist an unnormalized number by accident (§8.1).
 */
export const mobileField = z
  .string({ required_error: 'Mobile number is required.' })
  .superRefine((value, ctx) => {
    try {
      normalizeMobile(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof PhoneNormalizationError
            ? error.message
            : 'Enter a valid mobile number.',
      });
    }
  })
  .transform((value) => normalizeMobile(value));

export const optionalEmail = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim().toLowerCase();
    return t ? t : undefined;
  })
  .pipe(z.string().email('Enter a valid email address.').optional());

/** Optional browser-safe URL. Active schemes such as javascript: are rejected. */
export const optionalHttpUrl = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)
  .pipe(
    z
      .string()
      .url('Enter a valid link.')
      .max(500, 'Keep this under 500 characters.')
      .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), {
        message: 'Use an https:// or http:// link.',
      })
      .optional(),
  );

/** `datetime-local` inputs submit "2026-08-10T16:30" with no zone. */
export const dateTimeField = z
  .string()
  .min(1, 'Pick a date and time.')
  .transform((value, ctx) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick a valid date and time.' });
      return z.NEVER;
    }
    return date.toISOString();
  });

export const optionalDateTimeField = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value || value.trim() === '') return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick a valid date and time.' });
      return z.NEVER;
    }
    return date.toISOString();
  });

export const futureDateTimeField = dateTimeField.superRefine((iso, ctx) => {
  if (new Date(iso).getTime() < Date.now() - 60_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick a time in the future.' });
  }
});

/**
 * One-time, visit-scoped coordinates. Optional by construction: §8.3 and §18
 * forbid collecting location unless the user has actively shared it.
 */
export const latitude = z.coerce.number().min(-90).max(90).optional();
export const longitude = z.coerce.number().min(-180).max(180).optional();

export const checkboxField = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.boolean(), z.undefined()])
  .transform((v) => v === 'on' || v === 'true' || v === true);

/** Parses a FormData into a plain object Zod can consume. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }
  return result;
}

/** Flattens Zod issues into the `fields` shape AppError carries. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
