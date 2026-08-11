import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, MapPin, Mail } from 'lucide-react';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { getLeadDetail, listActiveDesigners, listActiveExecutionStaff, listAssignableBdms } from '@/server/services/leads';
import { listApprovedVersionsForLead } from '@/server/services/execution';
import { getConfigOptions, getSettings } from '@/lib/settings';
import { canWriteLead, canAssignLeadToOthers } from '@/lib/permissions';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import {
  DesignStatusBadge,
  DueBadge,
  ExecutionStatusBadge,
  FollowUpStatusBadge,
  LeadStatusBadge,
  SiteVisitStatusBadge,
  SourceBadge,
} from '@/components/status';
import { AddNoteDialog, CallCustomerButton, LogCallDialog, MarkDesignRequiredForm } from '@/components/leads/call-controls';
import {
  AssignDesignerDialog,
  AssignLeadDialog,
  ChangeStatusDialog,
  CreateFollowUpDialog,
  ScheduleVisitDialog,
  StartExecutionDialog,
} from '@/components/leads/lead-dialogs';
import { CompleteFollowUpButton } from '@/components/leads/follow-up-actions';
import { FileList } from '@/components/files/file-list';
import { FileUploader } from '@/components/files/uploader';
import { formatDateTime, formatDue, humanizeEnum } from '@/lib/utils/format';
import { formatMobile, telHref } from '@/lib/utils/phone';
import type { CallOutcome } from '@/types/database';

export const metadata: Metadata = { title: 'Lead' };

