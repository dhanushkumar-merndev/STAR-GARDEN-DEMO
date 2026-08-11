'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { actionResult, type ActionResult } from '@/lib/errors';
import { canCreateLead } from '@/lib/permissions';
import { AppError } from '@/lib/errors';
import {
  addNoteSchema,
  assignLeadSchema,
  changeLeadStatusSchema,
  createLeadSchema,
  logCallSchema,
  parseOrThrow,
  recordCallAttemptSchema,
  setDesignRequiredSchema,
  updateLeadSchema,
} from '@/lib/validation/schemas';
import { formDataToObject } from '@/lib/validation/common';
import {
  assignLead as assignLeadService,
  changeLeadStatus as changeLeadStatusService,
  createManualLead,
  setDesignRequired as setDesignRequiredService,
  updateLead as updateLeadService,
} from '@/server/services/leads';
import {
  addNote as addNoteService,
  logCallOutcome as logCallOutcomeService,
  recordCallAttempt as recordCallAttemptService,
} from '@/server/services/activities';

/**
 * Lead Server Actions.
 *
 * Each one does the same four things in the same order, deliberately:
 *   1. establish who is calling, from the verified session — never from input
 *   2. parse the payload through the shared Zod schema
 *   3. delegate to a service that re-checks authorization against the record
 *   4. revalidate the affected routes
 *
 * Failures come back as typed results so forms can show a field-level message
 * instead of crashing into an error boundary.
 */

export async function createLeadAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string; leadCode: string }>> {
  return actionResult(async () => {
    const user = await requireUser();

    if (!canCreateLead(user)) {
      throw new AppError('FORBIDDEN', 'Your role cannot create leads.');
    }

    const input = parseOrThrow(createLeadSchema, formDataToObject(formData));
    const { lead } = await createManualLead(user, input);

    revalidatePath('/leads');
    revalidatePath('/dashboard');

    return { leadId: lead.id, leadCode: lead.lead_code };
  });
}

export async function updateLeadAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(updateLeadSchema, formDataToObject(formData));

    const lead = await updateLeadService(user, {
      lead_id: input.lead_id,
      customer_name: input.customer_name,
      mobile: input.mobile,
      email: input.email,
      location_text: input.location_text,
      site_address: input.site_address,
      requirement_summary: input.requirement_summary,
      next_action_at: input.next_action_at,
    });

    revalidatePath(`/leads/${lead.id}`);
    revalidatePath('/leads');

    return { leadId: lead.id };
  });
}

export async function assignLeadAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(assignLeadSchema, formDataToObject(formData));

    const lead = await assignLeadService(user, input);

    revalidatePath(`/leads/${lead.id}`);
    revalidatePath('/leads');
    revalidatePath('/dashboard');

    return { leadId: lead.id };
  });
}

export async function changeLeadStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string; status: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(changeLeadStatusSchema, formDataToObject(formData));

    const lead = await changeLeadStatusService(user, input);

    revalidatePath(`/leads/${lead.id}`);
    revalidatePath('/leads');
    revalidatePath('/dashboard');

    return { leadId: lead.id, status: lead.status };
  });
}

/**
 * Records that the dialler was opened (§6.1 step 3).
 *
 * The `tel:` navigation itself happens in the browser; this only leaves a
 * timestamped trace that an attempt was made. It asserts nothing about whether
 * the call connected (§6.3).
 */
export async function recordCallAttemptAction(
  formData: FormData,
): Promise<ActionResult<{ activityId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(recordCallAttemptSchema, formDataToObject(formData));

    const activity = await recordCallAttemptService(user, input.lead_id);
    revalidatePath(`/leads/${input.lead_id}`);

    return { activityId: activity.id };
  });
}

export async function logCallAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string; followUpId: string | null }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(logCallSchema, formDataToObject(formData));

    const result = await logCallOutcomeService(user, input);

    revalidatePath(`/leads/${input.lead_id}`);
    revalidatePath('/leads');
    revalidatePath('/follow-ups');
    revalidatePath('/dashboard');

    return { leadId: input.lead_id, followUpId: result.followUpId };
  });
}

export async function addNoteAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ activityId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(addNoteSchema, formDataToObject(formData));

    const activity = await addNoteService(user, input);
    revalidatePath(`/leads/${input.lead_id}`);

    return { activityId: activity.id };
  });
}

export async function setDesignRequiredAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(setDesignRequiredSchema, formDataToObject(formData));

    const lead = await setDesignRequiredService(user, input);
    revalidatePath(`/leads/${lead.id}`);

    return { leadId: lead.id };
  });
}
