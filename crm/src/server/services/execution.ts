import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { AuditAction, recordAudit } from '@/lib/audit';
import { notify, notifyMany, NotificationCopy } from '@/lib/notifications';
import { sendStaffEmail } from '@/lib/email';
import { executionAssignedEmail } from '@/lib/email/templates';
import { assertCanReadExecutionProject, assertCanWriteLead, assertLeadCanStartDelivery } from '@/lib/permissions/guards';
import { canOverrideCompletion, canUpdateExecutionWork } from '@/lib/permissions';
import { assertExecutionTransition, assertTransition, EXECUTION_TASK_TRANSITIONS } from '@/lib/state-machines';
import type { SessionUser } from '@/lib/auth/session';
import type { ExecutionProjectRow, ExecutionStatus, ExecutionTaskRow, ExecutionTaskStatus } from '@/types/database';
import { humanizePostgresError } from './leads';

/**
 * Execution projects and tasks (AGENTS.md §8.5, §9.4).
 *
 * The handoff is the one operation the spec guards hardest: execution may only
 * start from an exact APPROVED design version (§18). That rule is enforced in
 * three places — here, in `create_execution_project`, and in the
 * `guard_execution_source_version` trigger — so no code path can bypass it.
 */

export async function createExecutionProject(
  user: SessionUser,
  input: {
    lead_id: string;
    approved_design_version_id: string;
    title?: string;
    planned_start_at?: string;
    due_at?: string;
    assignee_ids: string[];
    use_template?: boolean;
  },
): Promise<ExecutionProjectRow> {
  const lead = await assertCanWriteLead(user, input.lead_id);
  assertLeadCanStartDelivery(lead);
  const supabase = await createClient();

  // Re-verify the version is genuinely the approved one for THIS lead before
  // calling the transaction, so the user gets a readable error rather than a
  // raw trigger exception.
  const { data: version } = await supabase
    .from('design_versions')
    .select('id, status, version_number, design_project_id, design_projects:design_projects!design_versions_design_project_id_fkey(lead_id)')
    .eq('id', input.approved_design_version_id)
    .maybeSingle();

  if (!version) {
    throw new AppError('NOT_FOUND', 'That design version does not exist.');
  }

  if (version.status !== 'APPROVED') {
    throw new AppError(
      'INVALID_TRANSITION',
      'Execution can only start from an approved design version.',
    );
  }

  const versionLeadId = (version.design_projects as unknown as { lead_id: string } | null)?.lead_id;
  if (versionLeadId && versionLeadId !== input.lead_id) {
    throw new AppError('VALIDATION', 'That approved design belongs to a different lead.');
  }

  const { data: project, error } = await supabase.rpc('create_execution_project', {
    p_lead_id: input.lead_id,
    p_approved_design_version_id: input.approved_design_version_id,
    p_title: input.title ?? `${lead.customer_name} — execution`,
    p_planned_start_at: input.planned_start_at ?? null,
    p_due_at: input.due_at ?? null,
    p_assignee_ids: input.assignee_ids,
    p_use_template: input.use_template ?? true,
  });

  if (error || !project) {
    throw new AppError(
      'INTERNAL',
      humanizePostgresError(error, 'Could not create the execution project.'),
      { cause: error },
    );
  }

  await notifyMany(input.assignee_ids, {
    ...NotificationCopy.executionAssigned(lead.lead_code, lead.customer_name),
    entityType: 'execution_project',
    entityId: project.id,
    skipEmail: true,
  });

  const handoffEmail = executionAssignedEmail({
    executionProjectId: project.id,
    leadCode: lead.lead_code,
    customerName: lead.customer_name,
    dueAt: project.due_at ? new Date(project.due_at).toLocaleString('en-IN') : null,
  });

  for (const assigneeId of new Set(input.assignee_ids)) {
    await sendStaffEmail({
      userId: assigneeId,
      rendered: handoffEmail,
      emailType: 'execution.assigned',
      relatedEntityType: 'execution_project',
      relatedEntityId: project.id,
    });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.EXECUTION_PROJECT_CREATED,
    entityType: 'execution_project',
    entityId: project.id,
    after: {
      lead_id: input.lead_id,
      approved_design_version_id: input.approved_design_version_id,
      version_number: version.version_number,
      assignees: input.assignee_ids,
    },
  });

  return project;
}

