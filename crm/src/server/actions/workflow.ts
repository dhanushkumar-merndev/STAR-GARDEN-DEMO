'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { actionResult, type ActionResult } from '@/lib/errors';
import { formDataToObject } from '@/lib/validation/common';
import {
  approveVersionSchema,
  assignDesignerSchema,
  cancelFollowUpSchema,
  cancelSiteVisitSchema,
  checkInSchema,
  checkOutSchema,
  completeFollowUpSchema,
  completeSiteVisitSchema,
  createExecutionProjectSchema,
  createFollowUpSchema,
  markVersionReadySchema,
  parseOrThrow,
  requestRevisionSchema,
  rescheduleSiteVisitSchema,
  scheduleSiteVisitSchema,
  updateExecutionStatusSchema,
  updateTaskStatusSchema,
  upsertExecutionTaskSchema,
} from '@/lib/validation/schemas';
import {
  cancelFollowUp as cancelFollowUpService,
  completeFollowUp as completeFollowUpService,
  createFollowUp as createFollowUpService,
} from '@/server/services/follow-ups';
import {
  cancelSiteVisit as cancelSiteVisitService,
  checkIn as checkInService,
  checkOut as checkOutService,
  completeSiteVisit as completeSiteVisitService,
  rescheduleSiteVisit as rescheduleSiteVisitService,
  scheduleSiteVisit as scheduleSiteVisitService,
} from '@/server/services/site-visits';
import {
  approveVersion as approveVersionService,
  assignDesigner as assignDesignerService,
  markVersionReady as markVersionReadyService,
  requestRevision as requestRevisionService,
} from '@/server/services/designs';
import {
  createExecutionProject as createExecutionProjectService,
  updateExecutionStatus as updateExecutionStatusService,
  updateTaskStatus as updateTaskStatusService,
  upsertExecutionTask as upsertExecutionTaskService,
} from '@/server/services/execution';

/**
 * Server Actions for the follow-up, site-visit, design and execution workflows.
 *
 * Grouped in one module because they share the same revalidation surface — a
 * design approval changes the lead page, the design queue and two dashboards —
 * and keeping those lists together makes it obvious when one is missed.
 */

/* -------------------------------------------------------------------------- */
/* Follow-ups                                                                  */
/* -------------------------------------------------------------------------- */

export async function createFollowUpAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ followUpId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(createFollowUpSchema, formDataToObject(formData));

    const followUp = await createFollowUpService(user, input);

    revalidatePath(`/leads/${input.lead_id}`);
    revalidatePath('/follow-ups');
    revalidatePath('/dashboard');

    return { followUpId: followUp.id };
  });
}

export async function completeFollowUpAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(completeFollowUpSchema, formDataToObject(formData));

    const followUp = await completeFollowUpService(user, input);

    revalidatePath(`/leads/${followUp.lead_id}`);
    revalidatePath('/follow-ups');
    revalidatePath('/dashboard');

    return { leadId: followUp.lead_id };
  });
}

export async function cancelFollowUpAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(cancelFollowUpSchema, formDataToObject(formData));

    const followUp = await cancelFollowUpService(user, input);

    revalidatePath(`/leads/${followUp.lead_id}`);
    revalidatePath('/follow-ups');

    return { leadId: followUp.lead_id };
  });
}

/* -------------------------------------------------------------------------- */
/* Site visits                                                                 */
/* -------------------------------------------------------------------------- */

export async function scheduleSiteVisitAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ siteVisitId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(scheduleSiteVisitSchema, formDataToObject(formData));

    const visit = await scheduleSiteVisitService(user, input);

    revalidatePath(`/leads/${input.lead_id}`);
    revalidatePath('/site-visits');
    revalidatePath('/dashboard');

    return { siteVisitId: visit.id };
  });
}

export async function rescheduleSiteVisitAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ siteVisitId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(rescheduleSiteVisitSchema, formDataToObject(formData));

    const visit = await rescheduleSiteVisitService(user, input);

    revalidatePath(`/site-visits/${visit.id}`);
    revalidatePath(`/leads/${visit.lead_id}`);
    revalidatePath('/site-visits');

    return { siteVisitId: visit.id };
  });
}

/**
 * Check-in (§8.3).
 *
 * Coordinates arrive only when the browser prompt was accepted. The form
 * submits without them otherwise, and that is a valid check-in — location is
 * opt-in and visit-scoped (§15, §18).
 */
