import { z } from 'zod';
import { AppError } from '@/lib/errors';
import {
  checkboxField,
  dateTimeField,
  futureDateTimeField,
  latitude,
  longitude,
  mobileField,
  optionalDateTimeField,
  optionalEmail,
  optionalHttpUrl,
  optionalText,
  requiredText,
  uuid,
  zodFieldErrors,
} from './common';

/**
 * Domain input schemas. One definition per operation, imported by both the
 * form and the Server Action that receives it (§15).
 */

/* -------------------------------------------------------------------------- */
/* Enum mirrors                                                                */
/* -------------------------------------------------------------------------- */

export const leadSourceSchema = z.enum([
  'META_FACEBOOK',
  'META_INSTAGRAM',
  'WEBSITE',
  'MANUAL',
  'OTHER',
]);

export const leadStatusSchema = z.enum([
  'NEW',
  'UNASSIGNED',
  'ASSIGNED',
  'CONTACTED',
  'FOLLOW_UP',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETED',
  'QUALIFIED',
  'LOST',
  'CLOSED',
]);

export const callOutcomeSchema = z.enum([
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'SWITCHED_OFF',
  'INVALID_NUMBER',
  'CALL_LATER',
  'INTERESTED',
  'NOT_INTERESTED',
]);

export const userRoleSchema = z.enum(['ADMIN', 'BDM', 'DESIGNER', 'EXECUTION']);

export const fileCategorySchema = z.enum([
  'DESIGN_VERSION',
  'DESIGN_SOURCE',
  'SITE_VISIT_ATTACHMENT',
  'EXECUTION_EVIDENCE',
  'COMPLETION_EVIDENCE',
  'LEAD_ATTACHMENT',
]);

export const executionTaskStatusSchema = z.enum([
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED',
]);

export const executionStatusSchema = z.enum([
  'NOT_STARTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'BLOCKED',
  'READY_FOR_REVIEW',
  'COMPLETED',
  'CANCELLED',
]);

export const siteVisitStatusSchema = z.enum([
  'SCHEDULED',
  'RESCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

/* -------------------------------------------------------------------------- */
/* Leads                                                                       */
/* -------------------------------------------------------------------------- */

export const createLeadSchema = z.object({
  customer_name: requiredText('Customer name', 160),
  mobile: mobileField,
  email: optionalEmail,
  location_text: optionalText(200),
  site_address: optionalText(500),
  requirement_summary: optionalText(2000),
  source: leadSourceSchema.default('MANUAL'),
  source_reference: optionalText(200),
  assigned_bdm_id: uuid.optional().or(z.literal('').transform(() => undefined)),
  next_action_at: optionalDateTimeField,
  /** Set when the user has seen the duplicate warning and chosen to continue. */
  confirm_duplicate: checkboxField.optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  lead_id: uuid,
  customer_name: requiredText('Customer name', 160),
  mobile: mobileField,
  email: optionalEmail,
  location_text: optionalText(200),
  site_address: optionalText(500),
  requirement_summary: optionalText(2000),
  next_action_at: optionalDateTimeField,
});

export const assignLeadSchema = z.object({
  lead_id: uuid,
  to_user_id: uuid,
  reason: optionalText(300),
});

export const changeLeadStatusSchema = z.object({
  lead_id: uuid,
  status: leadStatusSchema,
  lost_reason: optionalText(300),
  note: optionalText(1000),
});

export const setDesignRequiredSchema = z.object({
  lead_id: uuid,
  design_required: checkboxField,
  requirement_notes: optionalText(2000),
});

/* -------------------------------------------------------------------------- */
/* Call activity (§6.2)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every field here is reported by the BDM. The CRM records what it is told and
 * claims nothing about connection state, duration or recording (§6.3).
 */
export const logCallSchema = z
  .object({
    lead_id: uuid,
    outcome: callOutcomeSchema,
    notes: optionalText(2000),
    next_action: optionalText(300),
    follow_up_at: optionalDateTimeField,
    preferred_site_visit_at: optionalDateTimeField,
    new_status: leadStatusSchema.optional().or(z.literal('').transform(() => undefined)),
    lost_reason: optionalText(300),
  })
  .superRefine((value, ctx) => {
    // "Call later" without a date leaves the lead with no next action, which
    // §8.2 explicitly flags as a failure state.
    if (value.outcome === 'CALL_LATER' && !value.follow_up_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['follow_up_at'],
        message: 'Pick when to call back.',
      });
    }
    if (value.new_status === 'LOST' && !value.lost_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lost_reason'],
        message: 'Give a reason for marking this lead lost.',
      });
    }
  });

