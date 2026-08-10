/**
 * Database types for the Supabase client.
 *
 * Hand-authored to mirror `supabase/migrations/*.sql` so the app is fully typed
 * before the owner links a live project. Once credentials exist, regenerate the
 * canonical version with:
 *
 *   npm run db:types
 *
 * and keep this file's shape as the reference for what changed.
 */

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];

/* -------------------------------------------------------------------------- */
/* Enums — mirror of 20260810120000_init_enums.sql                             */
/* -------------------------------------------------------------------------- */

export type UserRole = 'ADMIN' | 'BDM' | 'DESIGNER' | 'EXECUTION';

export type LeadSource = 'META_FACEBOOK' | 'META_INSTAGRAM' | 'WEBSITE' | 'MANUAL' | 'OTHER';

export type LeadStatus =
  | 'NEW'
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'CONTACTED'
  | 'FOLLOW_UP'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_COMPLETED'
  | 'QUALIFIED'
  | 'LOST'
  | 'CLOSED';

export type SiteVisitStatus =
  | 'SCHEDULED'
  | 'RESCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type DesignStatus =
  | 'NOT_REQUIRED'
  | 'REQUIRED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'CANCELLED';

export type DesignVersionStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'SUPERSEDED';

export type ExecutionStatus =
  | 'NOT_STARTED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'READY_FOR_REVIEW'
  | 'COMPLETED'
  | 'CANCELLED';

export type ExecutionTaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';

export type FollowUpStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';

export type ActivityType =
  | 'CALL_ATTEMPT'
  | 'CALL_OUTCOME'
  | 'NOTE'
  | 'FOLLOW_UP_CREATED'
  | 'FOLLOW_UP_COMPLETED'
  | 'SITE_VISIT'
  | 'ASSIGNMENT'
  | 'STATUS_CHANGE'
  | 'DESIGN_UPDATE'
  | 'EXECUTION_UPDATE'
  | 'CLOSURE';

export type CallOutcome =
  | 'CONNECTED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'SWITCHED_OFF'
  | 'INVALID_NUMBER'
  | 'CALL_LATER'
  | 'INTERESTED'
  | 'NOT_INTERESTED';

export type FileCategory =
  | 'DESIGN_VERSION'
  | 'DESIGN_SOURCE'
  | 'SITE_VISIT_ATTACHMENT'
  | 'EXECUTION_EVIDENCE'
  | 'COMPLETION_EVIDENCE'
  | 'LEAD_ATTACHMENT';

export type WebhookProcessingStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED';

export type NotificationType =
  | 'LEAD_ASSIGNED'
  | 'LEAD_REASSIGNED'
  | 'FOLLOW_UP_DUE_SOON'
  | 'FOLLOW_UP_OVERDUE'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_RESCHEDULED'
  | 'SITE_VISIT_CANCELLED'
  | 'DESIGNER_ASSIGNED'
  | 'DESIGN_DUE_SOON'
  | 'DESIGN_OVERDUE'
  | 'DESIGN_READY_FOR_REVIEW'
  | 'DESIGN_REVISION_REQUESTED'
  | 'DESIGN_APPROVED'
  | 'EXECUTION_ASSIGNED'
  | 'EXECUTION_TASK_DUE'
  | 'EXECUTION_TASK_OVERDUE'
  | 'EXECUTION_BLOCKED'
  | 'EXECUTION_COMPLETED';

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

