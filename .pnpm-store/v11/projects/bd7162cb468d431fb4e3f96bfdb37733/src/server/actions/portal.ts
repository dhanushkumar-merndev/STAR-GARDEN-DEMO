'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { actionResult, type ActionResult } from '@/lib/errors';
import { formDataToObject } from '@/lib/validation/common';
import {
  grantPortalAccessSchema,
  parseOrThrow,
  revokePortalAccessSchema,
  sendStatusUpdateSchema,
} from '@/lib/validation/schemas';
import {
  grantPortalAccess as grantPortalAccessService,
  revokePortalAccess as revokePortalAccessService,
  sendStatusUpdate as sendStatusUpdateService,
} from '@/server/services/portal';

/**
 * Customer portal actions.
 *
 * All three are Admin-only. Granting access is what lets an address sign in at
 * all — the provisioning trigger reads `lead_portal_access` — so it is a real
 * access-control decision, not a preference.
 */

export async function grantPortalAccessAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ accessId: string; email: string }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(grantPortalAccessSchema, formDataToObject(formData));

    const access = await grantPortalAccessService(user, {
      lead_id: input.lead_id,
      email: input.email,
      is_primary: input.is_primary === true,
      send_invite: input.send_invite !== false,
    });

    revalidatePath(`/leads/${input.lead_id}`);
    return { accessId: access.id, email: access.email };
  });
}

export async function revokePortalAccessAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(revokePortalAccessSchema, formDataToObject(formData));

    await revokePortalAccessService(user, { access_id: input.access_id });

    revalidatePath(`/leads/${input.lead_id}`);
    return undefined;
  });
}

export async function sendStatusUpdateAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ sent: boolean; recipient: string }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(sendStatusUpdateSchema, formDataToObject(formData));

    const result = await sendStatusUpdateService(user, input);

    revalidatePath(`/leads/${input.lead_id}`);
    return result;
  });
}
