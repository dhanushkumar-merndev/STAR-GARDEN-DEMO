import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { forbidden, notFound } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';
import {
  canReadDesignProject,
  canReadExecutionProject,
  canReadLead,
  canWriteLead,
  isAdmin,
} from '@/lib/permissions';
import type {
  DesignProjectRow,
  ExecutionProjectRow,
  FileRow,
  LeadRow,
  SiteVisitRow,
} from '@/types/database';

/**
 * Loading guards: fetch the row, then apply the pure predicates from
 * `./index.ts` to it.
 *
 * Two properties matter here.
 *
 * First, rows are read with the **user-scoped** client, so RLS has already had
 * its say before the TypeScript check runs — the two layers are independent and
 * the stricter one wins (§7.5).
 *
 * Second, an invisible row and a nonexistent row both report NOT_FOUND. Telling
 * an unauthorized caller that a record exists is itself a disclosure, and §23.13
 * requires that guessing an id gains nothing.
 */

/* -------------------------------------------------------------------------- */
/* Leads                                                                       */
/* -------------------------------------------------------------------------- */

export async function assertCanReadLead(user: SessionUser, leadId: string): Promise<LeadRow> {
  const supabase = await createClient();

  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (!lead) throw notFound('Lead');

  if (isAdmin(user) || lead.assigned_bdm_id === user.id) return lead;

  // Designer / Execution reach a lead only through a project they are on.
  const [{ data: designLink }, { data: executionLink }] = await Promise.all([
    user.role === 'DESIGNER'
      ? supabase
          .from('design_projects')
          .select('id')
          .eq('lead_id', leadId)
          .eq('assigned_designer_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user.role === 'EXECUTION'
      ? supabase
          .from('execution_projects')
          .select('id, execution_assignees!inner(user_id)')
          .eq('lead_id', leadId)
          .eq('execution_assignees.user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const permitted = canReadLead(user, lead, {
    isAssignedDesigner: Boolean(designLink),
    isExecutionAssignee: Boolean(executionLink),
  });

  if (!permitted) throw notFound('Lead');
  return lead;
}

export async function assertCanWriteLead(user: SessionUser, leadId: string): Promise<LeadRow> {
  const supabase = await createClient();

  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (!lead) throw notFound('Lead');

  if (!canWriteLead(user, lead)) {
    throw forbidden('Only the assigned BDM or an Admin can change this lead.');
  }
  return lead;
}

/* -------------------------------------------------------------------------- */
/* Design                                                                      */
/* -------------------------------------------------------------------------- */

export interface DesignContext {
  project: DesignProjectRow;
  lead: LeadRow;
}

export async function assertCanReadDesignProject(
  user: SessionUser,
  designProjectId: string,
): Promise<DesignContext> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('design_projects')
    .select('*')
    .eq('id', designProjectId)
    .maybeSingle();
  if (!project) throw notFound('Design project');

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', project.lead_id)
    .maybeSingle();

  // The lead row is invisible to a designer under RLS (they reach it only via
  // this project), so fall back to the ownership field the project carries.
  const leadForCheck: Pick<LeadRow, 'assigned_bdm_id'> = lead ?? { assigned_bdm_id: null };

  if (!canReadDesignProject(user, project, leadForCheck)) {
    throw notFound('Design project');
  }

  return { project, lead: (lead ?? ({ id: project.lead_id } as LeadRow)) };
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                   */
/* -------------------------------------------------------------------------- */

export interface ExecutionContext {
  project: ExecutionProjectRow;
  lead: LeadRow | null;
  isAssignee: boolean;
}

export async function assertCanReadExecutionProject(
  user: SessionUser,
  executionProjectId: string,
): Promise<ExecutionContext> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('execution_projects')
    .select('*')
    .eq('id', executionProjectId)
    .maybeSingle();
  if (!project) throw notFound('Execution project');

  const [{ data: assignee }, { data: lead }] = await Promise.all([
    supabase
      .from('execution_assignees')
      .select('id')
      .eq('execution_project_id', executionProjectId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('leads').select('*').eq('id', project.lead_id).maybeSingle(),
  ]);

  const isAssignee = Boolean(assignee);

  if (!canReadExecutionProject(user, lead ?? { assigned_bdm_id: null }, isAssignee)) {
    throw notFound('Execution project');
  }

  return { project, lead, isAssignee };
}

/* -------------------------------------------------------------------------- */
/* Site visits                                                                 */
/* -------------------------------------------------------------------------- */

export async function assertCanReadSiteVisit(
  user: SessionUser,
  siteVisitId: string,
): Promise<{ visit: SiteVisitRow; lead: LeadRow; isAttendee: boolean }> {
  const supabase = await createClient();

  const { data: visit } = await supabase
    .from('site_visits')
    .select('*')
    .eq('id', siteVisitId)
    .maybeSingle();
  if (!visit) throw notFound('Site visit');

  const { data: attendee } = await supabase
    .from('site_visit_attendees')
    .select('id')
    .eq('site_visit_id', siteVisitId)
    .eq('user_id', user.id)
    .maybeSingle();

  const isAttendee = Boolean(attendee);

  // An invited designer sees the visit without seeing the whole lead.
  if (isAttendee || isAdmin(user)) {
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', visit.lead_id)
      .maybeSingle();
    return { visit, lead: lead ?? ({ id: visit.lead_id } as LeadRow), isAttendee };
  }

  const lead = await assertCanReadLead(user, visit.lead_id);
  return { visit, lead, isAttendee };
}

/* -------------------------------------------------------------------------- */
/* Files (§5.5, §23.13)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Re-derives file access from whichever parent the file hangs off, on every
 * single read. A guessed file id resolves to nothing without access to its
 * parent record.
 */
export async function assertCanReadFile(user: SessionUser, fileId: string): Promise<FileRow> {
  const supabase = await createClient();

  const { data: file } = await supabase.from('files').select('*').eq('id', fileId).maybeSingle();
  if (!file) throw notFound('File');

  if (isAdmin(user)) return file;

  // Walk to the parent and reuse that parent's own guard. Each of these throws
  // NOT_FOUND when the actor cannot reach it, which is the answer we want.
  if (file.design_project_id) {
    await assertCanReadDesignProject(user, file.design_project_id);
    return file;
  }

  if (file.execution_task_id) {
    const { data: task } = await supabase
      .from('execution_tasks')
      .select('execution_project_id')
      .eq('id', file.execution_task_id)
      .maybeSingle();
    if (!task) throw notFound('File');
    await assertCanReadExecutionProject(user, task.execution_project_id);
    return file;
  }

  if (file.execution_project_id) {
    await assertCanReadExecutionProject(user, file.execution_project_id);
    return file;
  }

  if (file.site_visit_id) {
    await assertCanReadSiteVisit(user, file.site_visit_id);
    return file;
  }

  if (file.lead_id) {
    await assertCanReadLead(user, file.lead_id);
    return file;
  }

  // A file with no parent should be impossible — `files_requires_parent` is a
  // check constraint. Refuse rather than guess.
  throw notFound('File');
}
