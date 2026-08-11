import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { notify, NotificationCopy } from '@/lib/notifications';
import { sendStaffEmail } from '@/lib/email';
import { designAssignedEmail, designRevisionEmail } from '@/lib/email/templates';
import { assertCanReadDesignProject, assertCanWriteLead, assertLeadCanStartDelivery } from '@/lib/permissions/guards';
import { canUploadDesignVersion } from '@/lib/permissions';
import type { SessionUser } from '@/lib/auth/session';
import type { DesignProjectRow, DesignVersionRow } from '@/types/database';
import { humanizePostgresError } from './leads';

/**
 * Design assignment, versioning and approval (AGENTS.md §8.4, §5.6).
 *
 * The invariants that matter:
 *   - Uploads always create a new version; nothing is ever overwritten.
 *   - Exactly one version is the approved one.
 *   - Execution later references that exact version, not "the latest file".
 *
 * Approval and revision go through the SQL functions in migration 07 so the
 * version row, the project row and the timeline entry move together (§18).
 */

/**
 * Refuses to let design work start before the site has been visited.
 *
 * Also returns the designer who attended, because they are the person who
 * should be offered first — one landscaper owns the site from visit through to
 * drawing, which is what the brief asks for.
 */
export async function siteVisitGate(leadId: string): Promise<{
  isUnlocked: boolean;
  completedAt: string | null;
  suggestedDesignerId: string | null;
  scheduledAt: string | null;
  visitStatus: string | null;
}> {
  const supabase = await createClient();

  const { data: visits } = await supabase
    .from('site_visits')
    .select('status, assigned_designer_id, scheduled_start_at, check_out_at')
    .eq('lead_id', leadId)
    .neq('status', 'CANCELLED')
    .order('scheduled_start_at', { ascending: false });

  const completed = (visits ?? []).find((visit) => visit.status === 'COMPLETED');
  const latest = (visits ?? [])[0] ?? null;

  return {
    isUnlocked: Boolean(completed),
    completedAt: completed?.check_out_at ?? null,
    // Prefer the designer who actually attended the completed visit.
    suggestedDesignerId:
      completed?.assigned_designer_id ?? latest?.assigned_designer_id ?? null,
    scheduledAt: latest?.scheduled_start_at ?? null,
    visitStatus: latest?.status ?? null,
  };
}

async function assertSiteVisitCompleted(leadId: string): Promise<void> {
  const gate = await siteVisitGate(leadId);
  if (gate.isUnlocked) return;

  throw new AppError(
    'INVALID_TRANSITION',
    gate.scheduledAt
      ? 'The site visit for this lead is not complete yet. Design can be assigned once the visit is marked complete.'
      : 'Book and complete a site visit before assigning a design.',
  );
}