/**
 * Lead detail with timeline (AGENTS.md §11.3, §16).
 *
 * §16 asks that owner, status and next action sit near the top of every lead —
 * they are the three things a BDM checks before doing anything else, so they go
 * above the fold on a phone, before the timeline.
 */
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const user = await requirePageUser();

  let detail;
  try {
    detail = await getLeadDetail(user, leadId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { lead, owner, activities, followUps, siteVisits, designProject, executionProject, files } =
    detail;

  const writable = canWriteLead(user, lead);
  const [lossReasons, settings, bdms, designers, executionStaff, approvedVersions] =
    await Promise.all([
      getConfigOptions('lost_reason'),
      getSettings(),
      canAssignLeadToOthers(user) ? listAssignableBdms() : Promise.resolve([]),
      writable ? listActiveDesigners() : Promise.resolve([]),
      writable ? listActiveExecutionStaff() : Promise.resolve([]),
      writable && designProject?.status === 'APPROVED'
        ? listApprovedVersionsForLead(user, leadId).catch(() => [])
        : Promise.resolve([]),
    ]);

  const mobile = formatMobile(lead.mobile_country_code, lead.mobile_normalized);
  const due = formatDue(lead.next_action_at);
  const openFollowUps = followUps.filter((f) => f.status === 'OPEN' || f.status === 'OVERDUE');

  return (
    <div className="space-y-4">
      <div>
        <Link href="/leads" className="text-sm text-ink-muted hover:text-ink">
          ← All leads
        </Link>
      </div>

      {/* Identity and the three facts §16 wants first. */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {lead.customer_name}
              </h1>
              <p className="mt-0.5 text-sm text-ink-muted">{lead.lead_code}</p>
            </div>
            <LeadStatusBadge value={lead.status} />
          </div>

          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex items-baseline gap-2">
              <dt className="shrink-0 text-ink-muted">Owner</dt>
              <dd className="font-medium text-ink">{owner?.full_name ?? 'Unassigned'}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="shrink-0 text-ink-muted">Next action</dt>
              <dd>
                {lead.next_action_at ? (
                  <DueBadge label={due.label} tone={due.tone} />
                ) : (
                  <Badge tone="warn">Nothing scheduled</Badge>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-1.5">
            <SourceBadge value={lead.source} />
            {lead.design_required ? <Badge tone="info">Design required</Badge> : null}
            {lead.lost_reason ? <Badge tone="danger">Lost: {lead.lost_reason}</Badge> : null}
          </div>

          {!lead.next_action_at && lead.status !== 'LOST' && lead.status !== 'CLOSED' ? (
            <Alert tone="warn" title="This lead has no next action">
              Log a call or schedule a follow-up so it does not go quiet.
            </Alert>
          ) : null}

          {writable ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <CallCustomerButton leadId={lead.id} telHref={telHref(lead.mobile_country_code, lead.mobile_normalized)} displayNumber={mobile} />
              <LogCallDialog leadId={lead.id} currentStatus={lead.status} lossReasons={lossReasons} />
            </div>
          ) : null}

          <p className="text-xs text-ink-subtle">
            Calls go through your own phone and SIM. The CRM records only what you enter afterwards.
          </p>
        </CardBody>
      </Card>

      {/* Contact and requirement */}
      <Card>
        <CardHeader
          title="Contact and requirement"
          action={
            writable ? (
              <Link href={`/leads/${lead.id}/edit`}>
                <Button size="sm" variant="ghost">
                  Edit
                </Button>
              </Link>
            ) : null
          }
        />
        <CardBody className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <span className="text-ink-muted">Mobile</span>
            <a href={telHref(lead.mobile_country_code, lead.mobile_normalized)} className="font-medium text-brand-700">
              {mobile}
            </a>
          </p>
          {lead.email ? (
            <p className="flex items-center gap-2">
              <Mail className="size-4 text-ink-subtle" />
              <a href={`mailto:${lead.email}`} className="text-brand-700">
                {lead.email}
              </a>
            </p>
          ) : null}
          {lead.location_text || lead.site_address ? (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
              <span>{lead.site_address ?? lead.location_text}</span>
            </p>
          ) : null}
          {lead.requirement_summary ? (
            <div className="rounded-lg bg-surface-muted p-3">
              <p className="text-xs font-medium text-ink-muted">Requirement</p>
              <p className="mt-1 whitespace-pre-wrap">{lead.requirement_summary}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {writable ? (
        <Card>
          <CardHeader title="Actions" />
          <CardBody className="flex flex-wrap gap-2">
            {canAssignLeadToOthers(user) ? (
              <AssignLeadDialog leadId={lead.id} bdms={bdms} currentOwnerId={lead.assigned_bdm_id} />
            ) : null}
            <ChangeStatusDialog leadId={lead.id} currentStatus={lead.status} lossReasons={lossReasons} />
            <CreateFollowUpDialog leadId={lead.id} assignees={bdms} />
            <ScheduleVisitDialog
              leadId={lead.id}
              designers={designers}
              defaultAddress={lead.site_address ?? lead.location_text}
            />
            <AddNoteDialog leadId={lead.id} />
          </CardBody>
        </Card>
      ) : null}

      {/* Follow-ups */}
      <Card>
        <CardHeader title="Follow-ups" description={`${openFollowUps.length} open`} />
        <CardBody className="p-0">
          {followUps.length === 0 ? (
            <EmptyState title="No follow-ups yet" description="Create one so this lead has a next action." />
          ) : (
            <ul className="divide-y divide-line">
              {followUps.map((followUp) => {
                const followUpDue = formatDue(followUp.due_at);
                return (
                  <li key={followUp.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{followUp.title}</p>
                      <p className="text-xs text-ink-muted">
                        {followUp.notes ? `${followUp.notes} · ` : ''}
                        {formatDateTime(followUp.due_at)}
                      </p>
                    </div>
                    <FollowUpStatusBadge value={followUp.status} />
                    {followUp.status !== 'COMPLETED' && followUp.status !== 'CANCELLED' ? (
                      <>
                        <DueBadge label={followUpDue.label} tone={followUpDue.tone} />
                        <CompleteFollowUpButton followUpId={followUp.id} />
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Site visits */}
      <Card>
        <CardHeader title="Site visits" />
        <CardBody className="p-0">
          {siteVisits.length === 0 ? (
            <EmptyState title="No visits scheduled" />
          ) : (
            <ul className="divide-y divide-line">
              {siteVisits.map((visit) => (
                <li key={visit.id}>
                  <Link
                    href={`/site-visits/${visit.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {formatDateTime(visit.scheduled_start_at)}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{visit.address ?? 'No address'}</p>
                    </div>
                    <SiteVisitStatusBadge value={visit.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Design */}
      <Card>
        <CardHeader
          title="Landscape design"
          action={designProject ? <DesignStatusBadge value={designProject.status} /> : null}
        />
        <CardBody className="space-y-3">
          {designProject ? (
            <>
              <p className="text-sm">
                <span className="text-ink-muted">Designer: </span>
                <span className="font-medium text-ink">
                  {(designProject as { designer?: { full_name: string } | null }).designer?.full_name ??
                    'Not assigned'}
                </span>
              </p>
              {designProject.due_at ? (
                <p className="text-sm text-ink-muted">Due {formatDateTime(designProject.due_at)}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Link href={`/designs/${designProject.id}`}>
                  <Button size="sm" variant="secondary">
                    Open design project
                  </Button>
                </Link>
                {writable ? (
                  <AssignDesignerDialog
                    leadId={lead.id}
                    designers={designers}
                    currentDesignerId={designProject.assigned_designer_id}
                    defaultRequirement={designProject.requirement_notes ?? lead.requirement_summary}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <>
              {writable ? <MarkDesignRequiredForm leadId={lead.id} designRequired={lead.design_required} /> : null}
              {lead.design_required && writable ? (
                <AssignDesignerDialog
                  leadId={lead.id}
                  designers={designers}
                  currentDesignerId={null}
                  defaultRequirement={lead.requirement_summary}
                />
              ) : (
                <p className="text-sm text-ink-muted">
                  Mark this lead as needing a design to assign a landscape designer.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Execution */}
      <Card>
        <CardHeader
          title="Execution"
          action={executionProject ? <ExecutionStatusBadge value={executionProject.status} /> : null}
        />
        <CardBody className="space-y-3">
          {executionProject ? (
            <>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${executionProject.progress_percent}%` }}
                  />
                </div>
                <span className="text-sm font-medium tabular-nums text-ink-muted">
                  {executionProject.progress_percent}%
                </span>
              </div>
              {executionProject.blocker_summary ? (
                <Alert tone="danger" title="Blocked">
                  {executionProject.blocker_summary}
                </Alert>
              ) : null}
              <Link href={`/execution/${executionProject.id}`}>
                <Button size="sm" variant="secondary">
                  Open execution project
                </Button>
              </Link>
            </>
          ) : writable ? (
            <StartExecutionDialog
              leadId={lead.id}
              approvedVersions={approvedVersions}
              executionStaff={executionStaff}
            />
          ) : (
            <p className="text-sm text-ink-muted">Execution has not started.</p>
          )}
        </CardBody>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader title="Attachments" description="Customer and site documents" />
        <CardBody className="space-y-4">
          <FileList files={files} canArchive={writable} emptyMessage="No attachments yet." />
          {writable ? (
            <div className="border-t border-line pt-4">
              <FileUploader
                category="LEAD_ATTACHMENT"
                leadId={lead.id}
                maxSizeMb={settings.maxUploadSizeMb}
                label="Add an attachment"
              />
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader title="Timeline" description={`${activities.length} entries`} />
        <CardBody className="p-0">
          {activities.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <ol className="divide-y divide-line">
              {activities.map((activity) => {
                const author = (activity as { created_by_profile?: { full_name: string } | null })
                  .created_by_profile;
                const isAttempt = activity.type === 'CALL_ATTEMPT';

                return (
                  <li key={activity.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={isAttempt ? 'neutral' : 'brand'}>
                        {humanizeEnum(activity.type)}
                      </Badge>
                      {activity.outcome ? (
                        <Badge tone={outcomeTone(activity.outcome)}>
                          {humanizeEnum(activity.outcome)}
                        </Badge>
                      ) : null}
                      <span className="text-xs text-ink-muted">
                        {formatDateTime(activity.activity_at)}
                        {author ? ` · ${author.full_name}` : ''}
                      </span>
                    </div>

                    {activity.notes ? (
                      <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{activity.notes}</p>
                    ) : null}

                    {activity.next_action ? (
                      <p className="mt-1 text-xs text-ink-muted">
                        <span className="font-medium">Next:</span> {activity.next_action}
                      </p>
                    ) : null}

                    {isAttempt ? (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-subtle">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        Dialler opened. This is not proof the call connected.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function outcomeTone(outcome: CallOutcome) {
  switch (outcome) {
    case 'CONNECTED':
    case 'INTERESTED':
      return 'ok' as const;
    case 'NOT_INTERESTED':
    case 'INVALID_NUMBER':
      return 'danger' as const;
    default:
      return 'warn' as const;
  }
}
