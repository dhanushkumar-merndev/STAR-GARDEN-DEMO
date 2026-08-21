import 'server-only';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import type { Json } from '@/types/database';

/**
 * Audit trail (AGENTS.md §17).
 *
 * Written with the service-role client because `audit_logs` has no INSERT
 * policy at all: the trail must be append-only and un-forgeable from a browser
 * session. Every caller has already passed its own authorization check — this
 * is the record of a decision already made, never the decision itself (§7.5).
 *
 * Auditing never fails an operation. A lead that saved but was not logged is
 * bad; a lead that refused to save because logging hiccuped is worse.
 */

export const AuditAction = {
  USER_INVITED: 'user.invited',
  USER_INVITE_REVOKED: 'user.invite_revoked',
  USER_UPDATED: 'user.updated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_REACTIVATED: 'user.reactivated',
  USER_ARCHIVED: 'user.archived',
  USER_UNARCHIVED: 'user.unarchived',

  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_REASSIGNED: 'lead.reassigned',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_DUPLICATE_BLOCKED: 'lead.duplicate_blocked',

  CALL_ATTEMPT_RECORDED: 'call.attempt_recorded',
  CALL_OUTCOME_RECORDED: 'call.outcome_recorded',
  NOTE_ADDED: 'note.added',

  FOLLOW_UP_CREATED: 'follow_up.created',
  FOLLOW_UP_RESCHEDULED: 'follow_up.rescheduled',
  FOLLOW_UP_COMPLETED: 'follow_up.completed',
  FOLLOW_UP_CANCELLED: 'follow_up.cancelled',

  SITE_VISIT_SCHEDULED: 'site_visit.scheduled',
  SITE_VISIT_RESCHEDULED: 'site_visit.rescheduled',
  SITE_VISIT_CHECKED_IN: 'site_visit.checked_in',
  SITE_VISIT_CHECKED_OUT: 'site_visit.checked_out',
  SITE_VISIT_COMPLETED: 'site_visit.completed',
  SITE_VISIT_CANCELLED: 'site_visit.cancelled',

  DESIGNER_ASSIGNED: 'design.designer_assigned',
  DESIGN_VERSION_UPLOADED: 'design.version_uploaded',
  DESIGN_VERSION_READY: 'design.version_ready_for_review',
  DESIGN_REVISION_REQUESTED: 'design.revision_requested',
  DESIGN_VERSION_APPROVED: 'design.version_approved',

  EXECUTION_PROJECT_CREATED: 'execution.project_created',
  EXECUTION_PROJECT_ASSIGNED: 'execution.project_assigned',
  EXECUTION_STATUS_CHANGED: 'execution.status_changed',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_TASK_CREATED: 'execution.task_created',
  EXECUTION_TASK_UPDATED: 'execution.task_updated',
  EXECUTION_TASK_COMPLETED: 'execution.task_completed',

  FILE_UPLOADED: 'file.uploaded',
  FILE_PREVIEWED: 'file.previewed',
  FILE_DOWNLOADED: 'file.downloaded',
  FILE_ARCHIVED: 'file.archived',

  EXPORT_GENERATED: 'export.generated',

  // Meta integration (add-on §20).
  META_LEAD_RECEIVED: 'meta.lead_received',
  META_LEAD_FAILED: 'meta.lead_failed',
  META_SYNC_MANUAL_TRIGGERED: 'META_SYNC_MANUAL_TRIGGERED',
  META_MAPPING_CREATED: 'META_MAPPING_CREATED',
  META_MAPPING_UPDATED: 'META_MAPPING_UPDATED',
  META_MAPPING_DISABLED: 'META_MAPPING_DISABLED',
  META_WEBHOOK_PROCESSED: 'META_WEBHOOK_PROCESSED',
  META_WEBHOOK_FAILED: 'META_WEBHOOK_FAILED',
  META_WEBHOOK_UNMAPPED: 'META_WEBHOOK_UNMAPPED_FORM',
  LEAD_META_ATTRIBUTION_CREATED: 'LEAD_META_ATTRIBUTION_CREATED',

  // User management (add-on §20). The legacy lowercase names above remain for
  // the events that predate the add-on, so existing history stays queryable.
  USER_CREATED: 'USER_CREATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DEACTIVATED_V2: 'USER_DEACTIVATED',
  USER_REACTIVATED_V2: 'USER_REACTIVATED',

  EMAIL_TEST_SENT: 'email.test_sent',
  WEBSITE_ENQUIRY_RECEIVED: 'website.enquiry_received',
  SETTING_UPDATED: 'setting.updated',

  // Site visit journey (operations brief). Two taps, two records.
  SITE_VISIT_JOURNEY_STARTED: 'site_visit.journey_started',
  SITE_VISIT_ARRIVED: 'site_visit.arrived',
  SITE_VISIT_DESIGNER_ASSIGNED: 'site_visit.designer_assigned',

  // Accounts.
  ACCOUNT_RECORDED: 'account.recorded',
  ACCOUNT_CLOSED: 'account.closed',
  ACCOUNT_EXPORTED: 'account.exported',

  // Customer portal.
  PORTAL_ACCESS_GRANTED: 'portal.access_granted',
  PORTAL_ACCESS_REVOKED: 'portal.access_revoked',
  PORTAL_STATUS_EMAILED: 'portal.status_emailed',

  // Lead disposition — the interested / not interested / follow-up decision.
  LEAD_DISPOSITION_RECORDED: 'lead.disposition_recorded',

  // Meta selection.
  META_AD_ACCOUNT_SELECTED: 'META_AD_ACCOUNT_SELECTED',
  META_CAMPAIGN_SELECTION_CHANGED: 'META_CAMPAIGN_SELECTION_CHANGED',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  actorUserId: string | null;
  action: AuditActionValue | string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Skip request-header capture for headless callers (cron, webhook). */
  captureRequest?: boolean;
}