export async function assignDesigner(
  user: SessionUser,
  input: {
    lead_id: string;
    designer_id: string;
    requirement_notes?: string;
    due_at?: string;
  },
): Promise<DesignProjectRow> {
  const lead = await assertCanWriteLead(user, input.lead_id);
  assertLeadCanStartDelivery(lead);
  const supabase = await createClient();

  // The site visit gate (operations brief): design cannot start before someone
  // has stood in the garden. Designing from a phone call produces a drawing
  // that has to be redone after the first visit, so the sequence is enforced
  // rather than merely recommended.
  await assertSiteVisitCompleted(input.lead_id);

  const { data: designer } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', input.designer_id)
    .maybeSingle();

  if (!designer || !designer.is_active || designer.role !== 'DESIGNER') {
    throw new AppError('VALIDATION', 'Pick an active Landscape Designer.', {
      fields: { designer_id: 'This user is not an active designer.' },
    });
  }

  // One live design project per lead — the partial unique index enforces it, so
  // reassignment updates the existing row rather than racing to insert a second.
  const { data: existing } = await supabase
    .from('design_projects')
    .select('*')
    .eq('lead_id', input.lead_id)
    .neq('status', 'CANCELLED')
    .maybeSingle();

  if (existing?.status === 'APPROVED') {
    throw new AppError(
      'INVALID_TRANSITION',
      'This design is already approved. Cancel it before assigning a new designer.',
    );
  }

  let project: DesignProjectRow;

  if (existing) {
    const { data, error } = await supabase
      .from('design_projects')
      .update({
        assigned_designer_id: input.designer_id,
        status: 'ASSIGNED',
        requirement_notes: input.requirement_notes ?? existing.requirement_notes,
        due_at: input.due_at ?? existing.due_at,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError('INTERNAL', 'Could not reassign the design.', { cause: error });
    }
    project = data;
  } else {
    const { data, error } = await supabase
      .from('design_projects')
      .insert({
        lead_id: input.lead_id,
        assigned_designer_id: input.designer_id,
        status: 'ASSIGNED',
        requirement_notes: input.requirement_notes ?? lead.requirement_summary ?? null,
        due_at: input.due_at ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError('INTERNAL', 'Could not create the design project.', { cause: error });
    }
    project = data;
  }

  await supabase.from('leads').update({ design_required: true }).eq('id', input.lead_id);

  await supabase.from('activities').insert({
    lead_id: input.lead_id,
    type: 'DESIGN_UPDATE',
    notes: `Design assigned to ${designer.full_name}.`,
    created_by: user.id,
  });

  await notify({
    userId: input.designer_id,
    ...NotificationCopy.designerAssigned(lead.lead_code, lead.customer_name),
    entityType: 'design_project',
    entityId: project.id,
    skipEmail: true,
  });

  await sendStaffEmail({
    userId: input.designer_id,
    rendered: designAssignedEmail({
      designProjectId: project.id,
      leadCode: lead.lead_code,
      customerName: lead.customer_name,
      requirement: project.requirement_notes,
      dueAt: project.due_at ? new Date(project.due_at).toLocaleString('en-IN') : null,
    }),
    emailType: 'design.assigned',
    relatedEntityType: 'design_project',
    relatedEntityId: project.id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.DESIGNER_ASSIGNED,
    entityType: 'design_project',
    entityId: project.id,
    before: existing ? { assigned_designer_id: existing.assigned_designer_id } : undefined,
    after: { lead_id: input.lead_id, assigned_designer_id: input.designer_id, due_at: project.due_at },
  });

  return project;
}

/**
 * Backfills the automatic visit-to-design handoff for visits completed before
 * that handoff existed. The caller never chooses a person: the Landscape
 * Designer recorded on the completed visit remains the owner of the work.
 */
export async function startDesignFromCompletedVisit(
  user: SessionUser,
  input: { lead_id: string },
): Promise<DesignProjectRow> {
  const gate = await siteVisitGate(input.lead_id);

  if (!gate.isUnlocked) {
    throw new AppError('INVALID_TRANSITION', 'Complete the site visit before starting landscape design.');
  }

  if (!gate.suggestedDesignerId) {
    throw new AppError(
      'VALIDATION',
      'No Landscape Designer was recorded on the completed visit. Schedule a re-visit with the designer first.',
    );
  }

  return assignDesigner(user, {
    lead_id: input.lead_id,
    designer_id: gate.suggestedDesignerId,
  });
}

/**
 * Marks an uploaded version ready for review (§8.4 step 5).
 *
 * The version row itself is created by the upload finalize flow — see
 * `files.ts`. This is the designer saying "I am done with this one".
 */
export async function markVersionReady(
  user: SessionUser,
  input: { design_version_id: string; version_note?: string },
): Promise<DesignVersionRow> {
  const supabase = await createClient();

  const { data: version } = await supabase
    .from('design_versions')
    .select('*')
    .eq('id', input.design_version_id)
    .maybeSingle();

  if (!version) throw new AppError('NOT_FOUND', 'Design version not found.');

  const { project, lead } = await assertCanReadDesignProject(user, version.design_project_id);

  if (!canUploadDesignVersion(user, project)) {
    throw new AppError('FORBIDDEN', 'Only the assigned designer can submit this version.');
  }

  if (version.status !== 'DRAFT' && version.status !== 'REVISION_REQUESTED') {
    throw new AppError(
      'INVALID_TRANSITION',
      'Only a draft version can be marked ready for review.',
    );
  }

  const { data: updated, error } = await supabase
    .from('design_versions')
    .update({
      status: 'READY_FOR_REVIEW',
      ready_for_review_at: new Date().toISOString(),
      version_note: input.version_note ?? version.version_note,
    })
    .eq('id', input.design_version_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not submit the version.', { cause: error });
  }

  await supabase
    .from('design_projects')
    .update({ status: 'READY_FOR_REVIEW' })
    .eq('id', project.id);

  await supabase.from('activities').insert({
    lead_id: project.lead_id,
    type: 'DESIGN_UPDATE',
    notes: `Version ${updated.version_number} submitted for review.`,
    created_by: user.id,
  });

  await notify({
    userId: lead.assigned_bdm_id,
    ...NotificationCopy.designReadyForReview(lead.lead_code ?? '', updated.version_number),
    entityType: 'design_project',
    entityId: project.id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.DESIGN_VERSION_READY,
    entityType: 'design_version',
    entityId: updated.id,
    after: { design_project_id: project.id, version_number: updated.version_number },
  });

  return updated;
}

/** Sends a version back for revision. Transactional — see migration 07. */
export async function requestRevision(
  user: SessionUser,
  input: { design_version_id: string; revision_notes: string },
): Promise<DesignVersionRow> {
  const supabase = await createClient();

  const { data: version, error } = await supabase.rpc('request_design_revision', {
    p_version_id: input.design_version_id,
    p_notes: input.revision_notes,
  });

  if (error || !version) {
    throw new AppError('INTERNAL', humanizePostgresError(error, 'Could not request a revision.'), {
      cause: error,
    });
  }

  const { data: project } = await supabase
    .from('design_projects')
    .select('id, lead_id, assigned_designer_id, lead:leads!design_projects_lead_id_fkey(lead_code)')
    .eq('id', version.design_project_id)
    .maybeSingle();

  const leadCode =
    (project?.lead as unknown as { lead_code: string } | null)?.lead_code ?? '';

  await notify({
    userId: project?.assigned_designer_id,
    ...NotificationCopy.revisionRequested(leadCode, version.version_number),
    entityType: 'design_project',
    entityId: version.design_project_id,
    skipEmail: true,
  });

  await sendStaffEmail({
    userId: project?.assigned_designer_id,
    rendered: designRevisionEmail({
      designProjectId: version.design_project_id,
      leadCode,
      versionNumber: version.version_number,
      notes: input.revision_notes,
    }),
    emailType: 'design.revision_requested',
    relatedEntityType: 'design_project',
    relatedEntityId: version.design_project_id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.DESIGN_REVISION_REQUESTED,
    entityType: 'design_version',
    entityId: version.id,
    after: { version_number: version.version_number, notes: input.revision_notes },
  });

  return version;
}

/**
 * Approves one exact version (§8.4 step 9, §23.14).
 *
 * The SQL function supersedes any previously approved version and stamps the
 * project, so "the approved design" is never ambiguous.
 */
export async function approveVersion(
  user: SessionUser,
  input: { design_version_id: string; note?: string },
): Promise<DesignVersionRow> {
  const supabase = await createClient();

  const { data: version, error } = await supabase.rpc('approve_design_version', {
    p_version_id: input.design_version_id,
    p_note: input.note ?? null,
  });

  if (error || !version) {
    throw new AppError('INTERNAL', humanizePostgresError(error, 'Could not approve the version.'), {
      cause: error,
    });
  }

  const { data: project } = await supabase
    .from('design_projects')
    .select('id, lead_id, assigned_designer_id, lead:leads!design_projects_lead_id_fkey(lead_code)')
    .eq('id', version.design_project_id)
    .maybeSingle();

  const leadCode = (project?.lead as unknown as { lead_code: string } | null)?.lead_code ?? '';

  await notify({
    userId: project?.assigned_designer_id,
    ...NotificationCopy.designApproved(leadCode, version.version_number),
    entityType: 'design_project',
    entityId: version.design_project_id,
  });

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.DESIGN_VERSION_APPROVED,
    entityType: 'design_version',
    entityId: version.id,
    after: {
      design_project_id: version.design_project_id,
      version_number: version.version_number,
      note: input.note ?? null,
    },
  });

  return version;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export type DesignScope = 'MINE' | 'AWAITING_ASSIGNMENT' | 'READY_FOR_REVIEW' | 'DUE' | 'ALL';

export async function listDesignProjects(
  user: SessionUser,
  options: { scope?: DesignScope; limit?: number } = {},
) {
  const supabase = await createClient();

  let query = supabase
    .from('design_projects')
    .select(
      '*, lead:leads!design_projects_lead_id_fkey(id, lead_code, customer_name, location_text), designer:profiles!design_projects_assigned_designer_id_fkey(id, full_name)',
    );

  switch (options.scope ?? (user.role === 'DESIGNER' ? 'MINE' : 'ALL')) {
    case 'MINE':
      query = query.eq('assigned_designer_id', user.id).neq('status', 'CANCELLED');
      break;
    case 'AWAITING_ASSIGNMENT':
      query = query.is('assigned_designer_id', null).in('status', ['REQUIRED']);
      break;
    case 'READY_FOR_REVIEW':
      query = query.eq('status', 'READY_FOR_REVIEW');
      break;
    case 'DUE':
      query = query
        .not('due_at', 'is', null)
        .not('status', 'in', '("APPROVED","CANCELLED")')
        .lte('due_at', new Date(Date.now() + 3 * 86_400_000).toISOString());
      break;
    default:
      query = query.neq('status', 'CANCELLED');
  }

  const { data, error } = await query
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(options.limit ?? 100);

  if (error) throw new AppError('INTERNAL', 'Could not load design projects.', { cause: error });
  return data ?? [];
}

export async function getDesignProjectDetail(user: SessionUser, designProjectId: string) {
  const { project, lead } = await assertCanReadDesignProject(user, designProjectId);
  const supabase = await createClient();

  const [versions, designer, visits] = await Promise.all([
    supabase
      .from('design_versions')
      .select(
        '*, file:files!design_versions_file_fkey(*), uploader:profiles!design_versions_uploaded_by_fkey(full_name)',
      )
      .eq('design_project_id', designProjectId)
      .order('version_number', { ascending: false }),
    project.assigned_designer_id
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', project.assigned_designer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // The designer needs the visit notes and requirements to work from (§8.4 step 4).
    supabase
      .from('site_visits')
      .select('id, scheduled_start_at, status, notes, requirement_summary, address')
      .eq('lead_id', project.lead_id)
      .order('scheduled_start_at', { ascending: false })
      .limit(5),
  ]);

  return {
    project,
    lead,
    designer: designer.data,
    versions: versions.data ?? [],
    siteVisits: visits.data ?? [],
    canUpload: canUploadDesignVersion(user, project),
  };
}

/** Counts for the Admin and Designer dashboards (§12.1, §12.3). */
export async function designCounts(user: SessionUser) {
  const supabase = await createClient();
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();

  const scoped = () => {
    const q = supabase.from('design_projects').select('id', { count: 'exact', head: true });
    return user.role === 'DESIGNER' ? q.eq('assigned_designer_id', user.id) : q;
  };

  const [awaitingAssignment, readyForReview, dueSoon, revisions] = await Promise.all([
    supabase
      .from('design_projects')
      .select('id', { count: 'exact', head: true })
      .is('assigned_designer_id', null)
      .eq('status', 'REQUIRED'),
    scoped().eq('status', 'READY_FOR_REVIEW'),
    scoped().not('due_at', 'is', null).lte('due_at', soon).not('status', 'in', '("APPROVED","CANCELLED")'),
    scoped().eq('status', 'REVISION_REQUESTED'),
  ]);

  return {
    awaitingAssignment: awaitingAssignment.count ?? 0,
    readyForReview: readyForReview.count ?? 0,
    dueSoon: dueSoon.count ?? 0,
    revisions: revisions.count ?? 0,
  };
}
