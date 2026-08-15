import type { Metadata } from 'next';
import Link from 'next/link';
import { LuArrowLeft, LuExternalLink } from 'react-icons/lu';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { getDesignProjectDetail } from '@/server/services/designs';
import { listActiveExecutionStaff } from '@/server/services/leads';
import { getSettings } from '@/lib/settings';
import { canReviewDesign } from '@/lib/permissions';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { DesignStatusBadge, DesignVersionStatusBadge } from '@/components/status';
import { FileUploader } from '@/components/files/uploader';
import { DesignVersionActions } from '@/components/designs/version-actions';
import { FileList } from '@/components/files/file-list';
import { StartExecutionDialog } from '@/components/leads/lead-dialogs';
import { formatDateTime } from '@/lib/utils/format';
import type { DesignVersionRow, FileRow } from '@/types/database';

export const metadata: Metadata = { title: 'Design project' };

/**
 * Design project detail (AGENTS.md §11.5, §5.6).
 *
 * Version history is the heart of this screen. Versions are immutable and
 * append-only, exactly one is approved, and the approved one is badged so
 * nobody sends the wrong drawing to a customer (§16).
 */
export default async function DesignProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requirePageUser();

  let detail;
  try {
    detail = await getDesignProjectDetail(user, projectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { project, lead, designer, versions, siteVisits, canUpload } = detail;
  const canReview = canReviewDesign(user, lead ?? { assigned_bdm_id: null });
  const [settings, executionStaff] = await Promise.all([
    getSettings(),
    project.status === 'APPROVED' && canReview ? listActiveExecutionStaff() : Promise.resolve([]),
  ]);

  type VersionWithJoins = DesignVersionRow & {
    file: FileRow | null;
    uploader: { full_name: string } | null;
  };

  const typedVersions = versions as unknown as VersionWithJoins[];
  const approvedVersion = typedVersions.find((version) => version.id === project.approved_version_id) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/designs" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <LuArrowLeft className="size-4" />
          All designs
        </Link>
      </div>

      <PageHeader
        title={lead?.customer_name ?? 'Design project'}
        subtitle={lead?.lead_code}
        action={(
          <div className="flex items-center gap-2">
            {lead ? (
              <Link href={`/leads/${lead.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-brand-50">
                Open lead
                <LuExternalLink className="size-4" />
              </Link>
            ) : null}
            <DesignStatusBadge value={project.status} />
          </div>
        )}
      />

      <Card>
        <CardHeader title="Brief" description={designer ? `Designer: ${designer.full_name}` : 'No designer assigned'} />
        <CardBody className="space-y-3 text-sm">
          {project.due_at ? (
            <p>
              <span className="text-ink-muted">Due: </span>
              <span className="font-medium text-ink">{formatDateTime(project.due_at)}</span>
            </p>
          ) : null}

          {project.requirement_notes ? (
            <div className="rounded-lg bg-surface-muted p-3">
              <p className="text-xs font-medium text-ink-muted">Requirement</p>
              <p className="mt-1 whitespace-pre-wrap">{project.requirement_notes}</p>
            </div>
          ) : (
            <p className="text-ink-muted">No requirement notes recorded.</p>
          )}

          {lead?.site_address ? (
            <p>
              <span className="text-ink-muted">Site: </span>
              {lead.site_address}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {project.status === 'APPROVED' && canReview && approvedVersion ? (
        <Card>
          <CardHeader
            title="Design approved — hand over to execution"
            description="Choose the execution staff who will carry out this approved version."
            action={
              <StartExecutionDialog
                leadId={project.lead_id}
                approvedVersions={[
                  {
                    id: approvedVersion.id,
                    version_number: approvedVersion.version_number,
                    version_note: approvedVersion.version_note,
                  },
                ]}
                executionStaff={executionStaff}
                triggerLabel="Assign to execution"
              />
            }
          />
        </Card>
      ) : null}

      {siteVisits.length > 0 ? (
        <Card>
          <CardHeader title="Site visit notes" description="What the BDM found on site" />
          <CardBody className="space-y-3 p-0">
            <ul className="divide-y divide-line">
              {siteVisits.map((visit) => (
                <li key={visit.id} className="px-4 py-3 text-sm">
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(visit.scheduled_start_at)} · {visit.status.replace(/_/g, ' ').toLowerCase()}
                  </p>
                  {visit.requirement_summary ? (
                    <p className="mt-1 whitespace-pre-wrap">{visit.requirement_summary}</p>
                  ) : null}
                  {visit.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-ink-muted">{visit.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {canUpload ? (
        <Card>
          <CardHeader
            title="Upload a new version"
            description="Every upload creates a new version. Nothing is ever overwritten."
          />
          <CardBody>
            <FileUploader
              category="DESIGN_VERSION"
              designProjectId={project.id}
              maxSizeMb={settings.maxUploadSizeMb}
              showVersionNote
              label="Design file"
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Version history"
          description={`${typedVersions.length} ${typedVersions.length === 1 ? 'version' : 'versions'}`}
        />
        <CardBody className="p-0">
          {typedVersions.length === 0 ? (
            <EmptyState
              title="No versions yet"
              description={
                canUpload
                  ? 'Upload version 1 to get started.'
                  : 'The designer has not uploaded anything yet.'
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {typedVersions.map((version) => {
                const isApproved = project.approved_version_id === version.id;

                return (
                  <li key={version.id} className="space-y-3 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          Version {version.version_number}
                        </span>
                        {isApproved ? <Badge tone="ok">Current approved</Badge> : null}
                        <DesignVersionStatusBadge value={version.status} />
                      </div>
                      <span className="text-xs text-ink-muted">
                        {version.uploader?.full_name ?? 'Unknown'} ·{' '}
                        {formatDateTime(version.created_at)}
                      </span>
                    </div>

                    {version.version_note ? (
                      <p className="text-sm whitespace-pre-wrap text-ink">{version.version_note}</p>
                    ) : null}

                    {version.revision_notes ? (
                      <Alert tone="warn" title="Revision requested">
                        {version.revision_notes}
                      </Alert>
                    ) : null}

                    {version.file ? (
                      <FileList
                        files={[
                          {
                            ...version.file,
                            version_label: `v${version.version_number}`,
                            is_approved_version: isApproved,
                            uploader_name: version.uploader?.full_name ?? null,
                          },
                        ]}
                      />
                    ) : null}

                    <DesignVersionActions
                      versionId={version.id}
                      versionNumber={version.version_number}
                      status={version.status}
                      canSubmit={canUpload && version.uploaded_by === user.id}
                      canReview={canReview}
                      isOwnUpload={version.uploaded_by === user.id}
                      isAdmin={user.isAdmin}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
