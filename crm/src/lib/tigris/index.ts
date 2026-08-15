import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '@/lib/errors';
import { getTigrisEnv, isTigrisConfigured } from '@/lib/env';

/**
 * Tigris object storage (AGENTS.md §4.3).
 *
 * The bucket is private and stays private. Nothing in this module ever returns
 * a durable URL: reads and writes are both short-lived presigned signatures
 * minted per request, after the caller's authorization has been checked, and
 * §15 forbids persisting a generated URL anywhere.
 *
 * Credentials are read lazily so the app builds and boots before the owner has
 * filled them in.
 */

let cachedClient: S3Client | null = null;
let cachedFingerprint = '';

function client(): { s3: S3Client; bucket: string; uploadTtl: number; downloadTtl: number } {
  if (!isTigrisConfigured()) {
    throw new AppError(
      'NOT_CONFIGURED',
      'File storage is not configured yet. Add the Tigris credentials from crm/.env.example.',
    );
  }

  const env = getTigrisEnv();
  const fingerprint = `${env.endpoint}|${env.region}|${env.accessKeyId}|${env.bucket}`;

  // Rebuild if the credentials changed under us (e.g. a hot reload after an
  // .env edit), otherwise reuse the connection pool.
  if (!cachedClient || cachedFingerprint !== fingerprint) {
    cachedClient = new S3Client({
      region: env.region,
      endpoint: env.endpoint,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });
    cachedFingerprint = fingerprint;
  }

  return {
    s3: cachedClient,
    bucket: env.bucket,
    uploadTtl: env.uploadTtlSeconds,
    downloadTtl: env.downloadTtlSeconds,
  };
}

export function storageConfigured(): boolean {
  return isTigrisConfigured();
}

/* -------------------------------------------------------------------------- */
/* Upload                                                                      */
/* -------------------------------------------------------------------------- */

export interface PresignedUpload {
  url: string;
  objectKey: string;
  /** Headers the browser MUST send, or the signature will not match. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * Mints a PUT signature for one object (§4.4 step 4).
 *
 * `Content-Type` is part of the signature, so the browser cannot upload a
 * different type from the one the server validated and recorded. Size is not
 * signable in a plain PUT — `headObject()` verifies it at finalize time
 * instead, before any database row is written.
 */
export async function presignUpload(
  objectKey: string,
  contentType: string,
): Promise<PresignedUpload> {
  const { s3, bucket, uploadTtl } = client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: uploadTtl });

  return {
    url,
    objectKey,
    headers: { 'Content-Type': contentType },
    expiresInSeconds: uploadTtl,
  };
}

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

export interface PresignReadOptions {
  /** `inline` previews in the browser; `attachment` forces a download (§5.2). */
  disposition: 'inline' | 'attachment';
  /** Filename the browser should use when saving. */
  filename: string;
  /** Content type to respond with. Non-previewable types are neutralised. */
  contentType: string;
}

/**
 * Mints a short-lived GET signature (§4.4 step 8).
 *
 * Response headers are overridden per request rather than baked into the stored
 * object, so the same bytes can be previewed or downloaded without a second
 * copy, and a download-only format can never be coerced into rendering.
 */
export async function presignRead(
  objectKey: string,
  options: PresignReadOptions,
): Promise<{ url: string; expiresInSeconds: number }> {
  const { s3, bucket, downloadTtl } = client();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentType: options.contentType,
    ResponseContentDisposition: `${options.disposition}; filename="${sanitizeHeaderFilename(
      options.filename,
    )}"`,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: downloadTtl });
  return { url, expiresInSeconds: downloadTtl };
}

/* -------------------------------------------------------------------------- */
/* Verification and cleanup                                                    */
/* -------------------------------------------------------------------------- */

export interface ObjectStat {
  sizeBytes: number;
  contentType: string | undefined;
  etag: string | undefined;
}

/**
 * Confirms the object actually landed, and reports what really arrived (§4.4
 * step 7). Returns null when the key does not exist.
 */
export async function statObject(objectKey: string): Promise<ObjectStat | null> {
  const { s3, bucket } = client();

  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return {
      sizeBytes: Number(result.ContentLength ?? 0),
      contentType: result.ContentType,
      etag: result.ETag?.replace(/"/g, ''),
    };
  } catch (error) {
    const name = (error as { name?: string }).name;
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return null;
    throw error;
  }
}

/**
 * Removes an orphaned object.
 *
 * Used only to clean up after a failed finalize — where bytes exist but no
 * database row does. §5.1 forbids the reverse: a live `files` row must never be
 * left pointing at nothing, which is why deletion of *recorded* files is soft
 * (archive) and never happens here.
 */
export async function deleteOrphanObject(objectKey: string): Promise<void> {
  try {
    const { s3, bucket } = client();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  } catch (error) {
    // Cleanup is best-effort; a stray object costs storage, not correctness.
    console.error('[tigris] orphan cleanup failed', { objectKey, error });
  }
}

/** Permanently removes a recorded object and surfaces failures to the caller. */
export async function deleteStoredObject(objectKey: string): Promise<void> {
  const { s3, bucket } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

/** Strips quotes and control characters that would break the header. */
function sanitizeHeaderFilename(filename: string): string {
  return filename.replace(/[\u0000-\u001f"\\]/g, '_').slice(0, 120) || 'download';
}
