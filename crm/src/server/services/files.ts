import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit, recordFileAccess } from '@/lib/audit';
import { notify, NotificationCopy } from '@/lib/notifications';
import { getUploadTokenSecret } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import {
  assertCanReadDesignProject,
  assertCanReadExecutionProject,
  assertCanReadFile,
  assertCanReadLead,
  assertCanReadSiteVisit,
} from '@/lib/permissions/guards';
import { canArchiveFile, canUploadCategory, canUploadDesignVersion } from '@/lib/permissions';
import {
  buildObjectKey,
  FileValidationError,
  isPreviewable,
  safeResponseContentType,
  validateUpload,
} from '@/lib/utils/files';
import {
  deleteOrphanObject,
  presignRead,
  presignUpload,
  statObject,
  storageConfigured,
} from '@/lib/tigris';
import type { SessionUser } from '@/lib/auth/session';
import type { FileCategory, FileRow } from '@/types/database';

/**
 * The upload / preview / download pipeline (AGENTS.md §4.4, §5).
 *
 * Bytes never pass through this server: the browser PUTs straight to Tigris
 * with a short-lived signature, then calls finalize. That split creates one
 * problem worth solving carefully — between presign and finalize, the only
 * thing carrying the server's decision is whatever the client hands back.
 *
 * So the presign step issues a **signed upload token**: an HMAC over the exact
 * object key, category, parent ids, size and content type the server approved.
 * Finalize verifies the signature and uses only the token's contents. A client
 * that edits any field, reuses a token, or waits out the expiry is rejected —
 * it cannot smuggle a file into another lead's record, or record a 2 KB upload
 * as a 40 MB design (§4.4 steps 2–7).
 */

const TOKEN_TTL_SECONDS = 15 * 60;

interface UploadClaim {
  /** Pre-generated so the object key and the database id always match. */
  fileId: string;
  objectKey: string;
  category: FileCategory;
  originalFilename: string;
  safeFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  userId: string;
  leadId?: string;
  siteVisitId?: string;
  designProjectId?: string;
  executionProjectId?: string;
  executionTaskId?: string;
  /** Unix seconds. */
  exp: number;
}

function signClaim(claim: UploadClaim): string {
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signature = createHmac('sha256', getUploadTokenSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyClaim(token: string, userId: string): UploadClaim {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw new AppError('VALIDATION', 'Upload session is not valid. Start the upload again.');
  }

  const expected = createHmac('sha256', getUploadTokenSecret()).update(payload).digest('base64url');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('FORBIDDEN', 'Upload session signature does not match.');
  }

  let claim: UploadClaim;
  try {
    claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadClaim;
  } catch {
    throw new AppError('VALIDATION', 'Upload session is not readable.');
  }

  if (claim.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError('VALIDATION', 'Upload session expired. Start the upload again.');
  }

  // The token is bound to the user it was issued to.
  if (claim.userId !== userId) {
    throw new AppError('FORBIDDEN', 'This upload session belongs to another user.');
  }

  return claim;
}

/* -------------------------------------------------------------------------- */
/* Step 1–4: authorize and presign                                             */
/* -------------------------------------------------------------------------- */

export interface AuthorizeUploadInput {
  filename: string;
  mime_type: string;
  size_bytes: number;
  category: FileCategory;
  lead_id?: string;
  site_visit_id?: string;
  design_project_id?: string;
  execution_project_id?: string;
  execution_task_id?: string;
}

export interface AuthorizedUpload {
  uploadUrl: string;
  headers: Record<string, string>;
  uploadToken: string;
  objectKey: string;
  expiresInSeconds: number;
}