export async function checkInAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ siteVisitId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(checkInSchema, formDataToObject(formData));

    const visit = await checkInService(user, input);

    revalidatePath(`/site-visits/${visit.id}`);
    revalidatePath('/site-visits');

    return { siteVisitId: visit.id };
  });
}

export async function checkOutAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ siteVisitId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(checkOutSchema, formDataToObject(formData));

    const visit = await checkOutService(user, input);

    revalidatePath(`/site-visits/${visit.id}`);
    revalidatePath('/site-visits');

    return { siteVisitId: visit.id };
  });
}

export async function completeSiteVisitAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ siteVisitId: string; leadId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(completeSiteVisitSchema, formDataToObject(formData));

    const visit = await completeSiteVisitService(user, input);

    revalidatePath(`/site-visits/${visit.id}`);
    revalidatePath(`/leads/${visit.lead_id}`);
    revalidatePath('/site-visits');
    revalidatePath('/dashboard');

    return { siteVisitId: visit.id, leadId: visit.lead_id };
  });
}

export async function cancelSiteVisitAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ siteVisitId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(cancelSiteVisitSchema, formDataToObject(formData));

    const visit = await cancelSiteVisitService(user, input);

    revalidatePath(`/site-visits/${visit.id}`);
    revalidatePath(`/leads/${visit.lead_id}`);
    revalidatePath('/site-visits');

    return { siteVisitId: visit.id };
  });
}

/* -------------------------------------------------------------------------- */
/* Design                                                                      */
/* -------------------------------------------------------------------------- */

export async function assignDesignerAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ designProjectId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(assignDesignerSchema, formDataToObject(formData));

    const project = await assignDesignerService(user, input);

    revalidatePath(`/leads/${input.lead_id}`);
    revalidatePath('/designs');
    revalidatePath('/dashboard');

    return { designProjectId: project.id };
  });
}

export async function markVersionReadyAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ designProjectId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(markVersionReadySchema, formDataToObject(formData));

    const version = await markVersionReadyService(user, input);

    revalidatePath(`/designs/${version.design_project_id}`);
    revalidatePath('/designs');
    revalidatePath('/dashboard');

    return { designProjectId: version.design_project_id };
  });
}

export async function requestRevisionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ designProjectId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(requestRevisionSchema, formDataToObject(formData));

    const version = await requestRevisionService(user, input);

    revalidatePath(`/designs/${version.design_project_id}`);
    revalidatePath('/designs');
    revalidatePath('/dashboard');

    return { designProjectId: version.design_project_id };
  });
}

export async function approveVersionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ designProjectId: string; versionNumber: number }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(approveVersionSchema, formDataToObject(formData));

    const version = await approveVersionService(user, input);

    revalidatePath(`/designs/${version.design_project_id}`);
    revalidatePath('/designs');
    revalidatePath('/execution');
    revalidatePath('/dashboard');

    return {
      designProjectId: version.design_project_id,
      versionNumber: version.version_number,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                   */
/* -------------------------------------------------------------------------- */

export async function createExecutionProjectAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ executionProjectId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(createExecutionProjectSchema, formDataToObject(formData));

    const project = await createExecutionProjectService(user, {
      lead_id: input.lead_id,
      approved_design_version_id: input.approved_design_version_id,
      title: input.title,
      planned_start_at: input.planned_start_at,
      due_at: input.due_at,
      assignee_ids: input.assignee_ids,
      use_template: input.use_template ?? true,
    });

    revalidatePath(`/leads/${input.lead_id}`);
    revalidatePath('/execution');
    revalidatePath('/dashboard');

    return { executionProjectId: project.id };
  });
}

export async function updateExecutionStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ executionProjectId: string; status: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(updateExecutionStatusSchema, formDataToObject(formData));

    const project = await updateExecutionStatusService(user, input);

    revalidatePath(`/execution/${project.id}`);
    revalidatePath('/execution');
    revalidatePath('/dashboard');

    return { executionProjectId: project.id, status: project.status };
  });
}

export async function upsertExecutionTaskAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ taskId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(upsertExecutionTaskSchema, formDataToObject(formData));

    const task = await upsertExecutionTaskService(user, input);

    revalidatePath(`/execution/${input.execution_project_id}`);
    revalidatePath('/execution');

    return { taskId: task.id };
  });
}

export async function updateTaskStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ taskId: string; projectId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(updateTaskStatusSchema, formDataToObject(formData));

    const task = await updateTaskStatusService(user, input);

    revalidatePath(`/execution/${task.execution_project_id}`);
    revalidatePath('/execution');
    revalidatePath('/dashboard');

    return { taskId: task.id, projectId: task.execution_project_id };
  });
}
