import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  LuArrowLeft,
  LuClipboardList,
  LuMail,
  LuMapPin,
  LuMessageCircle,
  LuPhone,
  LuTriangleAlert,
} from 'react-icons/lu';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { getLeadDetail, listActiveDesigners, listActiveExecutionStaff, listAssignableBdms } from '@/server/services/leads';
import { listApprovedVersionsForLead } from '@/server/services/execution';
import { getBusinessSettings, getConfigOptions } from '@/lib/settings';
import { listPortalAccess } from '@/server/services/portal';
import { renderWhatsappMessage, whatsappChatUrl } from '@/lib/utils/whatsapp';
import { DispositionButtons } from '@/components/leads/disposition';
import { PortalAccessPanel } from '@/components/leads/portal-access';
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
import { AddNoteDialog, CallCustomerButton } from '@/components/leads/call-controls';
import { CompleteVisitDialog, RescheduleVisitDialog } from '@/components/site-visits/visit-controls';
import {
  AssignLeadDialog,
  CreateFollowUpDialog,
  ScheduleVisitDialog,
  StartDesignFromVisitButton,
  StartExecutionDialog,
} from '@/components/leads/lead-dialogs';
import { CompleteFollowUpButton } from '@/components/leads/follow-up-actions';
import { formatDateTime, formatDue, humanizeEnum } from '@/lib/utils/format';
import { formatMobile, telHref } from '@/lib/utils/phone';
import type { CallOutcome } from '@/types/database';

export const metadata: Metadata = { title: 'Lead' };

type LeadDetailTab =
  | 'details'
  | 'follow-ups'
  | 'visits'
  | 'design'
  | 'execution'
  | 'timeline'
  | 'customer-access';

const LEAD_DETAIL_TABS: { id: LeadDetailTab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'follow-ups', label: 'Follow-ups' },
  { id: 'visits', label: 'Site visits' },
  { id: 'design', label: 'Landscape design' },
  { id: 'execution', label: 'Execution' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'customer-access', label: 'Customer access' },
];

function isLeadDetailTab(value: string | undefined): value is LeadDetailTab {
  return LEAD_DETAIL_TABS.some((tab) => tab.id === value);
}

/**
 * Lead detail with timeline (AGENTS.md §11.3, §16).
 *
 * §16 asks that owner, status and next action sit near the top of every lead —
 * they are the three things a BDM checks before doing anything else, so they go
 * above the fold on a phone, before the timeline.
 */
