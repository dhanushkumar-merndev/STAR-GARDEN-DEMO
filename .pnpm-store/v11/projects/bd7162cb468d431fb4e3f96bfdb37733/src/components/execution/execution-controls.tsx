'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FormError, PendingFieldset, SubmitButton, fieldError } from '@/components/forms/form-parts';
import { TaskStatusBadge } from '@/components/status';
import {
  updateExecutionStatusAction,
  updateTaskStatusAction,
  upsertExecutionTaskAction,
} from '@/server/actions/workflow';
import { formatDue } from '@/lib/utils/format';
import type { ActionResult } from '@/lib/errors';
import type { ExecutionStatus, ExecutionTaskRow, ExecutionTaskStatus } from '@/types/database';

/**
 * Execution task and status controls (AGENTS.md §11.6, §8.5).
 *
 * Completion is the guarded transition: every mandatory task must be done, or
 * an Admin must state a reason. The UI surfaces the count so the requirement is
 * visible before the button is pressed, not as a surprise error afterwards.
 */

type TaskWithAssignee = ExecutionTaskRow & { assignee: { id: string; full_name: string } | null };

export function TaskChecklist({
  tasks,
  canUpdate,
}: {
  tasks: TaskWithAssignee[];
  canUpdate: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} canUpdate={canUpdate} />
      ))}
    </ul>
  );
}

