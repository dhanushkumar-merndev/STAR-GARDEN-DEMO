/**
 * Status transition rules (AGENTS.md §9).
 *
 * "Validate transitions server-side. Do not permit arbitrary direct jumps when
 * required data or approvals are missing."
 *
 * Each machine is a plain adjacency map plus, where the spec demands it, a
 * requirement check. Pure and side-effect free so §20.1's "status transition
 * validation" tests can drive them directly.
 */

import { AppError } from '@/lib/errors';
import type {
  DesignStatus,
  DesignVersionStatus,
  ExecutionStatus,
  ExecutionTaskStatus,
  FollowUpStatus,
  LeadStatus,
  SiteVisitStatus,
} from '@/types/database';

type Transitions<S extends string> = Record<S, readonly S[]>;

/* -------------------------------------------------------------------------- */
/* Lead (§9.1)                                                                 */
/* -------------------------------------------------------------------------- */

export const LEAD_TRANSITIONS: Transitions<LeadStatus> = {
  NEW: ['UNASSIGNED', 'ASSIGNED', 'LOST', 'CLOSED'],
  UNASSIGNED: ['ASSIGNED', 'LOST', 'CLOSED'],
  // Re-assignment keeps the status at ASSIGNED, so it is its own successor.
  ASSIGNED: ['ASSIGNED', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT_SCHEDULED', 'QUALIFIED', 'LOST', 'CLOSED'],
  CONTACTED: ['CONTACTED', 'FOLLOW_UP', 'SITE_VISIT_SCHEDULED', 'QUALIFIED', 'LOST', 'CLOSED'],
  FOLLOW_UP: ['CONTACTED', 'FOLLOW_UP', 'SITE_VISIT_SCHEDULED', 'QUALIFIED', 'LOST', 'CLOSED'],
  SITE_VISIT_SCHEDULED: ['SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'FOLLOW_UP', 'LOST', 'CLOSED'],
  SITE_VISIT_COMPLETED: ['QUALIFIED', 'FOLLOW_UP', 'SITE_VISIT_SCHEDULED', 'LOST', 'CLOSED'],
  QUALIFIED: ['QUALIFIED', 'FOLLOW_UP', 'CLOSED', 'LOST'],
  // Reopening a dead lead is an Admin decision, gated in the service layer.
  LOST: ['ASSIGNED', 'FOLLOW_UP'],
  CLOSED: ['ASSIGNED', 'FOLLOW_UP'],
};

export const SITE_VISIT_TRANSITIONS: Transitions<SiteVisitStatus> = {
  SCHEDULED: ['RESCHEDULED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  RESCHEDULED: ['RESCHEDULED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: ['RESCHEDULED'],
  NO_SHOW: ['RESCHEDULED', 'CANCELLED'],
};

export const DESIGN_TRANSITIONS: Transitions<DesignStatus> = {
  NOT_REQUIRED: ['REQUIRED'],
  REQUIRED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ASSIGNED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'CANCELLED'],
  IN_PROGRESS: ['READY_FOR_REVIEW', 'CANCELLED'],
  READY_FOR_REVIEW: ['REVISION_REQUESTED', 'APPROVED', 'CANCELLED'],
  REVISION_REQUESTED: ['IN_PROGRESS', 'READY_FOR_REVIEW', 'CANCELLED'],
  // Approval is the end of the design workflow. Only cancellation follows.
  APPROVED: ['CANCELLED'],
  CANCELLED: [],
};

export const DESIGN_VERSION_TRANSITIONS: Transitions<DesignVersionStatus> = {
  DRAFT: ['READY_FOR_REVIEW'],
  READY_FOR_REVIEW: ['REVISION_REQUESTED', 'APPROVED'],
  // A revision produces a NEW version; this one stays as history (§5.6).
  REVISION_REQUESTED: ['SUPERSEDED'],
  APPROVED: ['SUPERSEDED'],
  SUPERSEDED: [],
};

export const EXECUTION_TRANSITIONS: Transitions<ExecutionStatus> = {
  NOT_STARTED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'READY_FOR_REVIEW', 'COMPLETED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  READY_FOR_REVIEW: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const EXECUTION_TASK_TRANSITIONS: Transitions<ExecutionTaskStatus> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'COMPLETED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: ['TODO'],
};

export const FOLLOW_UP_TRANSITIONS: Transitions<FollowUpStatus> = {
  OPEN: ['COMPLETED', 'CANCELLED', 'OVERDUE'],
  OVERDUE: ['COMPLETED', 'CANCELLED', 'OPEN'],
  COMPLETED: [],
  CANCELLED: ['OPEN'],
};

/* -------------------------------------------------------------------------- */
/* Checking                                                                    */
/* -------------------------------------------------------------------------- */

export function canTransition<S extends string>(
  map: Transitions<S>,
  from: S,
  to: S,
): boolean {
  if (from === to) return (map[from] ?? []).includes(to);
  return (map[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(
  map: Transitions<S>,
  from: S,
  to: S,
  label: string,
): void {
  if (!canTransition(map, from, to)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `${label} cannot move from ${from.replace(/_/g, ' ').toLowerCase()} to ${to
        .replace(/_/g, ' ')
        .toLowerCase()}.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Required-data rules — the "no arbitrary jumps" half of §9                   */
/* -------------------------------------------------------------------------- */

export interface LeadTransitionContext {
  lostReason?: string | null;
  hasContactActivity?: boolean;
  hasApprovedDesign?: boolean;
}

/**
 * Lead transitions that need more than a legal edge.
 *
 * LOST demands a reason; the database enforces this too, but catching it here
 * produces a field-level form error instead of a constraint violation.
 */
export function assertLeadTransition(
  from: LeadStatus,
  to: LeadStatus,
  context: LeadTransitionContext = {},
): void {
  assertTransition(LEAD_TRANSITIONS, from, to, 'Lead');

  if (to === 'LOST' && !context.lostReason?.trim()) {
    throw new AppError('VALIDATION', 'A reason is required to mark a lead lost.', {
      fields: { lost_reason: 'Select or enter why this lead was lost.' },
    });
  }

  // Qualification is a judgement made after speaking to the customer, so there
  // must be at least one recorded contact behind it (§8.2).
  if (to === 'QUALIFIED' && context.hasContactActivity === false) {
    throw new AppError(
      'INVALID_TRANSITION',
      'Record a call outcome or a completed site visit before marking this lead qualified.',
    );
  }
}

export function assertSiteVisitTransition(
  from: SiteVisitStatus,
  to: SiteVisitStatus,
  context: { hasCheckIn?: boolean; cancellationReason?: string | null } = {},
): void {
  assertTransition(SITE_VISIT_TRANSITIONS, from, to, 'Site visit');

  if (to === 'CANCELLED' && !context.cancellationReason?.trim()) {
    throw new AppError('VALIDATION', 'A reason is required to cancel a site visit.', {
      fields: { cancellation_reason: 'Say why the visit was cancelled.' },
    });
  }
}

export function assertDesignTransition(
  from: DesignStatus,
  to: DesignStatus,
  context: { hasVersions?: boolean; approvedVersionId?: string | null } = {},
): void {
  assertTransition(DESIGN_TRANSITIONS, from, to, 'Design project');

  if (to === 'READY_FOR_REVIEW' && context.hasVersions === false) {
    throw new AppError(
      'INVALID_TRANSITION',
      'Upload at least one design version before marking the project ready for review.',
    );
  }

  if (to === 'APPROVED' && !context.approvedVersionId) {
    throw new AppError(
      'INVALID_TRANSITION',
      'Approval must identify one exact design version.',
    );
  }
}

export interface ExecutionCompletionContext {
  outstandingMandatoryTasks: number;
  overrideReason?: string | null;
  isAdmin: boolean;
  blockerSummary?: string | null;
}

/**
 * Execution completion (§8.5 step 6): every mandatory task complete, or an
 * Admin override carrying a stated reason.
 */
export function assertExecutionTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
  context: ExecutionCompletionContext,
): void {
  assertTransition(EXECUTION_TRANSITIONS, from, to, 'Execution project');

  if (to === 'BLOCKED' && !context.blockerSummary?.trim()) {
    throw new AppError('VALIDATION', 'Describe the blocker before marking the project blocked.', {
      fields: { blocker_summary: 'What is blocking this project?' },
    });
  }

  if (to !== 'COMPLETED') return;

  if (context.outstandingMandatoryTasks === 0) return;

  if (!context.isAdmin) {
    throw new AppError(
      'INVALID_TRANSITION',
      `${context.outstandingMandatoryTasks} mandatory task(s) are still open. ` +
        'Complete them, or ask an Admin to override with a reason.',
    );
  }

  if (!context.overrideReason?.trim()) {
    throw new AppError('VALIDATION', 'An override reason is required to close with open tasks.', {
      fields: { completion_override_reason: 'State why the project is being closed early.' },
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Derived lead status                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The status a lead should move to after a call outcome, when the BDM has not
 * chosen one explicitly. Returns null to leave the status untouched.
 */
export function leadStatusForCallOutcome(
  current: LeadStatus,
  outcome: string,
): LeadStatus | null {
  // Terminal states are never reopened as a side effect of logging a call.
  if (current === 'LOST' || current === 'CLOSED') return null;

  switch (outcome) {
    case 'NOT_INTERESTED':
      return null; // The BDM must mark LOST explicitly, with a reason.
    case 'INTERESTED':
    case 'CONNECTED':
      return current === 'ASSIGNED' || current === 'NEW' || current === 'UNASSIGNED'
        ? 'CONTACTED'
        : null;
    case 'CALL_LATER':
    case 'NO_ANSWER':
    case 'BUSY':
    case 'SWITCHED_OFF':
      return current === 'ASSIGNED' || current === 'NEW' || current === 'UNASSIGNED'
        ? 'CONTACTED'
        : null;
    default:
      return null;
  }
}
