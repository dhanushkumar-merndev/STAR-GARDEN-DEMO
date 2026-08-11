/**
 * File allowlist, filename sanitization and object-key generation.
 *
 * AGENTS.md §5.2 / §5.3 / §5.4. Pure functions only — no I/O, no env — so the
 * upload rules can be unit tested without a bucket (§20.1).
 */

import type { FileCategory } from '@/types/database';

/* -------------------------------------------------------------------------- */
/* Allowlist (§5.2)                                                            */
/* -------------------------------------------------------------------------- */

/** Rendered inline in the browser via a short-lived signed URL. */
export const PREVIEWABLE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const;

/** Stored and downloadable, but never previewed in-browser. */
export const DOWNLOAD_ONLY_EXTENSIONS = [
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'dwg',
  'dxf',
  'skp',
  'zip',
] as const;

export const ALLOWED_EXTENSIONS: readonly string[] = [
  ...PREVIEWABLE_EXTENSIONS,
  ...DOWNLOAD_ONLY_EXTENSIONS,
];

/**
 * Extensions that are never accepted, whatever the allowlist says.
 *
 * The allowlist above already excludes these — this is the second, explicit
 * layer §5.3 asks for, so that widening the allowlist by mistake cannot quietly
 * admit active content.
 */
export const FORBIDDEN_EXTENSIONS: readonly string[] = [
  'exe', 'apk', 'bat', 'cmd', 'com', 'sh', 'bash', 'ps1', 'msi', 'dll', 'scr',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'html', 'htm', 'xhtml', 'svg', 'php', 'phtml',
  'asp', 'aspx', 'jsp', 'py', 'rb', 'pl', 'jar', 'war', 'app', 'deb', 'rpm',
  'vbs', 'wsf', 'hta', 'reg', 'lnk', 'iso', 'dmg',
];

/**
 * Expected MIME type per extension. The server compares the *observed* type
 * against this map; an extension/type mismatch is rejected (§5.3).
 *
 * Several entries carry more than one value because browsers, Windows and
 * LibreOffice disagree about the canonical type for Office and CAD files.
 */
const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  dwg: ['image/vnd.dwg', 'application/acad', 'application/x-acad', 'application/octet-stream'],
  dxf: ['image/vnd.dxf', 'application/dxf', 'application/octet-stream'],
  skp: ['application/vnd.sketchup.skp', 'application/octet-stream'],
  zip: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
};

export const DEFAULT_MAX_UPLOAD_MB = 50;

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/** Lowercased extension without the dot. Throws when there isn't one. */
export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) {
    throw new FileValidationError('File must have an extension.');
  }
  return base.slice(dot + 1).toLowerCase();
}

export function isPreviewable(extension: string): boolean {
  return (PREVIEWABLE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

/**
 * Removes path separators, control characters and leading dots, collapses
 * whitespace, and caps the length. The result is only ever a *label* — the
 * storage path is UUID-based (§5.3).
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';

  const cleaned = base
    // Control characters first, including the NUL byte used in path-truncation
    // tricks, then anything outside a conservative printable set.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^a-zA-Z0-9._\- ]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\-]+/, '')
    .trim();

  if (cleaned === '' || cleaned === '.') return 'file';

  // Keep the extension intact while trimming an over-long stem.
  const dot = cleaned.lastIndexOf('.');
  if (dot > 0) {
    const stem = cleaned.slice(0, dot).slice(0, 80);
    const ext = cleaned.slice(dot + 1).slice(0, 10);
    return `${stem || 'file'}.${ext}`;
  }
  return cleaned.slice(0, 90);
}

export interface ValidateUploadInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  maxSizeMb?: number;
}

export interface ValidatedUpload {
  extension: string;
  safeFilename: string;
  mimeType: string;
  sizeBytes: number;
  previewable: boolean;
}

/**
 * The single gate every upload passes through, on the server, before any
 * presigned URL is minted (§4.4 step 3).
 */
export function validateUpload({
  filename,
  mimeType,
  sizeBytes,
  maxSizeMb = DEFAULT_MAX_UPLOAD_MB,
}: ValidateUploadInput): ValidatedUpload {
  if (!filename || filename.trim() === '') {
    throw new FileValidationError('A filename is required.');
  }

  const extension = extensionOf(filename);

  if (FORBIDDEN_EXTENSIONS.includes(extension)) {
    throw new FileValidationError(
      `.${extension} files are never accepted. Executable and web-content uploads are blocked.`,
    );
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new FileValidationError(
      `.${extension} is not a supported file type. Allowed: ${ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(', ')}.`,
    );
  }

  // Zero-byte files are rejected outright (§5.3).
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new FileValidationError('The file is empty.');
  }

  const maxBytes = maxSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new FileValidationError(
      `File is ${formatBytes(sizeBytes)}. The limit is ${maxSizeMb} MB.`,
    );
  }

  const normalizedMime = (mimeType || '').split(';')[0]!.trim().toLowerCase();
  const expected = MIME_BY_EXTENSION[extension] ?? [];

  // Browsers sometimes send an empty type for CAD and archive formats; the
  // extension allowlist has already constrained those to safe entries.
  if (normalizedMime !== '' && !expected.includes(normalizedMime)) {
    throw new FileValidationError(
      `The file's content type (${normalizedMime}) does not match its .${extension} extension.`,
    );
  }

  return {
    extension,
    safeFilename: sanitizeFilename(filename),
    mimeType: normalizedMime || expected[0] || 'application/octet-stream',
    sizeBytes,
    previewable: isPreviewable(extension),
  };
}

