import { Badge, type Tone } from '@/components/ui';
import type {
  DesignStatus,
  DesignVersionStatus,
  ExecutionStatus,
  ExecutionTaskStatus,
  FollowUpStatus,
  LeadSource,
  LeadStatus,
  SiteVisitStatus,
} from '@/types/database';
import { LiveDueBadge } from '@/components/live-due-badge';
import { formatDue } from '@/lib/utils/format';

/**
 * Status rendering.
 *
 * One place decides what each enum value is called and how loud it looks, so
 * the same state never reads differently on two screens. Every badge carries a
 * written label — §16 forbids conveying status through colour alone.
 */

type Entry = { label: string; tone: Tone };

const LEAD: Record<LeadStatus, Entry> = {
  NEW: { label: 'New', tone: 'info' },
  UNASSIGNED: { label: 'Unassigned', tone: 'warn' },
  ASSIGNED: { label: 'Assigned', tone: 'brand' },
  CONTACTED: { label: 'Contacted', tone: 'brand' },
  FOLLOW_UP: { label: 'Follow-up', tone: 'info' },
  SITE_VISIT_SCHEDULED: { label: 'Visit scheduled', tone: 'info' },
  SITE_VISIT_COMPLETED: { label: 'Visit done', tone: 'brand' },
  QUALIFIED: { label: 'Qualified', tone: 'ok' },
  LOST: { label: 'Lost', tone: 'danger' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

const SITE_VISIT: Record<SiteVisitStatus, Entry> = {
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  RESCHEDULED: { label: 'Rescheduled', tone: 'warn' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand' },
  COMPLETED: { label: 'Completed', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  NO_SHOW: { label: 'No show', tone: 'danger' },
};

const DESIGN: Record<DesignStatus, Entry> = {
  NOT_REQUIRED: { label: 'Not required', tone: 'neutral' },
  REQUIRED: { label: 'Needs designer', tone: 'warn' },
  ASSIGNED: { label: 'Assigned', tone: 'brand' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand' },
  READY_FOR_REVIEW: { label: 'Ready for review', tone: 'info' },
  REVISION_REQUESTED: { label: 'Revision requested', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const DESIGN_VERSION: Record<DesignVersionStatus, Entry> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  READY_FOR_REVIEW: { label: 'Ready for review', tone: 'info' },
  REVISION_REQUESTED: { label: 'Revision requested', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral' },
};

const EXECUTION: Record<ExecutionStatus, Entry> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  ASSIGNED: { label: 'Assigned', tone: 'brand' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
  READY_FOR_REVIEW: { label: 'Ready for review', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const TASK: Record<ExecutionTaskStatus, Entry> = {
  TODO: { label: 'To do', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
  COMPLETED: { label: 'Done', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const FOLLOW_UP: Record<FollowUpStatus, Entry> = {
  OPEN: { label: 'Open', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
};

const SOURCE: Record<LeadSource, Entry> = {
  META_FACEBOOK: { label: 'Facebook', tone: 'info' },
  META_INSTAGRAM: { label: 'Instagram', tone: 'info' },
  WEBSITE: { label: 'Website', tone: 'brand' },
  MANUAL: { label: 'Manual', tone: 'neutral' },
  OTHER: { label: 'Other', tone: 'neutral' },
};

function make<T extends string>(map: Record<T, Entry>) {
  return function StatusBadge({ value }: { value: T }) {
    const entry = map[value] ?? { label: value, tone: 'neutral' as Tone };
    return <Badge tone={entry.tone}>{entry.label}</Badge>;
  };
}

export const LeadStatusBadge = make(LEAD);
export const SiteVisitStatusBadge = make(SITE_VISIT);
export const DesignStatusBadge = make(DESIGN);
export const DesignVersionStatusBadge = make(DESIGN_VERSION);
export const ExecutionStatusBadge = make(EXECUTION);
export const TaskStatusBadge = make(TASK);
export const FollowUpStatusBadge = make(FOLLOW_UP);
export const SourceBadge = make(SOURCE);

export const LEAD_STATUS_LABELS = LEAD;
export const EXECUTION_STATUS_LABELS = EXECUTION;
export const SITE_VISIT_STATUS_LABELS = SITE_VISIT;

/**
 * Due-date chip. Overdue reads as the word "Overdue", not as a red dot, so it
 * survives greyscale printing and colour-blind viewers (§16).
 */
export function DueBadge({
  label,
  tone,
  value,
}: {
  label?: string;
  tone?: 'overdue' | 'today' | 'upcoming' | 'none';
  value?: string | Date | null;
}) {
  if (value !== undefined) return <LiveDueBadge value={value} initialDue={formatDue(value)} />;
  const resolvedTone = tone ?? 'none';
  const map: Record<'overdue' | 'today' | 'upcoming' | 'none', Tone> = {
    overdue: 'danger',
    today: 'warn',
    upcoming: 'neutral',
    none: 'neutral',
  };
  return <Badge tone={map[resolvedTone]}>{label ?? 'No date'}</Badge>;
}
