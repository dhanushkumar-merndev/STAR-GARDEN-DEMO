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

/**
 * BDM is retained even though the two Admins currently do the calling
 * themselves — a dedicated BDM/BDO is expected later and splitting the role out
 * then must not need a data migration.
 *
 * CLIENT is the customer's own read-only login and is deliberately NOT a staff
 * role: `app.is_active_user()` excludes it, so it inherits no staff policy.
 */
export type UserRole = 'ADMIN' | 'BDM' | 'DESIGNER' | 'EXECUTION' | 'CLIENT';

/** Staff roles only — the set that may reach any part of the CRM proper. */
export const STAFF_ROLES = ['ADMIN', 'BDM', 'DESIGNER', 'EXECUTION'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const isStaffRole = (role: UserRole): role is StaffRole => role !== 'CLIENT';

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
  | 'CLOSURE'
  | 'ACCOUNT_UPDATE'
  | 'PORTAL_ACCESS';

/** Money on a finished job. WRITTEN_OFF leaves receivables without pretending payment. */
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF';

/** Three user-pressed steps. Nothing is sampled between them. */
export type VisitJourneyStatus = 'NOT_STARTED' | 'EN_ROUTE' | 'ARRIVED';

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

export type WebhookProcessingStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PROCESSED'
  /** Arrived from a form with no active field mapping. Retryable, never lost. */
  | 'UNMAPPED_FORM'
  | 'FAILED'
  | 'IGNORED';

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
  | 'EXECUTION_COMPLETED'
  | 'ROLE_ASSIGNED'
  | 'ACCOUNT_RECORDED'
  | 'ACCOUNT_CLOSED'
  | 'CLIENT_PORTAL_INVITED'
  | 'SITE_VISIT_STARTED'
  | 'SITE_VISIT_ARRIVED';

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

export type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  approved_at: string | null;
  approved_by: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Allowlist of Google addresses permitted to sign in (migration 06). */
export type StaffInviteRow = {
  id: string;
  email: string;
  full_name: string;
  mobile: string | null;
  role: UserRole;
  accepted_at: string | null;
  accepted_by: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadRow = {
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
  meta_campaign_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_id: string | null;
  meta_adset_name: string | null;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
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

export type LeadAssignmentHistoryRow = {
  id: string;
  lead_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

export type ActivityRow = {
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

export type FollowUpRow = {
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

export type SiteVisitRow = {
  id: string;
  lead_id: string;
  /** The landscape designer who attends — and who then owns the design. */
  assigned_designer_id: string | null;
  journey_status: VisitJourneyStatus;
  journey_started_at: string | null;
  journey_start_latitude: number | null;
  journey_start_longitude: number | null;
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

export type SiteVisitAttendeeRow = {
  id: string;
  site_visit_id: string;
  user_id: string;
  is_required: boolean;
  created_at: string;
}

export type DesignProjectRow = {
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

export type DesignVersionRow = {
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

export type ExecutionProjectRow = {
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

export type ExecutionAssigneeRow = {
  id: string;
  execution_project_id: string;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
}

export type ExecutionTaskRow = {
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

/** The commercial record for one lead. Exactly one row per lead. */
export type LeadAccountRow = {
  id: string;
  lead_id: string;
  total_amount: number;
  received_amount: number;
  /** Generated in the database, never written by the app. */
  balance_amount: number;
  currency: string;
  payment_status: PaymentStatus;
  invoice_number: string | null;
  invoiced_at: string | null;
  notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Grants one customer email a read-only view of one job. */
export type LeadPortalAccessRow = {
  id: string;
  lead_id: string;
  email: string;
  is_primary: boolean;
  invited_at: string | null;
  invited_by: string | null;
  last_viewed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FileRow = {
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

export type FileAccessLogRow = {
  id: string;
  file_id: string;
  user_id: string | null;
  action: 'PREVIEW' | 'DOWNLOAD';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type NotificationRow = {
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

export type AuditLogRow = {
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

export type MetaWebhookEventRow = {
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
  form_name: string | null;
  last_attempt_at: string | null;
  created_at: string;
}

export type AppSettingRow = {
  key: string;
  value: Json;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type ConfigOptionRow = {
  id: string;
  group_key: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ExecutionTaskTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  is_mandatory: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Meta integration — mirror of 20260810120700 / 20260810120900               */
/* -------------------------------------------------------------------------- */

/** Where a Meta lead-form answer lands. Never call notes or follow-ups. */
export type MetaCrmField =
  | 'customer_name'
  | 'mobile'
  | 'email'
  | 'location_text'
  | 'requirement_summary'
  | 'IGNORE';

export type MetaSyncType = 'CAMPAIGNS' | 'INSIGHTS' | 'WEBHOOK_REPLAY';
export type MetaSyncStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
export type MetaSyncTrigger = 'CRON' | 'ADMIN_MANUAL';
export type MetaAssociationSource = 'ADS_GRAPH' | 'WEBHOOK' | 'MANUAL';

/** An ad account the configured Meta token can reach. */
export type MetaAdAccountRow = {
  id: string;
  meta_ad_account_id: string;
  name: string;
  currency: string | null;
  timezone_name: string | null;
  business_name: string | null;
  /** Meta's own code; 1 means ACTIVE. Stored untranslated on purpose. */
  account_status: number | null;
  is_present_in_latest_sync: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MetaCampaignRow = {
  id: string;
  meta_campaign_id: string;
  meta_ad_account_id: string | null;
  name: string;
  configured_status: string | null;
  effective_status: string | null;
  objective: string | null;
  /** Admin's choice of which campaigns feed the CRM. */
  is_selected: boolean;
  is_present_in_latest_sync: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One question on a Meta lead form, as cached on `meta_lead_forms.questions`. */
export type MetaFormQuestion = {
  key: string;
  label: string;
  type?: string;
};

export type MetaLeadFormRow = {
  id: string;
  meta_form_id: string;
  meta_page_id: string | null;
  name: string;
  status: string | null;
  questions: Json;
  /** Null means the mapping is auto-suggested but never confirmed by a human. */
  mapping_reviewed_at: string | null;
  mapping_reviewed_by: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MetaCampaignFormRow = {
  id: string;
  campaign_id: string;
  form_id: string;
  association_source: MetaAssociationSource;
  first_seen_at: string;
  last_seen_at: string;
};

export type MetaFieldMappingRow = {
  id: string;
  meta_form_id: string;
  meta_field_key: string;
  meta_field_label: string | null;
  crm_field: MetaCrmField;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MetaCampaignDailyInsightRow = {
  id: string;
  meta_campaign_id: string;
  insight_date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  /** Null when there were no leads — never zero, never infinity. */
  cost_per_lead: number | null;
  last_synced_at: string;
  created_at: string;
};

export type MetaSyncRunRow = {
  id: string;
  sync_type: MetaSyncType;
  status: MetaSyncStatus;
  trigger_type: MetaSyncTrigger;
  triggered_by: string | null;
  started_at: string;
  completed_at: string | null;
  records_received: number;
  records_created: number;
  records_updated: number;
  error_summary: string | null;
};

export type EmailLogStatus = 'PENDING' | 'SENT' | 'FAILED';

/** Delivery record for outbound email. Never holds credentials or bodies. */
export type EmailLogRow = {
  id: string;
  recipient: string;
  email_type: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  subject: string;
  status: EmailLogStatus;
  provider_message_id: string | null;
  error_summary: string | null;
  sent_at: string | null;
  created_at: string;
};

export type RateLimitHitRow = {
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

/**
 * One foreign key, in the shape PostgREST's type resolver expects.
 *
 * These are what make `select('*, owner:profiles!leads_assigned_bdm_id_fkey(...)')`
 * resolve to a real type instead of an error. Each entry mirrors a constraint
 * in `supabase/migrations/*.sql`; `npm run db:types` regenerates the canonical
 * version once the project is linked.
 */
type Rel<
  Name extends string,
  Columns extends string[],
  Referenced extends string,
  ReferencedColumns extends string[],
> = {
  foreignKeyName: Name;
  columns: Columns;
  isOneToOne: false;
  referencedRelation: Referenced;
  referencedColumns: ReferencedColumns;
};

/** Shorthand for the overwhelmingly common `<col> -> profiles.id` case. */
type ProfileRel<Name extends string, Column extends string> = Rel<
  Name,
  [Column],
  'profiles',
  ['id']
>;

/** Shorthand for `<col> -> leads.id`. */
type LeadRel<Name extends string, Column extends string> = Rel<Name, [Column], 'leads', ['id']>;

type Table<
  Row,
  Required extends keyof Row,
  Relationships extends {
    foreignKeyName: string;
    columns: string[];
    isOneToOne: false;
    referencedRelation: string;
    referencedColumns: string[];
  }[] = [],
> = {
  Row: Row;
  Insert: Insertable<Row, Required>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        'id' | 'full_name',
        [ProfileRel<'profiles_approved_by_fkey', 'approved_by'>]
      >;

      staff_invites: Table<
        StaffInviteRow,
        'email' | 'full_name',
        [
          ProfileRel<'staff_invites_accepted_by_fkey', 'accepted_by'>,
          ProfileRel<'staff_invites_invited_by_fkey', 'invited_by'>,
        ]
      >;

      leads: Table<
        LeadRow,
        'customer_name' | 'mobile_normalized',
        [
          ProfileRel<'leads_assigned_bdm_id_fkey', 'assigned_bdm_id'>,
          ProfileRel<'leads_created_by_fkey', 'created_by'>,
        ]
      >;

      lead_assignment_history: Table<
        LeadAssignmentHistoryRow,
        'lead_id',
        [
          LeadRel<'lead_assignment_history_lead_id_fkey', 'lead_id'>,
          ProfileRel<'lead_assignment_history_from_user_id_fkey', 'from_user_id'>,
          ProfileRel<'lead_assignment_history_to_user_id_fkey', 'to_user_id'>,
          ProfileRel<'lead_assignment_history_changed_by_fkey', 'changed_by'>,
        ]
      >;

      activities: Table<
        ActivityRow,
        'lead_id' | 'type',
        [
          LeadRel<'activities_lead_id_fkey', 'lead_id'>,
          ProfileRel<'activities_created_by_fkey', 'created_by'>,
        ]
      >;

      follow_ups: Table<
        FollowUpRow,
        'lead_id' | 'title' | 'due_at',
        [
          LeadRel<'follow_ups_lead_id_fkey', 'lead_id'>,
          ProfileRel<'follow_ups_assigned_to_fkey', 'assigned_to'>,
          ProfileRel<'follow_ups_completed_by_fkey', 'completed_by'>,
          ProfileRel<'follow_ups_created_by_fkey', 'created_by'>,
        ]
      >;

      site_visits: Table<
        SiteVisitRow,
        'lead_id' | 'scheduled_start_at',
        [
          LeadRel<'site_visits_lead_id_fkey', 'lead_id'>,
          ProfileRel<'site_visits_assigned_designer_id_fkey', 'assigned_designer_id'>,
          ProfileRel<'site_visits_created_by_fkey', 'created_by'>,
        ]
      >;

      lead_accounts: Table<
        LeadAccountRow,
        'lead_id',
        [
          LeadRel<'lead_accounts_lead_id_fkey', 'lead_id'>,
          ProfileRel<'lead_accounts_recorded_by_fkey', 'recorded_by'>,
          ProfileRel<'lead_accounts_closed_by_fkey', 'closed_by'>,
        ]
      >;

      lead_portal_access: Table<
        LeadPortalAccessRow,
        'lead_id' | 'email',
        [
          LeadRel<'lead_portal_access_lead_id_fkey', 'lead_id'>,
          ProfileRel<'lead_portal_access_invited_by_fkey', 'invited_by'>,
        ]
      >;

      site_visit_attendees: Table<
        SiteVisitAttendeeRow,
        'site_visit_id' | 'user_id',
        [
          Rel<'site_visit_attendees_site_visit_id_fkey', ['site_visit_id'], 'site_visits', ['id']>,
          ProfileRel<'site_visit_attendees_user_id_fkey', 'user_id'>,
        ]
      >;

      design_projects: Table<
        DesignProjectRow,
        'lead_id',
        [
          LeadRel<'design_projects_lead_id_fkey', 'lead_id'>,
          ProfileRel<'design_projects_assigned_designer_id_fkey', 'assigned_designer_id'>,
          ProfileRel<'design_projects_approved_by_fkey', 'approved_by'>,
          ProfileRel<'design_projects_created_by_fkey', 'created_by'>,
          Rel<
            'design_projects_approved_version_fkey',
            ['approved_version_id'],
            'design_versions',
            ['id']
          >,
        ]
      >;

      design_versions: Table<
        DesignVersionRow,
        'design_project_id' | 'file_id',
        [
          Rel<
            'design_versions_design_project_id_fkey',
            ['design_project_id'],
            'design_projects',
            ['id']
          >,
          Rel<'design_versions_file_fkey', ['file_id'], 'files', ['id']>,
          ProfileRel<'design_versions_uploaded_by_fkey', 'uploaded_by'>,
          ProfileRel<'design_versions_reviewed_by_fkey', 'reviewed_by'>,
        ]
      >;

      execution_projects: Table<
        ExecutionProjectRow,
        'lead_id' | 'approved_design_version_id',
        [
          LeadRel<'execution_projects_lead_id_fkey', 'lead_id'>,
          Rel<
            'execution_projects_design_project_id_fkey',
            ['design_project_id'],
            'design_projects',
            ['id']
          >,
          Rel<
            'execution_projects_approved_design_version_id_fkey',
            ['approved_design_version_id'],
            'design_versions',
            ['id']
          >,
          ProfileRel<'execution_projects_created_by_fkey', 'created_by'>,
        ]
      >;

      execution_assignees: Table<
        ExecutionAssigneeRow,
        'execution_project_id' | 'user_id',
        [
          Rel<
            'execution_assignees_execution_project_id_fkey',
            ['execution_project_id'],
            'execution_projects',
            ['id']
          >,
          ProfileRel<'execution_assignees_user_id_fkey', 'user_id'>,
          ProfileRel<'execution_assignees_assigned_by_fkey', 'assigned_by'>,
        ]
      >;

      execution_tasks: Table<
        ExecutionTaskRow,
        'execution_project_id' | 'title',
        [
          Rel<
            'execution_tasks_execution_project_id_fkey',
            ['execution_project_id'],
            'execution_projects',
            ['id']
          >,
          ProfileRel<'execution_tasks_assigned_to_fkey', 'assigned_to'>,
          ProfileRel<'execution_tasks_completed_by_fkey', 'completed_by'>,
          ProfileRel<'execution_tasks_created_by_fkey', 'created_by'>,
        ]
      >;

      files: Table<
        FileRow,
        | 'category'
        | 'object_key'
        | 'original_filename'
        | 'safe_filename'
        | 'mime_type'
        | 'extension'
        | 'size_bytes',
        [
          LeadRel<'files_lead_id_fkey', 'lead_id'>,
          Rel<'files_site_visit_id_fkey', ['site_visit_id'], 'site_visits', ['id']>,
          Rel<'files_design_project_id_fkey', ['design_project_id'], 'design_projects', ['id']>,
          Rel<
            'files_execution_project_id_fkey',
            ['execution_project_id'],
            'execution_projects',
            ['id']
          >,
          Rel<'files_execution_task_id_fkey', ['execution_task_id'], 'execution_tasks', ['id']>,
          ProfileRel<'files_uploaded_by_fkey', 'uploaded_by'>,
          ProfileRel<'files_archived_by_fkey', 'archived_by'>,
        ]
      >;

      file_access_logs: Table<
        FileAccessLogRow,
        'file_id' | 'action',
        [
          Rel<'file_access_logs_file_id_fkey', ['file_id'], 'files', ['id']>,
          ProfileRel<'file_access_logs_user_id_fkey', 'user_id'>,
        ]
      >;

      notifications: Table<
        NotificationRow,
        'user_id' | 'type' | 'title',
        [ProfileRel<'notifications_user_id_fkey', 'user_id'>]
      >;

      audit_logs: Table<
        AuditLogRow,
        'action' | 'entity_type',
        [ProfileRel<'audit_logs_actor_user_id_fkey', 'actor_user_id'>]
      >;

      meta_webhook_events: Table<
        MetaWebhookEventRow,
        'provider_event_id' | 'payload',
        [LeadRel<'meta_webhook_events_lead_id_fkey', 'lead_id'>]
      >;

      app_settings: Table<
        AppSettingRow,
        'key' | 'value',
        [ProfileRel<'app_settings_updated_by_fkey', 'updated_by'>]
      >;

      email_logs: Table<EmailLogRow, 'recipient' | 'email_type' | 'subject'>;

      meta_ad_accounts: Table<MetaAdAccountRow, 'meta_ad_account_id' | 'name'>;
      meta_campaigns: Table<MetaCampaignRow, 'meta_campaign_id' | 'name'>;
      meta_lead_forms: Table<
        MetaLeadFormRow,
        'meta_form_id' | 'name',
        [ProfileRel<'meta_lead_forms_mapping_reviewed_by_fkey', 'mapping_reviewed_by'>]
      >;
      meta_campaign_forms: Table<
        MetaCampaignFormRow,
        'campaign_id' | 'form_id',
        [
          Rel<'meta_campaign_forms_campaign_id_fkey', ['campaign_id'], 'meta_campaigns', ['id']>,
          Rel<'meta_campaign_forms_form_id_fkey', ['form_id'], 'meta_lead_forms', ['id']>,
        ]
      >;
      meta_field_mappings: Table<
        MetaFieldMappingRow,
        'meta_form_id' | 'meta_field_key' | 'crm_field',
        [
          ProfileRel<'meta_field_mappings_created_by_fkey', 'created_by'>,
          ProfileRel<'meta_field_mappings_updated_by_fkey', 'updated_by'>,
        ]
      >;
      meta_campaign_daily_insights: Table<
        MetaCampaignDailyInsightRow,
        'meta_campaign_id' | 'insight_date'
      >;
      meta_sync_runs: Table<
        MetaSyncRunRow,
        'sync_type',
        [ProfileRel<'meta_sync_runs_triggered_by_fkey', 'triggered_by'>]
      >;
      config_options: Table<ConfigOptionRow, 'group_key' | 'value' | 'label'>;
      execution_task_templates: Table<ExecutionTaskTemplateRow, 'title'>;
      rate_limit_hits: Table<RateLimitHitRow, 'bucket' | 'identifier'>;
    };
    Views: Record<never, never>;
    Functions: {
      record_sign_in: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      /** Transactional operations — see migration 07. */
      assign_lead: {
        Args: { p_lead_id: string; p_to_user_id: string; p_reason?: string | null };
        Returns: LeadRow;
      };
      /** Claims an unassigned lead for the calling Admin when BDM work is disabled. */
      claim_unassigned_lead: {
        Args: { p_lead_id: string };
        Returns: LeadRow;
      };
      change_lead_status: {
        Args: {
          p_lead_id: string;
          p_status: LeadStatus;
          p_lost_reason?: string | null;
          p_note?: string | null;
        };
        Returns: LeadRow;
      };
      approve_design_version: {
        Args: { p_version_id: string; p_note?: string | null };
        Returns: DesignVersionRow;
      };
      request_design_revision: {
        Args: { p_version_id: string; p_notes: string };
        Returns: DesignVersionRow;
      };
      create_execution_project: {
        Args: {
          p_lead_id: string;
          p_approved_design_version_id: string;
          p_title?: string | null;
          p_planned_start_at?: string | null;
          p_due_at?: string | null;
          p_assignee_ids?: string[];
          p_use_template?: boolean;
        };
        Returns: ExecutionProjectRow;
      };
      complete_follow_up: {
        Args: { p_follow_up_id: string; p_notes?: string | null };
        Returns: FollowUpRow;
      };
      /** True when a form has both a name and a mobile destination mapped. */
      meta_form_mapping_is_complete: {
        Args: { p_meta_form_id: string };
        Returns: boolean;
      };
      /** Atomically replaces every mapping row for one Meta form. */
      replace_meta_form_mapping: {
        Args: { p_meta_form_id: string; p_entries: Json; p_is_active?: boolean };
        Returns: undefined;
      };
      /** Seconds remaining before another manual sync of this type is allowed. */
      meta_sync_cooldown_remaining: {
        Args: { p_sync_type: MetaSyncType; p_cooldown_seconds?: number };
        Returns: number;
      };
      /** Records the value on a finished job, optionally closing it. Admin-only. */
      record_lead_account: {
        Args: {
          p_lead_id: string;
          p_total_amount: number;
          p_received_amount?: number;
          p_payment_status?: PaymentStatus;
          p_invoice_number?: string | null;
          p_notes?: string | null;
          p_close?: boolean;
        };
        Returns: LeadAccountRow;
      };
      /** Curated status projection for the signed-in customer. `[]` for anyone else. */
      client_portal_jobs: {
        Args: Record<string, never>;
        Returns: Json;
      };
      client_portal_seen: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      /** Replaces the whole campaign selection for one ad account. Admin-only. */
      set_meta_campaign_selection: {
        Args: { p_meta_ad_account_id: string | null; p_selected_campaign_ids: string[] };
        Returns: number;
      };
    };
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
      payment_status: PaymentStatus;
      visit_journey_status: VisitJourneyStatus;
      email_log_status: EmailLogStatus;
      meta_crm_field: MetaCrmField;
      meta_sync_type: MetaSyncType;
      meta_sync_status: MetaSyncStatus;
      meta_sync_trigger: MetaSyncTrigger;
      meta_association_source: MetaAssociationSource;
    };
    CompositeTypes: Record<never, never>;
  };
};