/** Fields that must never reach the audit table (§15). */
const REDACTED_KEYS = new Set([
  'password',
  'access_token',
  'refresh_token',
  'service_role_key',
  'secret',
  'authorization',
  'turnstile_token',
  'upload_token',
]);

/**
 * Strips secrets and trims oversized payloads before they are persisted.
 * `before`/`after` snapshots are for reconstructing a decision, not for storing
 * a second copy of every attachment.
 */
function sanitize(value: unknown, depth = 0): Json | null {
  if (value === null || value === undefined) return null;
  if (depth > 4) return '[truncated]';

  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitize(v, depth + 1)) as Json;
  }

  if (typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        out[key] = '[redacted]';
        continue;
      }
      const clean = sanitize(v, depth + 1);
      if (clean !== null) out[key] = clean;
    }
    return out;
  }

  return String(value);
}

async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
    return { ip, userAgent: h.get('user-agent')?.slice(0, 500) ?? null };
  } catch {
    // Outside a request scope (cron, background work).
    return { ip: null, userAgent: null };
  }
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const { ip, userAgent } =
      entry.captureRequest === false
        ? { ip: null, userAgent: null }
        : await requestContext();

    const admin = createAdminClient();

    await admin.from('audit_logs').insert({
      actor_user_id: entry.actorUserId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before_data: entry.before === undefined ? null : sanitize(entry.before),
      after_data: entry.after === undefined ? null : sanitize(entry.after),
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error('[audit] failed to record entry', { action: entry.action, error });
  }
}

/**
 * Records a sensitive file read in both the audit trail and the dedicated
 * access log (§4.4 step 9).
 *
 * A BDM downloading an approved design and sending it to the customer by hand
 * is the documented flow (§5.5). The CRM records that the file left the system;
 * it cannot know what happened afterwards.
 */
export async function recordFileAccess(params: {
  fileId: string;
  userId: string;
  action: 'PREVIEW' | 'DOWNLOAD';
  fileName: string;
  isApprovedVersion?: boolean;
}): Promise<void> {
  const { ip, userAgent } = await requestContext();

  try {
    const admin = createAdminClient();
    await admin.from('file_access_logs').insert({
      file_id: params.fileId,
      user_id: params.userId,
      action: params.action,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error('[audit] failed to record file access', error);
  }

  await recordAudit({
    actorUserId: params.userId,
    action: params.action === 'DOWNLOAD' ? AuditAction.FILE_DOWNLOADED : AuditAction.FILE_PREVIEWED,
    entityType: 'file',
    entityId: params.fileId,
    after: {
      filename: params.fileName,
      is_approved_version: params.isApprovedVersion ?? null,
    },
  });
}