/**
 * Content-Type to hand back on a signed read.
 *
 * Anything not previewable is forced to a neutral type so a browser never
 * renders it, and download-only formats always arrive as an attachment.
 */
export function safeResponseContentType(extension: string, storedMime: string): string {
  return isPreviewable(extension) ? storedMime : 'application/octet-stream';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/* Object keys (§5.4)                                                          */
/* -------------------------------------------------------------------------- */

export interface ObjectKeyParts {
  category: FileCategory;
  fileId: string;
  safeFilename: string;
  leadId?: string | null;
  designProjectId?: string | null;
  versionNumber?: number | null;
  executionProjectId?: string | null;
  executionTaskId?: string | null;
  siteVisitId?: string | null;
}

/**
 * Builds the private key a file's bytes live under.
 *
 * The key is predictable for humans reading a bucket listing, but knowing it
 * grants nothing: the bucket is private and reads require a server-minted
 * short-lived signature (§4.3).
 */
export function buildObjectKey(parts: ObjectKeyParts): string {
  const { fileId, safeFilename } = parts;
  const tail = `${fileId}-${safeFilename}`;

  switch (parts.category) {
    case 'DESIGN_VERSION':
    case 'DESIGN_SOURCE': {
      const version = parts.versionNumber ?? 0;
      return `leads/${parts.leadId}/designs/${parts.designProjectId}/v${version}/${tail}`;
    }
    case 'EXECUTION_EVIDENCE':
    case 'COMPLETION_EVIDENCE':
      return `execution/${parts.executionProjectId}/evidence/${parts.executionTaskId ?? 'project'}/${tail}`;
    case 'SITE_VISIT_ATTACHMENT':
      return `site-visits/${parts.siteVisitId}/${tail}`;
    case 'LEAD_ATTACHMENT':
      return `leads/${parts.leadId}/attachments/${tail}`;
  }
}

/** Which categories a role may upload, per §5.5. */
export const UPLOADABLE_CATEGORIES: Record<string, readonly FileCategory[]> = {
  ADMIN: [
    'DESIGN_VERSION',
    'DESIGN_SOURCE',
    'SITE_VISIT_ATTACHMENT',
    'EXECUTION_EVIDENCE',
    'COMPLETION_EVIDENCE',
    'LEAD_ATTACHMENT',
  ],
  BDM: ['SITE_VISIT_ATTACHMENT', 'LEAD_ATTACHMENT'],
  DESIGNER: ['DESIGN_VERSION', 'DESIGN_SOURCE', 'SITE_VISIT_ATTACHMENT'],
  EXECUTION: ['EXECUTION_EVIDENCE', 'COMPLETION_EVIDENCE'],
};
