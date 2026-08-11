import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { AppError, fail, statusForCode } from '@/lib/errors';
import { finalizeUploadSchema, parseOrThrow } from '@/lib/validation/schemas';
import { finalizeUpload, notifyVersionUploaded } from '@/server/services/files';

/**
 * Upload finalization (AGENTS.md §4.4 steps 6–7).
 *
 * Called after the browser has PUT the bytes straight to Tigris. The server
 * verifies the object really exists and matches what it authorized, then writes
 * the `files` row — and, for a design upload, the new immutable version.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json().catch(() => {
      throw new AppError('VALIDATION', 'Malformed request.');
    });

    const input = parseOrThrow(finalizeUploadSchema, body);
    const result = await finalizeUpload(user, input);

    if (result.designVersionId && result.file.design_project_id && result.versionNumber) {
      await notifyVersionUploaded(result.file.design_project_id, result.versionNumber);
      revalidatePath(`/designs/${result.file.design_project_id}`);
    }

    if (result.file.lead_id) revalidatePath(`/leads/${result.file.lead_id}`);
    if (result.file.site_visit_id) revalidatePath(`/site-visits/${result.file.site_visit_id}`);
    if (result.file.execution_project_id) {
      revalidatePath(`/execution/${result.file.execution_project_id}`);
    }

    return NextResponse.json({
      ok: true,
      file: {
        id: result.file.id,
        original_filename: result.file.original_filename,
        size_bytes: result.file.size_bytes,
        extension: result.file.extension,
      },
      designVersionId: result.designVersionId,
      versionNumber: result.versionNumber,
    });
  } catch (error) {
    logFinalizeFailure(error);
    const result = fail(error);
    return NextResponse.json(result, { status: statusForCode(result.ok ? 'INTERNAL' : result.code) });
  }
}

/**
 * Log database diagnostics server-side without ever logging the signed upload
 * token, storage URL, credentials, or request body.
 */
function logFinalizeFailure(error: unknown): void {
  const cause = error instanceof Error ? error.cause : undefined;
  const databaseCause = cause && typeof cause === 'object'
    ? cause as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }
    : null;

  console.error('[uploads/finalize] failed', {
    name: error instanceof Error ? error.name : 'UnknownError',
    code: error instanceof AppError ? error.code : undefined,
    message: error instanceof Error ? error.message : 'Unknown upload finalization failure',
    cause: databaseCause
      ? {
          code: typeof databaseCause.code === 'string' ? databaseCause.code : undefined,
          message: typeof databaseCause.message === 'string' ? databaseCause.message : undefined,
          details: typeof databaseCause.details === 'string' ? databaseCause.details : undefined,
          hint: typeof databaseCause.hint === 'string' ? databaseCause.hint : undefined,
        }
      : cause instanceof Error
        ? { name: cause.name, message: cause.message }
        : undefined,
  });
}
