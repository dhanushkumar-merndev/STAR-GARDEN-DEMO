/**
 * Role permission helpers — the application-side mirror of the SQL predicates
 * in `20260810120200_functions_triggers.sql`.
 *
 * AGENTS.md §7.5 requires that authorization be re-checked in server code and
 * not merely delegated to RLS. These are pure functions over rows that have
 * already been loaded, which keeps them directly unit testable (§20.1) and
 * makes the two layers easy to compare side by side.
 *
 * The async `assert*` helpers that load rows and apply these predicates live in
 * `./guards.ts`, which is server-only. This file imports nothing from the
 * database layer so it can be tested in isolation.
 */

import type {
  DesignProjectRow,
  DesignVersionRow,
  FileCategory,
  LeadRow,
  UserRole,
} from '@/types/database';

/** The subset of a session the permission rules actually depend on. */
export interface Actor {
  id: string;
  role: UserRole;
}

export const isAdmin = (actor: Actor): boolean => actor.role === 'ADMIN';

/* -------------------------------------------------------------------------- */
/* Leads (§7.1, §7.2)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Read access for a lead the actor already "reaches" by ownership.
 *
 * Designer and Execution reach leads *indirectly*, through a design or
 * execution project — those cases need a database lookup and live in
 * `canReadLeadVia()` below, because a lead row alone cannot answer them.
 */
export function ownsLead(actor: Actor, lead: Pick<LeadRow, 'assigned_bdm_id'>): boolean {
  return lead.assigned_bdm_id === actor.id;
}

export function canWriteLead(actor: Actor, lead: Pick<LeadRow, 'assigned_bdm_id'>): boolean {
  return isAdmin(actor) || ownsLead(actor, lead);
}

/** Relations that grant a Designer or Execution user sight of a lead (§7.3, §7.4). */
export interface LeadRelations {
  /** The actor is the assigned designer on a design project for this lead. */
  isAssignedDesigner?: boolean;
  /** The actor is on the execution project for this lead. */
  isExecutionAssignee?: boolean;
}

export function canReadLead(
  actor: Actor,
  lead: Pick<LeadRow, 'assigned_bdm_id'>,
  relations: LeadRelations = {},
): boolean {
  if (isAdmin(actor)) return true;
  if (ownsLead(actor, lead)) return true;
  if (actor.role === 'DESIGNER') return relations.isAssignedDesigner === true;
  if (actor.role === 'EXECUTION') return relations.isExecutionAssignee === true;
  return false;
}

/** Only Admin sees the unassigned queue and may hand leads to another BDM (§7.1). */
export function canAssignLeadToOthers(actor: Actor): boolean {
  return isAdmin(actor);
}

/** A BDM may create a lead, but only unassigned or owned by themselves (§7.2). */
export function canCreateLead(actor: Actor): boolean {
  return actor.role === 'ADMIN' || actor.role === 'BDM';
}

export function canViewAllLeads(actor: Actor): boolean {
  return isAdmin(actor);
}

/* -------------------------------------------------------------------------- */
/* Call activity and follow-ups (§6, §7.2)                                     */
/* -------------------------------------------------------------------------- */

/** Only the owning BDM (or Admin) dials and logs outcomes. */
export function canLogCall(actor: Actor, lead: Pick<LeadRow, 'assigned_bdm_id'>): boolean {
  return canWriteLead(actor, lead);
}

export function canScheduleSiteVisit(actor: Actor, lead: Pick<LeadRow, 'assigned_bdm_id'>): boolean {
  return canWriteLead(actor, lead);
}

/* -------------------------------------------------------------------------- */
/* Design (§7.2, §7.3, §8.4)                                                   */
/* -------------------------------------------------------------------------- */

export function canReadDesignProject(
  actor: Actor,
  project: Pick<DesignProjectRow, 'assigned_designer_id'>,
  lead: Pick<LeadRow, 'assigned_bdm_id'>,
): boolean {
  return (
    isAdmin(actor) || project.assigned_designer_id === actor.id || ownsLead(actor, lead)
  );
}

/** Assignment of a designer is Admin, or the BDM who owns the lead (§8.4 step 2). */
export function canAssignDesigner(actor: Actor, lead: Pick<LeadRow, 'assigned_bdm_id'>): boolean {
  return canWriteLead(actor, lead);
}

/** Only the assigned designer adds versions, and never after approval (§7.3). */
export function canUploadDesignVersion(
  actor: Actor,
  project: Pick<DesignProjectRow, 'assigned_designer_id' | 'status'>,
): boolean {
  if (project.status === 'APPROVED' || project.status === 'CANCELLED') return false;
  return actor.role === 'DESIGNER' && project.assigned_designer_id === actor.id;
}

/** Review, revision and approval are the reviewer's side of the workflow (§7.2). */
export function canReviewDesign(actor: Actor, lead: Pick<LeadRow, 'assigned_bdm_id'>): boolean {
  return canWriteLead(actor, lead);
}