function TaskRow({ task, canUpdate }: { task: TaskWithAssignee; canUpdate: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [blockerOpen, setBlockerOpen] = React.useState(false);

  const due = formatDue(task.due_at);
  const done = task.status === 'COMPLETED';

  function setStatus(status: ExecutionTaskStatus, blockerNotes?: string) {
    const formData = new FormData();
    formData.set('task_id', task.id);
    formData.set('status', status);
    if (blockerNotes) formData.set('blocker_notes', blockerNotes);

    startTransition(async () => {
      const result = await updateTaskStatusAction(null, formData);
      if (result.ok) {
        toast.success('Task updated.');
        setBlockerOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        {canUpdate ? (
          <input
            type="checkbox"
            checked={done}
            disabled={pending || task.status === 'CANCELLED'}
            onChange={() => setStatus(done ? 'IN_PROGRESS' : 'COMPLETED')}
            className="mt-0.5 size-5 shrink-0 rounded border-line text-brand-600 focus:ring-brand-300"
            aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <p className={done ? 'text-sm text-ink-muted line-through' : 'text-sm font-medium text-ink'}>
            {task.title}
          </p>
          {task.description ? (
            <p className="mt-0.5 text-xs text-ink-muted">{task.description}</p>
          ) : null}

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TaskStatusBadge value={task.status} />
            {task.is_mandatory ? <Badge tone="warn">Mandatory</Badge> : null}
            {task.assignee ? <Badge tone="neutral">{task.assignee.full_name}</Badge> : null}
            {task.due_at && !done ? (
              <Badge tone={due.tone === 'overdue' ? 'danger' : 'neutral'}>{due.label}</Badge>
            ) : null}
          </div>

          {task.blocker_notes && task.status === 'BLOCKED' ? (
            <p className="mt-2 rounded-lg bg-[--color-danger-bg] px-2.5 py-1.5 text-xs text-danger">
              {task.blocker_notes}
            </p>
          ) : null}
        </div>

        {canUpdate && !done && task.status !== 'CANCELLED' ? (
          <Dialog open={blockerOpen} onOpenChange={setBlockerOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" disabled={pending}>
                {task.status === 'BLOCKED' ? 'Unblock' : 'Block'}
              </Button>
            </DialogTrigger>
            <DialogContent title={task.status === 'BLOCKED' ? 'Unblock this task' : 'Mark task blocked'}>
              {task.status === 'BLOCKED' ? (
                <div className="space-y-4">
                  <p className="text-sm text-ink-muted">Move this task back to in progress?</p>
                  <Button fullWidth onClick={() => setStatus('IN_PROGRESS')} disabled={pending}>
                    Unblock
                  </Button>
                </div>
              ) : (
                <form
                  action={(formData) => setStatus('BLOCKED', String(formData.get('blocker_notes') ?? ''))}
                  className="space-y-4"
                >
                  <Field label="What is blocking it?" htmlFor="blocker_notes" required>
                    <Textarea
                      id="blocker_notes"
                      name="blocker_notes"
                      rows={3}
                      required
                      autoFocus
                      placeholder="Waterproofing not cured; waiting on the customer's plumber."
                    />
                  </Field>
                  <SubmitButton fullWidth variant="danger">
                    Mark blocked
                  </SubmitButton>
                </form>
              )}
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </li>
  );
}

export function AddTaskDialog({
  projectId,
  staff,
}: {
  projectId: string;
  staff: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function handleSubmit(formData: FormData) {
    const next = await upsertExecutionTaskAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Task added.');
      setOpen(false);
      setResult(null);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add task
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a task">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="execution_project_id" value={projectId} />
          <FormError result={result} />

          <PendingFieldset>
            <Field label="Task" htmlFor="title" required error={fieldError(result, 'title')}>
              <Input id="title" name="title" required autoFocus />
            </Field>

            <Field label="Details" htmlFor="description">
              <Textarea id="description" name="description" rows={2} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assign to" htmlFor="assigned_to">
                <Select id="assigned_to" name="assigned_to" defaultValue="">
                  <option value="">Unassigned</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Due" htmlFor="due_at">
                <Input id="due_at" name="due_at" type="datetime-local" />
              </Field>
            </div>

            <Checkbox
              name="is_mandatory"
              label="Mandatory"
              hint="The project cannot be completed while a mandatory task is open."
            />
          </PendingFieldset>

          <SubmitButton fullWidth>Add task</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExecutionStatusControls({
  projectId,
  currentStatus,
  outstandingMandatory,
  isAdmin,
}: {
  projectId: string;
  currentStatus: ExecutionStatus;
  outstandingMandatory: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string>(currentStatus);
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  const blocked = status === 'BLOCKED';
  const completing = status === 'COMPLETED';
  const needsOverride = completing && outstandingMandatory > 0;

  async function handleSubmit(formData: FormData) {
    const next = await updateExecutionStatusAction(null, formData);
    setResult(next);

    if (next.ok) {
      toast.success('Project status updated.');
      setResult(null);
      router.refresh();
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="execution_project_id" value={projectId} />
      <FormError result={result} />

      <PendingFieldset>
        <Field label="Status" htmlFor="status" error={fieldError(result, 'status')}>
          <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="NOT_STARTED">Not started</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="BLOCKED">Blocked</option>
            <option value="READY_FOR_REVIEW">Ready for review</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>

        {blocked ? (
          <Field
            label="What is blocking the project?"
            htmlFor="blocker_summary"
            required
            error={fieldError(result, 'blocker_summary')}
          >
            <Textarea id="blocker_summary" name="blocker_summary" rows={3} required />
          </Field>
        ) : null}

        {needsOverride ? (
          isAdmin ? (
            <>
              <Alert tone="warn" title={`${outstandingMandatory} mandatory task(s) still open`}>
                Closing now requires a stated reason, which is recorded in the audit trail.
              </Alert>
              <Field
                label="Override reason"
                htmlFor="completion_override_reason"
                required
                error={fieldError(result, 'completion_override_reason')}
              >
                <Textarea id="completion_override_reason" name="completion_override_reason" rows={2} required />
              </Field>
            </>
          ) : (
            <Alert tone="danger" title={`${outstandingMandatory} mandatory task(s) still open`}>
              Complete them, or ask an Admin to close the project with a reason.
            </Alert>
          )
        ) : null}
      </PendingFieldset>

      <SubmitButton disabled={needsOverride && !isAdmin}>Update status</SubmitButton>
    </form>
  );
}