export async function authorizeUpload(
  user: SessionUser,
  input: AuthorizeUploadInput,
): Promise<AuthorizedUpload> {
  if (!storageConfigured()) {
    throw new AppError(
      'NOT_CONFIGURED',
      'File storage is not configured yet. Ask an Admin to add the Tigris credentials.',
    );
  }

  // (a) Is this role allowed to upload this kind of file at all? (§5.5)
  if (!canUploadCategory(user, input.category)) {
    throw new AppError('FORBIDDEN', 'Your role cannot upload this kind of file.');
  }

  // (b) Does this user have access to the parent record? (§4.4 step 2)
  const parent = await resolveAndAuthorizeParent(user, input);

  // (c) Filename, type and size (§4.4 step 3, §5.3).
  const { maxUploadSizeMb } = await getSettings();

  let validated;
  try {
    validated = validateUpload({
      filename: input.filename,
      mimeType: input.mime_type,
      sizeBytes: input.size_bytes,
      maxSizeMb: maxUploadSizeMb,
    });
  } catch (error) {
    if (error instanceof FileValidationError) {
      throw new AppError('VALIDATION', error.message, { fields: { file: error.message } });
    }
    throw error;
  }

  const fileId = crypto.randomUUID();

  const objectKey = buildObjectKey({
    category: input.category,
    fileId,
    safeFilename: validated.safeFilename,
    leadId: parent.leadId,
    designProjectId: parent.designProjectId,
    versionNumber: parent.nextVersionNumber,
    executionProjectId: parent.executionProjectId,
    executionTaskId: parent.executionTaskId,
    siteVisitId: parent.siteVisitId,
  });

  // (d) Mint the signature (§4.4 step 4).
  const presigned = await presignUpload(objectKey, validated.mimeType);

  const claim: UploadClaim = {
    fileId,
    objectKey,
    category: input.category,
    originalFilename: input.filename,
    safeFilename: validated.safeFilename,
    mimeType: validated.mimeType,
    extension: validated.extension,
    sizeBytes: validated.sizeBytes,
    userId: user.id,
    leadId: parent.leadId ?? undefined,
    siteVisitId: parent.siteVisitId ?? undefined,
    designProjectId: parent.designProjectId ?? undefined,
    executionProjectId: parent.executionProjectId ?? undefined,
    executionTaskId: parent.executionTaskId ?? undefined,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  return {
    uploadUrl: presigned.url,
    headers: presigned.headers,
    uploadToken: signClaim(claim),
    objectKey,
    expiresInSeconds: presigned.expiresInSeconds,
  };
}

interface ResolvedParent {
  leadId: string | null;
  siteVisitId: string | null;
  designProjectId: string | null;
  executionProjectId: string | null;
  executionTaskId: string | null;
  nextVersionNumber: number | null;
}

/**
 * Walks to the parent record and runs that parent's own guard.
 *
 * Nothing here trusts the id the browser sent beyond using it as a lookup key —
 * the guards decide whether this user may reach the row it names (§7.5).
 */
async function resolveAndAuthorizeParent(
  user: SessionUser,
  input: AuthorizeUploadInput,
): Promise<ResolvedParent> {
  const supabase = await createClient();

  if (input.design_project_id) {
    const { project } = await assertCanReadDesignProject(user, input.design_project_id);

    if (input.category === 'DESIGN_VERSION' && !canUploadDesignVersion(user, project)) {
      throw new AppError(
        'FORBIDDEN',
        project.status === 'APPROVED'
          ? 'This design is already approved. No further versions can be uploaded.'
          : 'Only the assigned designer can upload a version.',
      );
    }

    // The key embeds the version number this upload will become (§5.4).
    const { data: last } = await supabase
      .from('design_versions')
      .select('version_number')
      .eq('design_project_id', input.design_project_id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      leadId: project.lead_id,
      siteVisitId: null,
      designProjectId: project.id,
      executionProjectId: null,
      executionTaskId: null,
      nextVersionNumber: (last?.version_number ?? 0) + 1,
    };
  }

  if (input.execution_task_id) {
    const { data: task } = await supabase
      .from('execution_tasks')
      .select('id, execution_project_id')
      .eq('id', input.execution_task_id)
      .maybeSingle();

    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    const { project } = await assertCanReadExecutionProject(user, task.execution_project_id);

    return {
      leadId: null,
      siteVisitId: null,
      designProjectId: null,
      executionProjectId: project.id,
      executionTaskId: task.id,
      nextVersionNumber: null,
    };
  }

  if (input.execution_project_id) {
    const { project } = await assertCanReadExecutionProject(user, input.execution_project_id);
    return {
      leadId: null,
      siteVisitId: null,
      designProjectId: null,
      executionProjectId: project.id,
      executionTaskId: null,
      nextVersionNumber: null,
    };
  }

  if (input.site_visit_id) {
    const { visit } = await assertCanReadSiteVisit(user, input.site_visit_id);
    return {
      leadId: null,
      siteVisitId: visit.id,
      designProjectId: null,
      executionProjectId: null,
      executionTaskId: null,
      nextVersionNumber: null,
    };
  }

  if (input.lead_id) {
    const lead = await assertCanReadLead(user, input.lead_id);
    return {
      leadId: lead.id,
      siteVisitId: null,
      designProjectId: null,
      executionProjectId: null,
      executionTaskId: null,
      nextVersionNumber: null,
    };
  }

  throw new AppError('VALIDATION', 'An upload must belong to a lead, visit, design or project.');
}

/* -------------------------------------------------------------------------- */
/* Step 6–7: finalize                                                          */
/* -------------------------------------------------------------------------- */

export interface FinalizeResult {
  file: FileRow;
  designVersionId: string | null;
  versionNumber: number | null;
}

/**
 * Confirms the object landed and records it (§4.4 steps 6–7).
 *
 * The size is taken from Tigris, not from the client, and compared against what
 * the server approved. A mismatch means the browser uploaded something other
 * than what was validated, so the object is deleted and nothing is recorded —
 * §5.1's rule that storage and metadata must not diverge, applied at the one
 * moment they can.
 */
export async function finalizeUpload(
  user: SessionUser,
  input: { upload_token: string; checksum?: string; version_note?: string },
): Promise<FinalizeResult> {
  const claim = verifyClaim(input.upload_token, user.id);

  const stat = await statObject(claim.objectKey);
  if (!stat) {
    throw new AppError('NOT_FOUND', 'The upload did not complete. Please try again.');
  }

  if (stat.sizeBytes === 0) {
    await deleteOrphanObject(claim.objectKey);
    throw new AppError('VALIDATION', 'The uploaded file is empty.');
  }

  if (stat.sizeBytes !== claim.sizeBytes) {
    await deleteOrphanObject(claim.objectKey);
    throw new AppError(
      'VALIDATION',
      'The uploaded file does not match what was authorized. Please try again.',
    );
  }

  const supabase = await createClient();

  const { data: file, error } = await supabase
    .from('files')
    .insert({
      id: claim.fileId,
      category: claim.category,
      object_key: claim.objectKey,
      original_filename: claim.originalFilename,
      safe_filename: claim.safeFilename,
      mime_type: claim.mimeType,
      extension: claim.extension,
      size_bytes: stat.sizeBytes,
      checksum: input.checksum ?? stat.etag ?? null,
      lead_id: claim.leadId ?? null,
      site_visit_id: claim.siteVisitId ?? null,
      design_project_id: claim.designProjectId ?? null,
      execution_project_id: claim.executionProjectId ?? null,
      execution_task_id: claim.executionTaskId ?? null,
      uploaded_by: user.id,
    })
    .select('*')
    .single();

  if (error || !file) {
    // No database row means the bytes are unreferenced. Remove them rather than
    // leave an orphan behind (§5.1).
    await deleteOrphanObject(claim.objectKey);
    throw new AppError('INTERNAL', 'Could not record the uploaded file.', { cause: error });
  }

  let designVersionId: string | null = null;
  let versionNumber: number | null = null;

  // A design upload always creates a NEW immutable version row (§5.6).
  if (claim.category === 'DESIGN_VERSION' && claim.designProjectId) {
    const { data: version, error: versionError } = await supabase
      .from('design_versions')
      .insert({
        design_project_id: claim.designProjectId,
        file_id: file.id,
        version_note: input.version_note ?? null,
        status: 'DRAFT',
        uploaded_by: user.id,
      })
      .select('id, version_number, design_project_id')
      .single();

    if (versionError || !version) {
      throw new AppError('INTERNAL', 'The file uploaded, but the version could not be recorded.', {
        cause: versionError,
      });
    }

    designVersionId = version.id;
    versionNumber = version.version_number;

    await supabase
      .from('design_projects')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', claim.designProjectId)
      .in('status', ['ASSIGNED', 'REVISION_REQUESTED']);
  }

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.FILE_UPLOADED,
    entityType: 'file',
    entityId: file.id,
    after: {
      category: file.category,
      original_filename: file.original_filename,
      size_bytes: file.size_bytes,
      design_version_id: designVersionId,
      version_number: versionNumber,
    },
  });

  return { file, designVersionId, versionNumber };
}

