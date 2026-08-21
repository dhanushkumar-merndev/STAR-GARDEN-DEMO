import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { notifyBatch, type NotifyParams } from '@/lib/notifications';
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

  const dueSoonCutoff = new Date(
    now.getTime() + settings.followUpReminderLeadHours * 3_600_000,
  ).toISOString();
  const designCutoff = new Date(
    now.getTime() + settings.designDueReminderLeadHours * 3_600_000,
  ).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  // Independent reminder sources are read together. The bounded result size
  // keeps one cron run predictable; hourly/daily dedupe makes retries safe.
  const [dueSoonResult, overdueResult, designsResult, tasksResult] = await Promise.all([
    admin
      .from('follow_ups')
      .select('id, title, assigned_to, lead_id, due_at, leads!follow_ups_lead_id_fkey(lead_code)')
      .in('status', ['OPEN'])
      .eq('is_automatic', false)
      .gte('due_at', now.toISOString())
      .lte('due_at', dueSoonCutoff)
      .order('due_at')
      .limit(1000),
    admin
      .from('follow_ups')
      .select('id, title, assigned_to, lead_id, due_at, status, leads!follow_ups_lead_id_fkey(lead_code)')
      .in('status', ['OPEN', 'OVERDUE'])
      .lt('due_at', now.toISOString())
      .order('due_at')
      .limit(1000),
    admin
      .from('design_projects')
      .select('id, due_at, assigned_designer_id, lead_id, leads!design_projects_lead_id_fkey(lead_code, assigned_bdm_id)')
      .not('due_at', 'is', null)
      .not('status', 'in', '("APPROVED","CANCELLED")')
      .lte('due_at', designCutoff)
      .order('due_at')
      .limit(1000),
    admin
      .from('execution_tasks')
      .select('id, title, assigned_to, due_at')
      .not('due_at', 'is', null)
      .not('status', 'in', '("COMPLETED","CANCELLED")')
      .lte('due_at', endOfToday)
      .order('due_at')
      .limit(1000),
  ]);

  const queryError =
    dueSoonResult.error ?? overdueResult.error ?? designsResult.error ?? tasksResult.error;
  if (queryError) throw queryError;

  const dueSoon = dueSoonResult.data ?? [];
  const overdue = overdueResult.data ?? [];
  const designs = designsResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const notifications: NotifyParams[] = [];

  for (const row of dueSoon) {
    const leadCode = (row.leads as unknown as { lead_code: string } | null)?.lead_code ?? '';
    notifications.push({
      userId: row.assigned_to,
      type: 'FOLLOW_UP_DUE_SOON',
      title: 'Follow-up due soon',
      body: `${row.title} · ${leadCode}`,
      entityType: 'follow_up',
      entityId: row.id,
    });
  }
  result.followUpsDueSoon = dueSoon.length;

  const toMarkOverdue = overdue.filter((row) => row.status === 'OPEN').map((row) => row.id);
  for (const row of overdue) {
    const leadCode = (row.leads as unknown as { lead_code: string } | null)?.lead_code ?? '';
    notifications.push({
      userId: row.assigned_to,
      type: 'FOLLOW_UP_OVERDUE',
      title: 'Follow-up overdue',
      body: `${row.title} · ${leadCode}`,
      entityType: 'follow_up',
      entityId: row.id,
    });
  }
  result.followUpsOverdue = overdue.length;

  for (const project of designs) {
    const lead = project.leads as unknown as {
      lead_code: string;
      assigned_bdm_id: string | null;
    } | null;
    const isOverdue = project.due_at !== null && new Date(project.due_at) < now;
    notifications.push({
      userId: project.assigned_designer_id,
      type: isOverdue ? 'DESIGN_OVERDUE' : 'DESIGN_DUE_SOON',
      title: isOverdue ? 'Design overdue' : 'Design due soon',
      body: lead?.lead_code ?? 'Design project',
      entityType: 'design_project',
      entityId: project.id,
    });
    if (isOverdue) {
      notifications.push({
        userId: lead?.assigned_bdm_id,
        type: 'DESIGN_OVERDUE',
        title: 'Design overdue',
        body: lead?.lead_code ?? 'Design project',
        entityType: 'design_project',
        entityId: project.id,
      });
      result.designsOverdue += 1;
    } else result.designsDueSoon += 1;
  }

  for (const task of tasks) {
    const isOverdue = task.due_at !== null && new Date(task.due_at) < now;
    notifications.push({
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

  const overdueUpdate = toMarkOverdue.length > 0
    ? admin.from('follow_ups').update({ status: 'OVERDUE' }).in('id', toMarkOverdue)
    : Promise.resolve({ error: null });
  const [, updateResult] = await Promise.all([notifyBatch(notifications), overdueUpdate]);
  if (updateResult.error) throw updateResult.error;
  result.followUpsMarkedOverdue = toMarkOverdue.length;

  return result;
}
