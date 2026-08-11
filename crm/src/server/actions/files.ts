'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { actionResult, type ActionResult } from '@/lib/errors';
import { formDataToObject } from '@/lib/validation/common';
import { archiveFileSchema, parseOrThrow } from '@/lib/validation/schemas';
import { archiveFile as archiveFileService, getFileAccessUrl } from '@/server/services/files';

/**
 * File Server Actions.
 *
 * Presign and finalize are Route Handlers rather than actions, because the
 * browser must interleave them with a direct PUT to Tigris and needs plain JSON
 * responses. These two are the parts a form can drive.
 */

export async function archiveFileAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ fileId: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const input = parseOrThrow(archiveFileSchema, formDataToObject(formData));

    const file = await archiveFileService(user, input);

    if (file.lead_id) revalidatePath(`/leads/${file.lead_id}`);
    if (file.design_project_id) revalidatePath(`/designs/${file.design_project_id}`);
    if (file.execution_project_id) revalidatePath(`/execution/${file.execution_project_id}`);
    if (file.site_visit_id) revalidatePath(`/site-visits/${file.site_visit_id}`);

    return { fileId: file.id };
  });
}

/**
 * Mints a short-lived signed URL for one file.
 *
 * Returned to the client and used immediately — §15 forbids persisting a
 * generated URL, and the TTL is measured in a couple of minutes. Every call is
 * authorized afresh and written to the access log (§4.4 steps 8–9).
 */
export async function getFileUrlAction(
  fileId: string,
  action: 'PREVIEW' | 'DOWNLOAD',
): Promise<ActionResult<{ url: string; isOutdatedVersion: boolean; previewable: boolean }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const result = await getFileAccessUrl(user, fileId, action);

    return {
      url: result.url,
      isOutdatedVersion: result.isOutdatedVersion,
      previewable: result.previewable,
    };
  });
}