/* -------------------------------------------------------------------------- */
/* Step 8–9: read access                                                       */
/* -------------------------------------------------------------------------- */

export interface FileAccessResult {
  url: string;
  expiresInSeconds: number;
  previewable: boolean;
  filename: string;
  /** True when this file is NOT the currently approved design version (§16). */
  isOutdatedVersion: boolean;
}

/**
 * Mints a short-lived read URL after re-checking authorization (§4.4 step 8).
 *
 * Called on every single view or download — there is no caching of URLs, and
 * §15 forbids storing one. Each call is written to the audit trail and the file
 * access log (§4.4 step 9).
 */
export async function getFileAccessUrl(
  user: SessionUser,
  fileId: string,
  action: 'PREVIEW' | 'DOWNLOAD',
): Promise<FileAccessResult> {
  const file = await assertCanReadFile(user, fileId);

  if (file.is_archived && !user.isAdmin) {
    throw new AppError('NOT_FOUND', 'This file has been archived.');
  }

  const previewable = isPreviewable(file.extension);

  // Asking to preview something that cannot be previewed is a client bug, but
  // serving it inline would let a browser render an unexpected type. Force the
  // safe path instead (§5.2).
  const effectiveAction = action === 'PREVIEW' && !previewable ? 'DOWNLOAD' : action;

  const { url, expiresInSeconds } = await presignRead(file.object_key, {
    disposition: effectiveAction === 'PREVIEW' ? 'inline' : 'attachment',
    filename: file.original_filename,
    contentType: safeResponseContentType(file.extension, file.mime_type),
  });

  // §16: warn when downloading a version that is not the approved one.
  const isOutdatedVersion = await isNonApprovedDesignFile(file);

  await recordFileAccess({
    fileId: file.id,
    userId: user.id,
    action: effectiveAction,
    fileName: file.original_filename,
    isApprovedVersion: file.category === 'DESIGN_VERSION' ? !isOutdatedVersion : undefined,
  });

  return {
    url,
    expiresInSeconds,
    previewable,
    filename: file.original_filename,
    isOutdatedVersion,
  };
}