export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { leadId } = await params;
  const { tab } = await searchParams;
  const activeTab = isLeadDetailTab(tab) ? tab : 'details';
  const user = await requirePageUser();

  let detail;
  try {
    detail = await getLeadDetail(user, leadId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { lead, owner, activities, followUps, siteVisits, designProject, executionProject } =
    detail;

  const writable = canWriteLead(user, lead);
  const [
    lossReasons,
    business,
    bdms,
    designers,
    executionStaff,
    approvedVersions,
    portalGrants,
  ] = await Promise.all([
    getConfigOptions('lost_reason'),
    getBusinessSettings(),
    canAssignLeadToOthers(user) ? listAssignableBdms() : Promise.resolve([]),
    writable ? listActiveDesigners() : Promise.resolve([]),
    writable ? listActiveExecutionStaff() : Promise.resolve([]),
    writable && designProject?.status === 'APPROVED'
      ? listApprovedVersionsForLead(user, leadId).catch(() => [])
      : Promise.resolve([]),
    // Customer access is an Admin surface; a BDM sees the lead but not who can
    // watch it.
    user.isAdmin ? listPortalAccess(user, leadId).catch(() => []) : Promise.resolve([]),
  ]);

  const mobile = formatMobile(lead.mobile_country_code, lead.mobile_normalized);

  // Null when no business WhatsApp number is configured, which hides every
  // WhatsApp button rather than rendering one that opens an error.
  const whatsappUrl = whatsappChatUrl({
    countryCode: lead.mobile_country_code,
    nationalNumber: lead.mobile_normalized,
    message: renderWhatsappMessage(business.whatsappTemplate, {
      customerName: lead.customer_name,
      businessName: business.name,
      leadCode: lead.lead_code,
    }),
  });

  // Keep the recorded call decision visible even on a lost/closed lead. It is
  // read-only there, rather than disappearing and making it look as though no
  // outcome was recorded.
  const showDisposition = writable;
  const due = formatDue(lead.next_action_at);
  const openFollowUps = followUps.filter((f) => f.status === 'OPEN' || f.status === 'OVERDUE');
  const latestCallOutcome = activities.find(
    (activity) => activity.type === 'CALL_OUTCOME' && activity.outcome,
  )?.outcome as CallOutcome | undefined;
  // The *current* call decision controls whether a new phase can begin. A
  // much older Interested outcome must not keep the delivery tabs open after
  // a later No answer / Switched off result.
  const hasInterest = latestCallOutcome === 'INTERESTED';
  const hasCompletedVisit = siteVisits.some((visit) => visit.status === 'COMPLETED');
  const completedVisitWithDesigner = siteVisits.find(
    (visit) => visit.status === 'COMPLETED' && visit.assigned_designer_id,
  );
  const completedVisitDesigner = completedVisitWithDesigner
    ? designers.find((designer) => designer.id === completedVisitWithDesigner.assigned_designer_id) ?? null
    : null;
  const isTerminalLead = lead.status === 'LOST' || lead.status === 'CLOSED';
  const canStartSiteVisit = hasInterest && !isTerminalLead;
  const canStartDesign = canStartSiteVisit && hasCompletedVisit;
  const canStartExecution = canStartDesign && designProject?.status === 'APPROVED';
  const hasCompletedSiteVisit = user.isAdmin && siteVisits.some((visit) => visit.status === 'COMPLETED');
  const hasDesignReadyForReview = user.isAdmin && designProject?.status === 'READY_FOR_REVIEW';

  return (
    <div className="space-y-4">
      <div>
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <LuArrowLeft className="size-4" />
          All leads
        </Link>
      </div>

      {/* Identity and the three facts §16 wants first. */}
      <Card className="overflow-hidden">
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
            {latestCallOutcome ? (
              <Badge tone={outcomeTone(latestCallOutcome)}>
                Last call: {humanizeEnum(latestCallOutcome)}
              </Badge>
            ) : null}
            {lead.design_required ? <Badge tone="info">Design required</Badge> : null}
            {lead.status === 'LOST' && lead.lost_reason ? (
              <Badge tone="danger">Lost: {lead.lost_reason}</Badge>
            ) : null}
          </div>

          {!lead.next_action_at && lead.status !== 'LOST' && lead.status !== 'CLOSED' ? (
            hasInterest ? (
              <Alert tone="ok" title="Customer is interested — schedule the site visit next">
                <Link href={`/leads/${lead.id}?tab=visits`} className="font-medium underline underline-offset-2">
                  Open Site visits
                </Link>{' '}
                to book the visit and continue the workflow.
              </Alert>
            ) : (
              <Alert tone="warn" title="This lead has no next action">
                Log a call or schedule a follow-up so it does not go quiet.
              </Alert>
            )
          ) : null}

          {writable ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <CallCustomerButton leadId={lead.id} telHref={telHref(lead.mobile_country_code, lead.mobile_normalized)} displayNumber={mobile} />
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center justify-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-4 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-100"
                >
                  <LuMessageCircle className="size-4" />
                  WhatsApp customer
                </a>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <nav
        aria-label="Lead sections"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
      >
        {LEAD_DETAIL_TABS.filter((tab) => user.isAdmin || tab.id !== 'customer-access').map((tab) => {
          const selected = activeTab === tab.id;
          const locked =
            (tab.id === 'visits' && !canStartSiteVisit && siteVisits.length === 0) ||
            (tab.id === 'design' && !canStartDesign && !designProject) ||
            (tab.id === 'execution' && !canStartExecution && !executionProject);
          const needsAttention =
            (tab.id === 'visits' && hasCompletedSiteVisit) ||
            (tab.id === 'design' && hasDesignReadyForReview);
          const lockMessage =
            tab.id === 'visits'
              ? 'Record Interested after a call to unlock site visits.'
              : tab.id === 'design'
                ? 'Complete a site visit to unlock landscape design.'
                : 'Approve a landscape design to unlock execution.';

          if (locked) {
            return (
              <span
                key={tab.id}
                aria-disabled="true"
                title={lockMessage}
                className="shrink-0 cursor-not-allowed rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm font-medium text-ink-subtle"
              >
                {tab.label}
              </span>
            );
          }

          return (
            <Link
              key={tab.id}
              href={`/leads/${lead.id}?tab=${tab.id}`}
              aria-current={selected ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-brand-600 text-white'
                  : 'border border-line bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink'
              }`}
            >
              <span>{tab.label}</span>
              {needsAttention ? (
                <span
                  aria-label={tab.id === 'design' ? 'Design ready for review' : 'Completed site visit'}
                  className="size-2 rounded-full bg-danger"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Contact and requirement */}
      {activeTab === 'details' ? <>
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
        <CardBody className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <LuPhone className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-muted">Mobile</p>
              <a href={telHref(lead.mobile_country_code, lead.mobile_normalized)} className="block truncate text-sm font-semibold text-brand-700 hover:underline">
                {mobile}
              </a>
            </div>
          </div>
          {lead.email ? (
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <LuMail className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink-muted">Email</p>
                <a href={`mailto:${lead.email}`} className="block truncate text-sm font-medium text-brand-700 hover:underline">
                  {lead.email}
                </a>
              </div>
            </div>
          ) : null}
          {lead.location_text || lead.site_address ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.site_address ?? lead.location_text ?? '')}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${lead.site_address ?? lead.location_text} in Google Maps`}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <LuMapPin className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink-muted">Site location</p>
                <p className="truncate text-sm font-medium text-brand-700 underline-offset-2 hover:underline">{lead.site_address ?? lead.location_text}</p>
              </div>
            </a>
          ) : null}
          </div>
          {lead.requirement_summary ? (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
              <div className="flex items-center gap-2 text-brand-800">
                <LuClipboardList className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-wide">Requirement</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{lead.requirement_summary}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* The decision, before the toolbox. After a call this is the only thing
          the Admin needs, and burying it among eight secondary buttons is what
          makes leads go quiet. */}
      {showDisposition ? (
        <Card>
          <CardHeader
            title="After the call"
            description="Record what the customer said — this drives what happens next."
          />
          <CardBody>
            <DispositionButtons
              leadId={lead.id}
              customerName={lead.customer_name}
              lostReasons={lossReasons}
              selectedOutcome={latestCallOutcome ?? null}
              readOnly={isTerminalLead}
              allowReopen={lead.status === 'LOST' && user.isAdmin}
            />
          </CardBody>
        </Card>
      ) : null}

      </> : null}

      {activeTab === 'customer-access' && user.isAdmin ? (
        <Card>
          <CardHeader
            title="Customer access"
            description="Let the customer follow their own project, read-only."
          />
          <CardBody>
            <PortalAccessPanel
              leadId={lead.id}
              customerName={lead.customer_name}
              leadEmail={lead.email}
              grants={portalGrants}
              portalEnabled={business.clientPortalEnabled}
            />
          </CardBody>
        </Card>
      ) : null}

      {activeTab === 'details' && writable ? (
        <Card>
          <CardHeader title="Actions" />
          <CardBody className="flex flex-wrap gap-2">
            {canAssignLeadToOthers(user) && bdms.length > 0 ? (
              <AssignLeadDialog leadId={lead.id} bdms={bdms} currentOwnerId={lead.assigned_bdm_id} />
            ) : null}
            <AddNoteDialog leadId={lead.id} />
          </CardBody>
        </Card>
      ) : null}

      {/* Follow-ups */}
      {activeTab === 'follow-ups' ? <Card>
        <CardHeader
          title="Follow-ups"
          description={`${openFollowUps.length} open`}
          action={writable ? <CreateFollowUpDialog leadId={lead.id} assignees={bdms} /> : null}
        />
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
      </Card> : null}

      {/* Site visits */}
      {activeTab === 'visits' ? <>
      {isTerminalLead ? (
        <Alert tone="neutral" title="This lead is no longer active">
          Site visits cannot be started after a lead is marked {lead.status === 'LOST' ? 'Not interested' : 'Closed'}.
        </Alert>
      ) : !hasInterest ? (
        <Alert tone="neutral" title="Site visits are locked">
          Record the customer as Interested after a call to schedule the site visit.
        </Alert>
      ) : null}
      <Card>
        <CardHeader title="Site details" description="Customer location and requirement" />
        <CardBody className="space-y-3 text-sm">
          {lead.site_address || lead.location_text ? (
            <p className="flex items-start gap-2">
              <LuMapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
              <span>{lead.site_address ?? lead.location_text}</span>
            </p>
          ) : (
            <p className="text-ink-muted">No site address has been added yet.</p>
          )}
          {lead.requirement_summary ? (
            <div className="rounded-lg bg-surface-muted p-3">
              <p className="text-xs font-medium text-ink-muted">Requirement</p>
              <p className="mt-1 whitespace-pre-wrap">{lead.requirement_summary}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Site visits"
          description={siteVisits.length ? `${siteVisits.length} visit${siteVisits.length === 1 ? '' : 's'} for this lead. Earlier visits stay in the history.` : undefined}
          action={
            writable && canStartSiteVisit ? (
              <ScheduleVisitDialog
                leadId={lead.id}
                designers={designers}
                defaultAddress={lead.site_address ?? lead.location_text}
                triggerLabel={siteVisits.length > 0 ? 'Schedule re-visit' : 'Schedule visit'}
              />
            ) : null
          }
        />
        <CardBody className="p-0">
          {siteVisits.length === 0 ? (
            <EmptyState title="No visits scheduled" />
          ) : (
            <ul className="divide-y divide-line">
              {siteVisits.map((visit, index) => {
                const visitNumber = siteVisits.length - index;
                const visitLabel = visitNumber === 1 ? 'Visit 1' : `Re-visit ${visitNumber - 1}`;
                return (
                <li key={visit.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <Link
                    href={`/site-visits/${visit.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand-700"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-ink">
                        <span>{visitLabel}</span>
                        <span className="text-ink-muted">{formatDateTime(visit.scheduled_start_at)}</span>
                      </p>
                      <p className="truncate text-xs text-ink-muted">{visit.address ?? 'No address'}</p>
                    </div>
                    <SiteVisitStatusBadge value={visit.status} />
                  </Link>
                  {user.isAdmin ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {visit.status === 'IN_PROGRESS' ? (
                        <CompleteVisitDialog siteVisitId={visit.id} triggerLabel="Approve visit" />
                      ) : null}
                      {visit.status === 'SCHEDULED' || visit.status === 'RESCHEDULED' ? (
                        <RescheduleVisitDialog siteVisitId={visit.id} />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      </> : null}

      {/* Design */}
      {activeTab === 'design' ? <Card>
        <CardHeader
          title="Landscape design"
          action={designProject ? <DesignStatusBadge value={designProject.status} /> : null}
        />
        <CardBody className="space-y-3">
          {isTerminalLead ? (
            <Alert tone="neutral" title="This lead is no longer active">
              Landscape design cannot be started after a lead is marked {lead.status === 'LOST' ? 'Not interested' : 'Closed'}.
            </Alert>
          ) : !hasInterest ? (
            <Alert tone="neutral" title="Landscape design is locked">
              Record an Interested call outcome first. Then complete the site visit to unlock design work.
            </Alert>
          ) : !hasCompletedVisit ? (
            <Alert tone="neutral" title="Waiting for the site visit">
              Complete the scheduled site visit before assigning the Landscape Designer.
            </Alert>
          ) : designProject ? (
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
                    {user.isAdmin ? 'Review design files' : 'Open design & upload files'}
                  </Button>
                </Link>
              </div>
              {hasDesignReadyForReview ? (
                <Alert tone="warn" title="Design ready for your review">
                  Open the design project to preview the uploaded version, then approve it or request a revision.
                </Alert>
              ) : null}
            </>
          ) : (
            <>
              {writable && canStartDesign && completedVisitDesigner ? (
                <div className="space-y-2">
                  <p className="text-sm text-ink-muted">
                    The Landscape Designer who attended the visit is ready to receive this design.
                  </p>
                  <StartDesignFromVisitButton
                    leadId={lead.id}
                    designerName={completedVisitDesigner.full_name}
                  />
                </div>
              ) : (
                <Alert tone="neutral" title="No visiting designer is recorded">
                  This completed visit has no Landscape Designer saved. Schedule a re-visit with the designer so the handoff can happen automatically.
                </Alert>
              )}
            </>
          )}
        </CardBody>
      </Card> : null}

      {/* Execution */}
      {activeTab === 'execution' ? <Card>
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
          ) : isTerminalLead ? (
            <Alert tone="neutral" title="This lead is no longer active">
              Execution cannot be started after a lead is marked {lead.status === 'LOST' ? 'Not interested' : 'Closed'}.
            </Alert>
          ) : !hasInterest ? (
            <Alert tone="neutral" title="Execution is locked">
              Complete the design phase and approve a design version before starting execution.
            </Alert>
          ) : designProject?.status !== 'APPROVED' ? (
            <Alert tone="neutral" title="Waiting for approved design">
              Execution unlocks when the Landscape Designer&apos;s version is approved.
            </Alert>
          ) : writable && canStartExecution ? (
            <StartExecutionDialog
              leadId={lead.id}
              approvedVersions={approvedVersions}
              executionStaff={executionStaff}
            />
          ) : (
            <p className="text-sm text-ink-muted">Execution has not started.</p>
          )}
        </CardBody>
      </Card> : null}

      {/* Timeline */}
      {activeTab === 'timeline' ? <Card>
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
                        <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                        Dialler opened. This is not proof the call connected.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card> : null}
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
