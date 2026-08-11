import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { getExecutionProjectDetail } from '@/server/services/execution';
import { listActiveExecutionStaff } from '@/server/services/leads';
import { getSettings } from '@/lib/settings';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { ExecutionStatusBadge } from '@/components/status';
import { FileList } from '@/components/files/file-list';
import { FileUploader } from '@/components/files/uploader';
import { TaskChecklist, ExecutionStatusControls, AddTaskDialog } from '@/components/execution/execution-controls';
import { formatDateTime } from '@/lib/utils/format';
import type { DesignVersionRow, ExecutionTaskRow, FileRow } from '@/types/database';

export const metadata: Metadata = { title: 'Execution project' };

/**
 * Execution project detail (AGENTS.md §11.6, §8.5).
 *
 * The approved design sits at the top, because that is what the crew builds
 * from and §18 forbids execution proceeding from anything else. Progress is
 * derived from task completion by a database trigger, not typed in by hand.
 */
export default async function ExecutionProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requirePageUser();

  let detail;
  try {
    detail = await getExecutionProjectDetail(user, projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { project, lead, tasks, assignees, approvedVersion, files, canUpdate } = detail;
  const settings = await getSettings();
  const staff = user.isAdmin || user.role === 'BDM' ? await listActiveExecutionStaff() : [];

  const typedTasks = tasks as unknown as (ExecutionTaskRow & {
    assignee: { id: string; full_name: string } | null;
  })[];

  const version = approvedVersion as unknown as (DesignVersionRow & { file: FileRow | null }) | null;

  const outstandingMandatory = typedTasks.filter(
    (t) => t.is_mandatory && t.status !== 'COMPLETED' && t.status !== 'CANCELLED',
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/execution" className="text-sm text-ink-muted hover:text-ink">
          ← All projects
        </Link>
      </div>

      <PageHeader
        title={project.title ?? lead?.customer_name ?? 'Execution project'}
        subtitle={lead ? `${lead.lead_code} · ${lead.customer_name}` : undefined}
        action={<ExecutionStatusBadge value={project.status} />}
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width]"
                style={{ width: `${project.progress_percent}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums text-ink">
              {project.progress_percent}%
            </span>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {project.planned_start_at ? (
              <div className="flex gap-2">
                <dt className="text-ink-muted">Planned start</dt>
                <dd className="font-medium">{formatDateTime(project.planned_start_at)}</dd>
              </div>
            ) : null}
            {project.due_at ? (
              <div className="flex gap-2">
                <dt className="text-ink-muted">Target</dt>
                <dd className="font-medium">{formatDateTime(project.due_at)}</dd>
              </div>
            ) : null}
            {project.completed_at ? (
              <div className="flex gap-2">
                <dt className="text-ink-muted">Completed</dt>
                <dd className="font-medium">{formatDateTime(project.completed_at)}</dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-1.5">
            {assignees.length === 0 ? (
              <Badge tone="warn">Nobody assigned</Badge>
            ) : (
              assignees.map((assignee) => {
                const profile = (assignee as { profile?: { id: string; full_name: string } | null })
                  .profile;
                return (
                  <Badge key={assignee.id} tone="neutral">
                    {profile?.full_name ?? 'Staff'}
                  </Badge>
                );
              })
            )}
          </div>

          {project.blocker_summary && project.status === 'BLOCKED' ? (
            <Alert tone="danger" title="Blocked">
              {project.blocker_summary}
            </Alert>
          ) : null}

          {project.completion_override_reason ? (
            <Alert tone="warn" title="Closed with open mandatory tasks">
              {project.completion_override_reason}
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {/* The approved design — the single source of truth for the build. */}
      <Card>
        <CardHeader
          title="Approved design"
          description={version ? `Version ${version.version_number}` : 'Not available'}
        />
        <CardBody>
          {version?.file ? (
            <FileList
              files={[{ ...version.file, version_label: `v${version.version_number}`, is_approved_version: true }]}
            />
          ) : (
            <p className="text-sm text-ink-muted">The approved design file is not available.</p>
          )}
          <p className="mt-3 text-xs text-ink-subtle">
            This project is locked to this exact version. Later design changes do not apply to work
            already handed over.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Task checklist"
          description={
            outstandingMandatory > 0
              ? `${outstandingMandatory} mandatory task(s) still open`
              : 'All mandatory tasks complete'
          }
          action={
            canUpdate ? <AddTaskDialog projectId={project.id} staff={staff} /> : null
          }
        />
        <CardBody className="p-0">
          {typedTasks.length === 0 ? (
            <EmptyState title="No tasks yet" description="Add the work items for this project." />
          ) : (
            <TaskChecklist tasks={typedTasks} canUpdate={canUpdate} />
          )}
        </CardBody>
      </Card>

      {canUpdate ? (
        <Card>
          <CardHeader title="Update project status" />
          <CardBody>
            <ExecutionStatusControls
              projectId={project.id}
              currentStatus={project.status}
              outstandingMandatory={outstandingMandatory}
              isAdmin={user.isAdmin}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Progress evidence" description="Photos and completion documents" />
        <CardBody className="space-y-4">
          <FileList files={files} canArchive={canUpdate} emptyMessage="No evidence uploaded yet." />
          {canUpdate ? (
            <div className="border-t border-line pt-4">
              <FileUploader
                category="EXECUTION_EVIDENCE"
                executionProjectId={project.id}
                maxSizeMb={settings.maxUploadSizeMb}
                label="Upload evidence"
              />
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