async function isNonApprovedDesignFile(file: FileRow): Promise<boolean> {
  if (file.category !== 'DESIGN_VERSION' || !file.design_project_id) return false;

  const supabase = await createClient();

  const [{ data: version }, { data: project }] = await Promise.all([
    supabase.from('design_versions').select('id, status').eq('file_id', file.id).maybeSingle(),
    supabase
      .from('design_projects')
      .select('approved_version_id')
      .eq('id', file.design_project_id)
      .maybeSingle(),
  ]);

  if (!version) return false;
  if (!project?.approved_version_id) return true;
  return project.approved_version_id !== version.id;
}

/* -------------------------------------------------------------------------- */
/* Archive (soft delete, §5.1)                                                 */
/* -------------------------------------------------------------------------- */

export async function archiveFile(
  user: SessionUser,
  input: { file_id: string; reason?: string },
): Promise<FileRow> {
  const file = await assertCanReadFile(user, input.file_id);

  if (!canArchiveFile(user, file)) {
    throw new AppError(
      'FORBIDDEN',
      file.category === 'DESIGN_VERSION'
        ? 'Design history cannot be removed. Ask an Admin if this is genuinely wrong.'
        : 'You can only archive files you uploaded.',
    );
  }

  const supabase = await createClient();

  const { data: archived, error } = await supabase
    .from('files')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: user.id,
    })
    .eq('id', input.file_id)
    .select('*')
    .single();

  if (error || !archived) {
    throw new AppError('INTERNAL', 'Could not archive the file.', { cause: error });
  }

  // Deliberately soft: the object stays in Tigris so an Admin-controlled
  // cleanup can reconcile the two stores later (§5.1).
  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.FILE_ARCHIVED,
    entityType: 'file',
    entityId: archived.id,
    before: { is_archived: false },
    after: { is_archived: true, reason: input.reason ?? null },
  });

  return archived;
}

/** Notifies the reviewer that a new version landed. Used after finalize. */
export async function notifyVersionUploaded(
  designProjectId: string,
  versionNumber: number,
): Promise<void> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('design_projects')
    .select('lead_id, lead:leads!design_projects_lead_id_fkey(lead_code, assigned_bdm_id)')
    .eq('id', designProjectId)
    .maybeSingle();

  const lead = project?.lead as unknown as
    | { lead_code: string; assigned_bdm_id: string | null }
    | null;

  if (!lead?.assigned_bdm_id) return;

  await notify({
    userId: lead.assigned_bdm_id,
    ...NotificationCopy.designReadyForReview(lead.lead_code, versionNumber),
    title: 'New design version uploaded',
    entityType: 'design_project',
    entityId: designProjectId,
  });
}