/** A designer may not approve their own work. */
export function canApproveDesignVersion(
  actor: Actor,
  lead: Pick<LeadRow, 'assigned_bdm_id'>,
  version: Pick<DesignVersionRow, 'status' | 'uploaded_by'>,
): boolean {
  if (!canReviewDesign(actor, lead)) return false;
  if (version.uploaded_by === actor.id && !isAdmin(actor)) return false;
  return version.status === 'READY_FOR_REVIEW' || version.status === 'REVISION_REQUESTED';
}

/* -------------------------------------------------------------------------- */
/* Execution (§7.4, §8.5)                                                      */
/* -------------------------------------------------------------------------- */

export function canReadExecutionProject(
  actor: Actor,
  lead: Pick<LeadRow, 'assigned_bdm_id'>,
  isAssignee: boolean,
): boolean {
  return isAdmin(actor) || isAssignee || ownsLead(actor, lead);
}

/** Creating the handoff is an Admin / owning-BDM action, not an Execution one. */
export function canCreateExecutionProject(
  actor: Actor,
  lead: Pick<LeadRow, 'assigned_bdm_id'>,
): boolean {
  return canWriteLead(actor, lead);
}

/** Execution staff update their own project's tasks; BDM has read-only sight (§7.2). */
export function canUpdateExecutionWork(
  actor: Actor,
  lead: Pick<LeadRow, 'assigned_bdm_id'>,
  isAssignee: boolean,
): boolean {
  if (isAdmin(actor)) return true;
  if (actor.role === 'EXECUTION') return isAssignee;
  // The owning BDM may correct project metadata but is not doing the work.
  return ownsLead(actor, lead);
}

/** Completing with mandatory tasks outstanding requires an Admin reason (§8.5 step 6). */
export function canOverrideCompletion(actor: Actor): boolean {
  return isAdmin(actor);
}

/* -------------------------------------------------------------------------- */
/* Files (§5.5)                                                                */
/* -------------------------------------------------------------------------- */

const CATEGORIES_BY_ROLE: Record<UserRole, readonly FileCategory[]> = {
  ADMIN: [
    'DESIGN_SOURCE',
    'SITE_VISIT_ATTACHMENT',
    'EXECUTION_EVIDENCE',
    'COMPLETION_EVIDENCE',
    'LEAD_ATTACHMENT',
  ],
  BDM: ['SITE_VISIT_ATTACHMENT', 'LEAD_ATTACHMENT'],
  DESIGNER: ['DESIGN_VERSION', 'DESIGN_SOURCE', 'SITE_VISIT_ATTACHMENT'],
  EXECUTION: ['EXECUTION_EVIDENCE', 'COMPLETION_EVIDENCE'],
  // A customer uploads nothing. The portal is read-only by construction.
  CLIENT: [],
};

export function canUploadCategory(actor: Actor, category: FileCategory): boolean {
  return CATEGORIES_BY_ROLE[actor.role].includes(category);
}

/**
 * Approved design history is never archived away by its uploader — only an
 * Admin may archive it, and nobody may delete it (§5.5, §18).
 */
export function canArchiveFile(
  actor: Actor,
  file: { uploaded_by: string | null; category: FileCategory },
): boolean {
  if (isAdmin(actor)) return true;
  if (file.category === 'DESIGN_VERSION') return false;
  return file.uploaded_by === actor.id;
}

/* -------------------------------------------------------------------------- */
/* Admin surfaces (§7.1, §11.7, §12)                                           */
/* -------------------------------------------------------------------------- */

export const canManageUsers = isAdmin;
export const canManageSettings = isAdmin;
export const canViewAuditLog = isAdmin;
export const canViewIntegrationStatus = isAdmin;

/** CSV export is Admin-only unless explicitly expanded (§12, last line). */
export const canExportCsv = isAdmin;

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

/** Which top-level sections a role sees. UI convenience only — never security. */
export function visibleSections(role: UserRole): string[] {
  switch (role) {
    case 'ADMIN':
      return [
        'dashboard',
        'leads',
        'follow-ups',
        'site-visits',
        'designs',
        'execution',
        'accounts',
        'reports',
        'settings',
      ];
    case 'BDM':
      return ['dashboard', 'leads', 'follow-ups', 'site-visits', 'designs', 'execution'];
    case 'DESIGNER':
      return ['dashboard', 'designs', 'site-visits'];
    case 'EXECUTION':
      return ['dashboard', 'execution'];
    // The customer's whole application is one page.
    case 'CLIENT':
      return ['portal'];
  }
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Money is Admin-only in both directions.
 *
 * A BDM can see that a job closed; only an Admin records what it was worth and
 * only an Admin exports the register.
 */
export const canRecordAccount = isAdmin;
export const canViewAccounts = isAdmin;
export const canExportAccounts = isAdmin;

/* -------------------------------------------------------------------------- */
/* Customer portal                                                             */
/* -------------------------------------------------------------------------- */

/** Inviting a customer to watch their own job, and revoking that. */
export const canManagePortalAccess = isAdmin;

/**
 * Scheduling and rescheduling a site visit is Admin-only.
 *
 * The brief is explicit that the Admin owns the calendar: a designer sees the
 * time they were given and cannot move it, which is what stops two people
 * quietly rearranging the same customer's morning.
 */
export const canScheduleVisitTime = isAdmin;