/** Records that the dialler was opened. Not proof of a connected call (§6.3). */
export const recordCallAttemptSchema = z.object({ lead_id: uuid });

export const addNoteSchema = z.object({
  lead_id: uuid,
  notes: requiredText('Note', 2000),
});

/* -------------------------------------------------------------------------- */
/* Follow-ups                                                                  */
/* -------------------------------------------------------------------------- */

export const createFollowUpSchema = z.object({
  lead_id: uuid,
  title: requiredText('Title', 200),
  notes: optionalText(1000),
  due_at: futureDateTimeField,
  assigned_to: uuid.optional().or(z.literal('').transform(() => undefined)),
});

export const completeFollowUpSchema = z.object({
  follow_up_id: uuid,
  notes: optionalText(1000),
});

export const cancelFollowUpSchema = z.object({
  follow_up_id: uuid,
  reason: optionalText(300),
});

/* -------------------------------------------------------------------------- */
/* Site visits (§8.3)                                                          */
/* -------------------------------------------------------------------------- */

export const scheduleSiteVisitSchema = z.object({
  lead_id: uuid,
  scheduled_start_at: dateTimeField,
  scheduled_end_at: optionalDateTimeField,
  address: requiredText('Site address', 500),
  map_url: optionalHttpUrl,
  notes: optionalText(2000),
  designer_id: uuid.optional().or(z.literal('').transform(() => undefined)),
});

export const rescheduleSiteVisitSchema = z.object({
  site_visit_id: uuid,
  scheduled_start_at: dateTimeField,
  scheduled_end_at: optionalDateTimeField,
  reason: optionalText(300),
});

export const cancelSiteVisitSchema = z.object({
  site_visit_id: uuid,
  cancellation_reason: requiredText('Reason', 300),
});

/**
 * Coordinates are optional on purpose. The browser prompt may be declined, and
 * a declined prompt must still allow the check-in to proceed (§8.3, §18).
 */
export const checkInSchema = z.object({
  site_visit_id: uuid,
  latitude,
  longitude,
});

export const checkOutSchema = z.object({
  site_visit_id: uuid,
  latitude,
  longitude,
  notes: optionalText(2000),
  requirement_summary: optionalText(2000),
});

export const completeSiteVisitSchema = z.object({
  site_visit_id: uuid,
  notes: requiredText('Visit notes', 2000),
  requirement_summary: optionalText(2000),
  design_required: checkboxField,
});

/* -------------------------------------------------------------------------- */
/* Design (§8.4)                                                               */
/* -------------------------------------------------------------------------- */

export const assignDesignerSchema = z.object({
  lead_id: uuid,
  designer_id: uuid,
  requirement_notes: optionalText(2000),
  due_at: optionalDateTimeField,
});

export const markVersionReadySchema = z.object({
  design_version_id: uuid,
  version_note: optionalText(1000),
});

export const requestRevisionSchema = z.object({
  design_version_id: uuid,
  revision_notes: requiredText('Revision notes', 2000),
});

export const approveVersionSchema = z.object({
  design_version_id: uuid,
  note: optionalText(1000),
});

/* -------------------------------------------------------------------------- */
/* Execution (§8.5)                                                            */
/* -------------------------------------------------------------------------- */

export const createExecutionProjectSchema = z.object({
  lead_id: uuid,
  approved_design_version_id: uuid,
  title: optionalText(200),
  planned_start_at: optionalDateTimeField,
  due_at: optionalDateTimeField,
  assignee_ids: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (!v) return [] as string[];
      return (Array.isArray(v) ? v : [v]).filter(Boolean);
    })
    .pipe(z.array(uuid)),
  use_template: checkboxField.optional(),
});