export interface ProfileRow {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadRow {
  id: string;
  lead_code: string;
  customer_name: string;
  mobile_country_code: string;
  mobile_normalized: string;
  email: string | null;
  location_text: string | null;
  site_address: string | null;
  requirement_summary: string | null;
  source: LeadSource;
  source_reference: string | null;
  meta_page_id: string | null;
  meta_form_id: string | null;
  meta_lead_id: string | null;
  status: LeadStatus;
  assigned_bdm_id: string | null;
  design_required: boolean;
  next_action_at: string | null;
  last_activity_at: string;
  lost_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadAssignmentHistoryRow {
  id: string;
  lead_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  lead_id: string;
  type: ActivityType;
  outcome: CallOutcome | null;
  notes: string | null;
  next_action: string | null;
  activity_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpRow {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  title: string;
  notes: string | null;
  due_at: string;
  status: FollowUpStatus;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteVisitRow {
  id: string;
  lead_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  map_url: string | null;
  status: SiteVisitStatus;
  check_in_at: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_at: string | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  notes: string | null;
  requirement_summary: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteVisitAttendeeRow {
  id: string;
  site_visit_id: string;
  user_id: string;
  is_required: boolean;
  created_at: string;
}

export interface DesignProjectRow {
  id: string;
  lead_id: string;
  assigned_designer_id: string | null;
  status: DesignStatus;
  requirement_notes: string | null;
  due_at: string | null;
  approved_version_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignVersionRow {
  id: string;
  design_project_id: string;
  version_number: number;
  file_id: string;
  version_note: string | null;
  status: DesignVersionStatus;
  uploaded_by: string | null;
  ready_for_review_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionProjectRow {
  id: string;
  lead_id: string;
  design_project_id: string | null;
  approved_design_version_id: string;
  title: string | null;
  status: ExecutionStatus;
  planned_start_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  progress_percent: number;
  blocker_summary: string | null;
  completion_override_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionAssigneeRow {
  id: string;
  execution_project_id: string;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
}

export interface ExecutionTaskRow {
  id: string;
  execution_project_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  is_mandatory: boolean;
  status: ExecutionTaskStatus;
  blocker_notes: string | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRow {
  id: string;
  category: FileCategory;
  object_key: string;
  original_filename: string;
  safe_filename: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  checksum: string | null;
  lead_id: string | null;
  site_visit_id: string | null;
  design_project_id: string | null;
  execution_project_id: string | null;
  execution_task_id: string | null;
  uploaded_by: string | null;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileAccessLogRow {
  id: string;
  file_id: string;
  user_id: string | null;
  action: 'PREVIEW' | 'DOWNLOAD';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface MetaWebhookEventRow {
  id: string;
  provider_event_id: string;
  page_id: string | null;
  form_id: string | null;
  payload: Json;
  processing_status: WebhookProcessingStatus;
  attempt_count: number;
  last_error: string | null;
  lead_id: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface AppSettingRow {
  key: string;
  value: Json;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface ConfigOptionRow {
  id: string;
  group_key: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExecutionTaskTemplateRow {
  id: string;
  title: string;
  description: string | null;
  is_mandatory: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RateLimitHitRow {
  id: number;
  bucket: string;
  identifier: string;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Table map                                                                   */
/* -------------------------------------------------------------------------- */

/** Columns the database fills in itself are optional on insert. */
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'id' | 'full_name'>;
      leads: Table<LeadRow, 'customer_name' | 'mobile_normalized'>;
      lead_assignment_history: Table<LeadAssignmentHistoryRow, 'lead_id'>;
      activities: Table<ActivityRow, 'lead_id' | 'type'>;
      follow_ups: Table<FollowUpRow, 'lead_id' | 'title' | 'due_at'>;
      site_visits: Table<SiteVisitRow, 'lead_id' | 'scheduled_start_at'>;
      site_visit_attendees: Table<SiteVisitAttendeeRow, 'site_visit_id' | 'user_id'>;
      design_projects: Table<DesignProjectRow, 'lead_id'>;
      design_versions: Table<DesignVersionRow, 'design_project_id' | 'file_id'>;
      execution_projects: Table<ExecutionProjectRow, 'lead_id' | 'approved_design_version_id'>;
      execution_assignees: Table<ExecutionAssigneeRow, 'execution_project_id' | 'user_id'>;
      execution_tasks: Table<ExecutionTaskRow, 'execution_project_id' | 'title'>;
      files: Table<
        FileRow,
        | 'category'
        | 'object_key'
        | 'original_filename'
        | 'safe_filename'
        | 'mime_type'
        | 'extension'
        | 'size_bytes'
      >;
      file_access_logs: Table<FileAccessLogRow, 'file_id' | 'action'>;
      notifications: Table<NotificationRow, 'user_id' | 'type' | 'title'>;
      audit_logs: Table<AuditLogRow, 'action' | 'entity_type'>;
      meta_webhook_events: Table<MetaWebhookEventRow, 'provider_event_id' | 'payload'>;
      app_settings: Table<AppSettingRow, 'key' | 'value'>;
      config_options: Table<ConfigOptionRow, 'group_key' | 'value' | 'label'>;
      execution_task_templates: Table<ExecutionTaskTemplateRow, 'title'>;
      rate_limit_hits: Table<RateLimitHitRow, 'bucket' | 'identifier'>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      user_role: UserRole;
      lead_source: LeadSource;
      lead_status: LeadStatus;
      site_visit_status: SiteVisitStatus;
      design_status: DesignStatus;
      design_version_status: DesignVersionStatus;
      execution_status: ExecutionStatus;
      execution_task_status: ExecutionTaskStatus;
      follow_up_status: FollowUpStatus;
      activity_type: ActivityType;
      call_outcome: CallOutcome;
      file_category: FileCategory;
      webhook_processing_status: WebhookProcessingStatus;
      notification_type: NotificationType;
    };
    CompositeTypes: Record<never, never>;
  };
}