export async function updateExecutionStatus(
  user: SessionUser,
  input: {
    execution_project_id: string;
    status: ExecutionStatus;
    blocker_summary?: string;
    completion_override_reason?: string;
  },
): Promise<ExecutionProjectRow> {
  const { project, lead, isAssignee } = await assertCanReadExecutionProject(
    user,
    input.execution_project_id,
  );

  if (!canUpdateExecutionWork(user, lead ?? { assigned_bdm_id: null }, isAssignee)) {
    throw new AppError('FORBIDDEN', 'You are not on this execution project.');
  }

  const supabase = await createClient();

  // §8.5 step 6: completion needs every mandatory task done, or an Admin
  // override carrying a reason.
  const { count: outstanding } = await supabase
    .from('execution_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('execution_project_id', input.execution_project_id)
    .eq('is_mandatory', true)
    .not('status', 'in', '("COMPLETED","CANCELLED")');

  assertExecutionTransition(project.status, input.status, {
    outstandingMandatoryTasks: outstanding ?? 0,
    overrideReason: input.completion_override_reason,
    isAdmin: canOverrideCompletion(user),
    blockerSummary: input.blocker_summary,
  });

  const isOverride = input.status === 'COMPLETED' && (outstanding ?? 0) > 0;

  const { data: updated, error } = await supabase
    .from('execution_projects')
    .update({
      status: input.status,
      blocker_summary:
        input.status === 'BLOCKED' ? (input.blocker_summary ?? null) : project.blocker_summary,
      completed_at: input.status === 'COMPLETED' ? new Date().toISOString() : null,
      completion_override_reason: isOverride ? (input.completion_override_reason ?? null) : null,
    })
    .eq('id', input.execution_project_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not update the project status.', { cause: error });
  }

  await supabase.from('activities').insert({
    lead_id: project.lead_id,
    type: 'EXECUTION_UPDATE',
    notes: `Execution status changed to ${input.status.replace(/_/g, ' ').toLowerCase()}${
      input.blocker_summary ? ` — ${input.blocker_summary}` : ''
    }.`,
    created_by: user.id,
  });

  const leadCode = lead?.lead_code ?? '';

  if (input.status === 'BLOCKED') {
    await notify({
      userId: lead?.assigned_bdm_id,
      ...NotificationCopy.executionBlocked(leadCode, input.blocker_summary ?? 'Blocked'),
      entityType: 'execution_project',
      entityId: updated.id,
    });
  }

  if (input.status === 'COMPLETED') {
    await notify({
      userId: lead?.assigned_bdm_id,
      ...NotificationCopy.executionCompleted(leadCode),
      entityType: 'execution_project',
      entityId: updated.id,
    });
  }

  await recordAudit({
    actorUserId: user.id,
    action:
      input.status === 'COMPLETED'
        ? AuditAction.EXECUTION_COMPLETED
        : AuditAction.EXECUTION_STATUS_CHANGED,
    entityType: 'execution_project',
    entityId: updated.id,
    before: { status: project.status },
    after: {
      status: updated.status,
      blocker_summary: updated.blocker_summary,
      override_reason: updated.completion_override_reason,
      outstanding_mandatory_tasks: outstanding ?? 0,
    },
  });

  return updated;
}

export async function upsertExecutionTask(
  user: SessionUser,
  input: {
    execution_project_id: string;
    task_id?: string;
    title: string;
    description?: string;
    assigned_to?: string;
    is_mandatory: boolean;
    due_at?: string;
  },
): Promise<ExecutionTaskRow> {
  const { lead, isAssignee } = await assertCanReadExecutionProject(
    user,
    input.execution_project_id,
  );

  if (!canUpdateExecutionWork(user, lead ?? { assigned_bdm_id: null }, isAssignee)) {
    throw new AppError('FORBIDDEN', 'You are not on this execution project.');
  }

  const supabase = await createClient();

  if (input.task_id) {
    const { data, error } = await supabase
      .from('execution_tasks')
      .update({
        title: input.title,
        description: input.description ?? null,
        assigned_to: input.assigned_to ?? null,
        is_mandatory: input.is_mandatory,
        due_at: input.due_at ?? null,
      })
      .eq('id', input.task_id)
      .eq('execution_project_id', input.execution_project_id)
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError('INTERNAL', 'Could not update the task.', { cause: error });
    }

    await recordAudit({
      actorUserId: user.id,
      action: AuditAction.EXECUTION_TASK_UPDATED,
      entityType: 'execution_task',
      entityId: data.id,
      after: { title: data.title, is_mandatory: data.is_mandatory, due_at: data.due_at },
    });

    return data;
  }

  const { data: last } = await supabase
    .from('execution_tasks')
    .select('sort_order')
    .eq('execution_project_id', input.execution_project_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('execution_tasks')
    .insert({
      execution_project_id: input.execution_project_id,
      title: input.title,
      description: input.description ?? null,
      assigned_to: input.assigned_to ?? null,
      is_mandatory: input.is_mandatory,
      due_at: input.due_at ?? null,
      sort_order: (last?.sort_order ?? 0) + 10,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new AppError('INTERNAL', 'Could not create the task.', { cause: error });
  }

  if (input.assigned_to && input.assigned_to !== user.id) {
    await notify({
      userId: input.assigned_to,
      ...NotificationCopy.executionTaskDue(data.title),
      title: 'New task assigned to you',
      entityType: 'execution_task',
      entityId: data.id,
    });
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.EXECUTION_TASK_CREATED,
    entityType: 'execution_task',
    entityId: data.id,
    after: { execution_project_id: input.execution_project_id, title: data.title },
  });

  return data;
}

export async function updateTaskStatus(
  user: SessionUser,
  input: { task_id: string; status: ExecutionTaskStatus; blocker_notes?: string },
): Promise<ExecutionTaskRow> {
  const supabase = await createClient();

  const { data: task } = await supabase
    .from('execution_tasks')
    .select('*')
    .eq('id', input.task_id)
    .maybeSingle();

  if (!task) throw new AppError('NOT_FOUND', 'Task not found.');

  const { project, lead, isAssignee } = await assertCanReadExecutionProject(
    user,
    task.execution_project_id,
  );

  if (!canUpdateExecutionWork(user, lead ?? { assigned_bdm_id: null }, isAssignee)) {
    throw new AppError('FORBIDDEN', 'You are not on this execution project.');
  }

  assertTransition(EXECUTION_TASK_TRANSITIONS, task.status, input.status, 'Task');

  if (input.status === 'BLOCKED' && !input.blocker_notes?.trim()) {
    throw new AppError('VALIDATION', 'Describe what is blocking this task.', {
      fields: { blocker_notes: 'Say what is blocking it.' },
    });
  }

  const { data: updated, error } = await supabase
    .from('execution_tasks')
    .update({
      status: input.status,
      blocker_notes: input.status === 'BLOCKED' ? (input.blocker_notes ?? null) : task.blocker_notes,
      completed_at: input.status === 'COMPLETED' ? new Date().toISOString() : null,
      completed_by: input.status === 'COMPLETED' ? user.id : null,
    })
    .eq('id', input.task_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new AppError('INTERNAL', 'Could not update the task.', { cause: error });
  }

  // `recalculate_execution_progress` has already refreshed progress_percent.
  await recordAudit({
    actorUserId: user.id,
    action:
      input.status === 'COMPLETED'
        ? AuditAction.EXECUTION_TASK_COMPLETED
        : AuditAction.EXECUTION_TASK_UPDATED,
    entityType: 'execution_task',
    entityId: updated.id,
    before: { status: task.status },
    after: { status: updated.status, blocker_notes: updated.blocker_notes },
  });

  if (input.status === 'BLOCKED') {
    await notify({
      userId: lead?.assigned_bdm_id,
      ...NotificationCopy.executionBlocked(lead?.lead_code ?? '', input.blocker_notes ?? ''),
      title: 'Task blocked',
      entityType: 'execution_project',
      entityId: project.id,
    });
  }

  return updated;
}

export async function assignExecutionStaff(
  user: SessionUser,
  input: { execution_project_id: string; user_ids: string[] },
): Promise<void> {
  const { project, lead } = await assertCanReadExecutionProject(user, input.execution_project_id);

  if (!user.isAdmin) {
    await assertCanWriteLead(user, project.lead_id);
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('execution_assignees')
    .select('user_id')
    .eq('execution_project_id', input.execution_project_id);

  const current = new Set((existing ?? []).map((r) => r.user_id));
  const wanted = new Set(input.user_ids);

  const toAdd = input.user_ids.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !wanted.has(id));

  if (toAdd.length) {
    await supabase.from('execution_assignees').insert(
      toAdd.map((userId) => ({
        execution_project_id: input.execution_project_id,
        user_id: userId,
        assigned_by: user.id,
      })),
    );
  }

  if (toRemove.length) {
    await supabase
      .from('execution_assignees')
      .delete()
      .eq('execution_project_id', input.execution_project_id)
      .in('user_id', toRemove);
  }

  if (project.status === 'NOT_STARTED' && wanted.size > 0) {
    await supabase
      .from('execution_projects')
      .update({ status: 'ASSIGNED' })
      .eq('id', input.execution_project_id);
  }

  await notifyMany(toAdd, {
    ...NotificationCopy.executionAssigned(lead?.lead_code ?? '', lead?.customer_name ?? ''),
    entityType: 'execution_project',
    entityId: input.execution_project_id,
    skipEmail: true,
  });

  if (toAdd.length > 0) {
    const rendered = executionAssignedEmail({
      executionProjectId: input.execution_project_id,
      leadCode: lead?.lead_code ?? '',
      customerName: lead?.customer_name ?? '',
      dueAt: project.due_at ? new Date(project.due_at).toLocaleString('en-IN') : null,
    });

    for (const assigneeId of toAdd) {
      await sendStaffEmail({
        userId: assigneeId,
        rendered,
        emailType: 'execution.assigned',
        relatedEntityType: 'execution_project',
        relatedEntityId: input.execution_project_id,
      });
    }
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.EXECUTION_PROJECT_ASSIGNED,
    entityType: 'execution_project',
    entityId: input.execution_project_id,
    before: { assignees: [...current] },
    after: { assignees: input.user_ids },
  });
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export type ExecutionScope = 'MINE' | 'ACTIVE' | 'BLOCKED' | 'ALL';

/** One RLS-scoped aggregate for every execution tab. */
export async function countExecutionProjectsByScope(
  user: SessionUser,
  scopes: readonly ExecutionScope[],
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('execution_project_scope_counts', {
    p_current_user_id: user.id,
  });
  if (error) {
    console.warn('[execution] execution_project_scope_counts RPC unavailable; using count fallback', error);
    const entries = await Promise.all(
      scopes.map(async (scope) => {
        let query = supabase.from('execution_projects').select('id', { count: 'exact', head: true });
        if (scope === 'MINE') {
          const { count, error: countError } = await supabase
            .from('execution_projects')
            .select('id, execution_assignees!inner(user_id)', { count: 'exact', head: true })
            .eq('execution_assignees.user_id', user.id)
            .neq('status', 'CANCELLED');
          if (countError) {
            throw new AppError('INTERNAL', 'Could not count execution projects.', { cause: countError });
          }
          return [scope, count ?? 0] as const;
        }
        if (scope === 'ACTIVE') query = query.not('status', 'in', '("COMPLETED","CANCELLED")');
        else if (scope === 'BLOCKED') query = query.eq('status', 'BLOCKED');
        else query = query.neq('status', 'CANCELLED');

        const { count, error: countError } = await query;
        if (countError) {
          throw new AppError('INTERNAL', 'Could not count execution projects.', { cause: countError });
        }
        return [scope, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  const values = data && !Array.isArray(data) && typeof data === 'object' ? data : {};
  return Object.fromEntries(scopes.map((scope) => [scope, Number(values[scope] ?? 0)]));
}

export async function listExecutionProjects(
  user: SessionUser,
  options: {
    scope?: 'MINE' | 'ACTIVE' | 'BLOCKED' | 'ALL';
    limit?: number;
    offset?: number;
    /**
     * Setting this switches the call into paged mode: `pageSize` rows at that
     * offset, plus an exact `total`. Left unset the call keeps its
     * `limit`/`offset` behaviour and skips the count, which is a full scan
     * under RLS.
     */
    page?: number;
    pageSize?: number;
  } = {},
) {
  const supabase = await createClient();
  const scope = options.scope ?? (user.role === 'EXECUTION' ? 'MINE' : 'ALL');
  const paged = options.page !== undefined;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = paged
    ? Math.min(100, Math.max(5, options.pageSize ?? DEFAULT_PAGE_SIZE))
    : Math.min(500, Math.max(1, options.limit ?? 100));
  const offset = paged ? (page - 1) * pageSize : Math.max(0, options.offset ?? 0);

  const LEAD_JOIN =
    'lead:leads!execution_projects_lead_id_fkey(id, lead_code, customer_name, location_text)';

  // "Mine" needs an inner join on the assignee table, which changes the row
  // shape, so it is built as its own query rather than mutated onto the others.
  if (scope === 'MINE') {
    const { data, count, error } = await supabase
      .from('execution_projects')
      .select(
        `id, title, status, due_at, progress_percent, blocker_summary, ${LEAD_JOIN}, execution_assignees!inner(user_id)`,
        paged ? { count: 'exact' } : undefined,
      )
      .eq('execution_assignees.user_id', user.id)
      .neq('status', 'CANCELLED')
      .order('due_at', { ascending: true, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new AppError('INTERNAL', 'Could not load execution projects.', { cause: error });
    }
    const items = (data ?? []).map(({ execution_assignees, ...project }) => {
      void execution_assignees;
      return project;
    });
    return { items, total: count ?? items.length, page, pageSize };
  }

  let query = supabase
    .from('execution_projects')
    .select(
      `id, title, status, due_at, progress_percent, blocker_summary, ${LEAD_JOIN}`,
      paged ? { count: 'exact' } : undefined,
    );

  if (scope === 'ACTIVE') {
    query = query.not('status', 'in', '("COMPLETED","CANCELLED")');
  } else if (scope === 'BLOCKED') {
    query = query.eq('status', 'BLOCKED');
  } else {
    query = query.neq('status', 'CANCELLED');
  }

  const { data, count, error } = await query
    .order('due_at', { ascending: true, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw new AppError('INTERNAL', 'Could not load execution projects.', { cause: error });

  const items = data ?? [];
  return { items, total: count ?? items.length, page, pageSize };
}

export async function getExecutionProjectDetail(user: SessionUser, executionProjectId: string) {
  const { project, lead, isAssignee } = await assertCanReadExecutionProject(
    user,
    executionProjectId,
  );
  const supabase = await createClient();

  const [tasks, assignees, approvedVersion, files] = await Promise.all([
    supabase
      .from('execution_tasks')
      .select('*, assignee:profiles!execution_tasks_assigned_to_fkey(id, full_name)')
      .eq('execution_project_id', executionProjectId)
      .order('sort_order'),
    supabase
      .from('execution_assignees')
      .select('*, profile:profiles!execution_assignees_user_id_fkey(id, full_name)')
      .eq('execution_project_id', executionProjectId),
    supabase
      .from('design_versions')
      .select('*, file:files!design_versions_file_fkey(*)')
      .eq('id', project.approved_design_version_id)
      .maybeSingle(),
    supabase
      .from('files')
      .select('*')
      .eq('execution_project_id', executionProjectId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false }),
  ]);

  return {
    project,
    lead,
    isAssignee,
    tasks: tasks.data ?? [],
    assignees: assignees.data ?? [],
    approvedVersion: approvedVersion.data,
    files: files.data ?? [],
    canUpdate: canUpdateExecutionWork(user, lead ?? { assigned_bdm_id: null }, isAssignee),
  };
}

/** Counts for the Execution dashboard (§12.4). */
export async function executionCounts(user: SessionUser) {
  const supabase = await createClient();
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const { data, error } = await supabase.rpc('execution_work_counts', {
    p_task_assignee: user.role === 'EXECUTION' ? user.id : null,
    p_now: now.toISOString(),
    p_end_today: endOfToday,
  });
  if (error) {
    console.warn('[execution] execution_work_counts RPC unavailable; using count fallback', error);
    const taskQuery = () => {
      const query = supabase
        .from('execution_tasks')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '("COMPLETED","CANCELLED")');
      return user.role === 'EXECUTION' ? query.eq('assigned_to', user.id) : query;
    };
    const [dueToday, overdue, blocked, nearingCompletion] = await Promise.all([
      taskQuery().gte('due_at', now.toISOString()).lte('due_at', endOfToday),
      taskQuery().lt('due_at', now.toISOString()),
      supabase.from('execution_projects').select('id', { count: 'exact', head: true }).eq('status', 'BLOCKED'),
      supabase
        .from('execution_projects')
        .select('id', { count: 'exact', head: true })
        .gte('progress_percent', 80)
        .not('status', 'in', '("COMPLETED","CANCELLED")'),
    ]);
    const queryError = dueToday.error ?? overdue.error ?? blocked.error ?? nearingCompletion.error;
    if (queryError) {
      throw new AppError('INTERNAL', 'Could not count execution work.', { cause: queryError });
    }
    return {
      dueToday: dueToday.count ?? 0,
      overdue: overdue.count ?? 0,
      blocked: blocked.count ?? 0,
      nearingCompletion: nearingCompletion.count ?? 0,
    };
  }
  const counts = data && !Array.isArray(data) && typeof data === 'object' ? data : {};

  return {
    dueToday: Number(counts.DUE_TODAY ?? 0),
    overdue: Number(counts.OVERDUE ?? 0),
    blocked: Number(counts.BLOCKED ?? 0),
    nearingCompletion: Number(counts.NEARING_COMPLETION ?? 0),
  };
}

/** Approved versions available for handoff on a lead (§8.5 step 1). */
export async function listApprovedVersionsForLead(user: SessionUser, leadId: string) {
  await assertCanWriteLead(user, leadId);
  const supabase = await createClient();

  const { data } = await supabase
    .from('design_projects')
    .select('id, approved_version_id, design_versions!design_versions_design_project_id_fkey(id, version_number, status, version_note)')
    .eq('lead_id', leadId)
    .eq('status', 'APPROVED');

  return (data ?? []).flatMap((project) => {
    const versions = (project.design_versions ?? []) as unknown as {
      id: string;
      version_number: number;
      status: string;
      version_note: string | null;
    }[];
    return versions.filter((v) => v.status === 'APPROVED');
  });
}