export const updateExecutionStatusSchema = z.object({
  execution_project_id: uuid,
  status: executionStatusSchema,
  blocker_summary: optionalText(1000),
  completion_override_reason: optionalText(1000),
});

export const upsertExecutionTaskSchema = z.object({
  execution_project_id: uuid,
  task_id: uuid.optional().or(z.literal('').transform(() => undefined)),
  title: requiredText('Task title', 200),
  description: optionalText(1000),
  assigned_to: uuid.optional().or(z.literal('').transform(() => undefined)),
  is_mandatory: checkboxField,
  due_at: optionalDateTimeField,
});

export const updateTaskStatusSchema = z.object({
  task_id: uuid,
  status: executionTaskStatusSchema,
  blocker_notes: optionalText(1000),
});

/* -------------------------------------------------------------------------- */
/* Files (§4.4)                                                                */
/* -------------------------------------------------------------------------- */

export const presignUploadSchema = z
  .object({
    filename: requiredText('Filename', 255),
    mime_type: z.string().max(200).default(''),
    size_bytes: z.coerce.number().int().positive('The file is empty.'),
    category: fileCategorySchema,
    lead_id: uuid.optional(),
    site_visit_id: uuid.optional(),
    design_project_id: uuid.optional(),
    execution_project_id: uuid.optional(),
    execution_task_id: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    const hasParent =
      value.lead_id ||
      value.site_visit_id ||
      value.design_project_id ||
      value.execution_project_id ||
      value.execution_task_id;
    if (!hasParent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An upload must belong to a lead, visit, design or execution record.',
      });
    }
  });

export const finalizeUploadSchema = z.object({
  upload_token: z.string().min(1),
  checksum: z.string().max(200).optional(),
  version_note: optionalText(1000),
});

export const archiveFileSchema = z.object({
  file_id: uuid,
  reason: optionalText(300),
});

/* -------------------------------------------------------------------------- */
/* Public enquiry (§11.8)                                                      */
/* -------------------------------------------------------------------------- */

export const publicEnquirySchema = z.object({
  name: requiredText('Name', 160),
  mobile: mobileField,
  email: optionalEmail,
  city: optionalText(120),
  message: optionalText(2000),
  service: optionalText(120),
  /** Anti-spam honeypot: real users never fill a hidden field (§15). */
  company_website: z.string().optional(),
  /** Cloudflare Turnstile token, when a site key is configured. */
  turnstile_token: z.string().optional(),
  consent: checkboxField.optional(),
});

/* -------------------------------------------------------------------------- */
/* Admin (§11.7)                                                               */
/* -------------------------------------------------------------------------- */

export const inviteStaffSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required.')
    .email('Enter the Google account email.')
    .transform((v) => v.trim().toLowerCase()),
  full_name: requiredText('Full name', 120),
  mobile: optionalText(20),
  role: userRoleSchema,
});

export const updateUserSchema = z.object({
  user_id: uuid,
  full_name: requiredText('Full name', 120),
  mobile: optionalText(20),
  role: userRoleSchema,
  is_active: checkboxField,
});

export const updateSettingSchema = z.object({
  key: requiredText('Key', 100),
  value: requiredText('Value', 2000),
});

export const upsertConfigOptionSchema = z.object({
  id: uuid.optional().or(z.literal('').transform(() => undefined)),
  group_key: requiredText('Group', 80),
  value: requiredText('Value', 80),
  label: requiredText('Label', 160),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: checkboxField,
});

export const notificationReadSchema = z.object({
  notification_id: uuid.optional(),
  all: checkboxField.optional(),
});

/* -------------------------------------------------------------------------- */
/* Parsing helper                                                              */
/* -------------------------------------------------------------------------- */

/** Parses input, converting a Zod failure into a field-keyed AppError. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = zodFieldErrors(result.error);
    throw new AppError('VALIDATION', Object.values(fields)[0] ?? 'Check the highlighted fields.', {
      fields,
    });
  }
  return result.data;
}
