import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications';
import { getSettings } from '@/lib/settings';

/**
 * Scheduled reminders (AGENTS.md §13).
 *
 * "Use a simple scheduled job/cron for due-date reminders. Do not add a complex
 * queue system until required by actual scale." This runs every minute from Supabase
 * Cron and does four passes.
 *
 * Idempotency comes from the database, not from bookkeeping here: the partial
 * unique index `notifications_dedupe_key` covers (user, type, entity, day), so
 * running this every hour produces at most one reminder per item per day. That
 * also means a missed run self-heals on the next tick.
 */

export interface ReminderRun {
  followUpsDueSoon: number;
  followUpsOverdue: number;
  followUpsMarkedOverdue: number;
  designsDueSoon: number;
  designsOverdue: number;
  tasksDue: number;
  tasksOverdue: number;
}

export async function runReminders(): Promise<ReminderRun> {
  const admin = createAdminClient();
  const settings = await getSettings();
  const now = new Date();

  const result: ReminderRun = {
    followUpsDueSoon: 0,
    followUpsOverdue: 0,
    followUpsMarkedOverdue: 0,
    designsDueSoon: 0,
    designsOverdue: 0,
    tasksDue: 0,
    tasksOverdue: 0,
  };

  /* ---------------------------------------------------------------------- */
  /* 1. Follow-ups approaching their due time                                */
  /* ---------------------------------------------------------------------- */

  const dueSoonCutoff = new Date(
    now.getTime() + settings.followUpReminderLeadHours * 3_600_000,
  ).toISOString();

  const { data: dueSoon } = await admin
    .from('follow_ups')
    .select('id, title, assigned_to, lead_id, due_at, leads!follow_ups_lead_id_fkey(lead_code)')
    .in('status', ['OPEN'])
    // Automatic callbacks alert at their due time, not immediately through the
    // normal configurable "due soon" window.
    .eq('is_automatic', false)
    .gte('due_at', now.toISOString())
    .lte('due_at', dueSoonCutoff)
    .limit(500);

  for (const row of dueSoon ?? []) {
    const leadCode = (row.leads as unknown as { lead_code: string } | null)?.lead_code ?? '';
    await notify({
      userId: row.assigned_to,
      type: 'FOLLOW_UP_DUE_SOON',
      title: 'Follow-up due soon',
      body: `${row.title} · ${leadCode}`,
      entityType: 'follow_up',
      entityId: row.id,
    });
    result.followUpsDueSoon += 1;
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Follow-ups past due                                                  */
  /* ---------------------------------------------------------------------- */

  const { data: overdue } = await admin
    .from('follow_ups')
    .select('id, title, assigned_to, lead_id, due_at, status, leads!follow_ups_lead_id_fkey(lead_code)')
    .in('status', ['OPEN', 'OVERDUE'])
    .lt('due_at', now.toISOString())
    .limit(500);

  const toMarkOverdue = (overdue ?? []).filter((r) => r.status === 'OPEN').map((r) => r.id);

  if (toMarkOverdue.length > 0) {
    // OVERDUE is a real state in §9.5, not just a rendering flag, so the row is
    // moved rather than left OPEN and coloured red in the UI.
    await admin.from('follow_ups').update({ status: 'OVERDUE' }).in('id', toMarkOverdue);
    result.followUpsMarkedOverdue = toMarkOverdue.length;
  }

  for (const row of overdue ?? []) {
    const leadCode = (row.leads as unknown as { lead_code: string } | null)?.lead_code ?? '';
    await notify({
      userId: row.assigned_to,
      type: 'FOLLOW_UP_OVERDUE',
      title: 'Follow-up overdue',
      body: `${row.title} · ${leadCode}`,
      entityType: 'follow_up',
      entityId: row.id,
    });
    result.followUpsOverdue += 1;
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Designs due / overdue                                                */
  /* ---------------------------------------------------------------------- */

  const designCutoff = new Date(
    now.getTime() + settings.designDueReminderLeadHours * 3_600_000,
  ).toISOString();

  const { data: designs } = await admin
    .from('design_projects')
    .select('id, due_at, assigned_designer_id, lead_id, leads!design_projects_lead_id_fkey(lead_code, assigned_bdm_id)')
    .not('due_at', 'is', null)
    .not('status', 'in', '("APPROVED","CANCELLED")')
    .lte('due_at', designCutoff)
    .limit(500);

  for (const project of designs ?? []) {
    const lead = project.leads as unknown as {
      lead_code: string;
      assigned_bdm_id: string | null;
    } | null;

    const isOverdue = project.due_at !== null && new Date(project.due_at) < now;

    await notify({
      userId: project.assigned_designer_id,
      type: isOverdue ? 'DESIGN_OVERDUE' : 'DESIGN_DUE_SOON',
      title: isOverdue ? 'Design overdue' : 'Design due soon',
      body: lead?.lead_code ?? 'Design project',
      entityType: 'design_project',
      entityId: project.id,
    });

    if (isOverdue) {
      // The BDM owns the customer relationship, so they need to know too.
      await notify({
        userId: lead?.assigned_bdm_id,
        type: 'DESIGN_OVERDUE',
        title: 'Design overdue',
        body: lead?.lead_code ?? 'Design project',
        entityType: 'design_project',
        entityId: project.id,
      });
      result.designsOverdue += 1;
    } else {
      result.designsDueSoon += 1;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Execution tasks due / overdue                                        */
  /* ---------------------------------------------------------------------- */

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const { data: tasks } = await admin
    .from('execution_tasks')
    .select('id, title, assigned_to, due_at')
    .not('due_at', 'is', null)
    .not('status', 'in', '("COMPLETED","CANCELLED")')
    .lte('due_at', endOfToday)
    .limit(500);

  for (const task of tasks ?? []) {
    const isOverdue = task.due_at !== null && new Date(task.due_at) < now;
    await notify({
      userId: task.assigned_to,
      type: isOverdue ? 'EXECUTION_TASK_OVERDUE' : 'EXECUTION_TASK_DUE',
      title: isOverdue ? 'Task overdue' : 'Task due today',
      body: task.title,
      entityType: 'execution_task',
      entityId: task.id,
    });

    if (isOverdue) result.tasksOverdue += 1;
    else result.tasksDue += 1;
  }

  return result;
}
