'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuTrash2, LuUpload } from 'react-icons/lu';
import { toast } from 'sonner';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui';
import {
  ALLOWED_EXTENSIONS,
  DOWNLOAD_ONLY_EXTENSIONS,
  formatBytes,
  PREVIEWABLE_EXTENSIONS,
} from '@/lib/utils/files';
import type { FileCategory } from '@/types/database';

/**
 * Direct-to-storage uploader (AGENTS.md §4.4).
 *
 * The bytes go browser → Tigris; they never pass through the CRM server, which
 * is why a 50 MB CAD file does not need a 50 MB serverless request body.
 *
 * Three steps per file, in order:
 *   1. ask the server for authorization → get a presigned PUT and a signed token
 *   2. PUT the file straight to Tigris (XHR, because fetch has no upload
 *      progress and §16 requires showing it)
 *   3. tell the server it landed → it verifies and records the metadata
 *
 * With `multiple`, that cycle runs once per file, one after another rather than
 * all at once: a designer pushing ten photos over site mobile data would
 * otherwise have ten uploads competing for the same thin pipe, and they would
 * all time out together.
 *
 * The client validates size, count and extension too, but only to fail fast
 * with a friendly message. The server re-validates everything and is the only
 * thing that decides (§7.5).
 */

type Phase = 'idle' | 'working' | 'done';
type QueueStatus = 'queued' | 'uploading' | 'done' | 'failed';

interface QueueItem {
  /** Identity for React — two photos from a camera roll can share a name. */
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  error: string | null;
}

/** Lets a parent form upload the queue as part of its own submit. */
export interface FileUploaderHandle {
  /** Uploads everything outstanding. Resolves false if anything failed. */
  uploadAll: () => Promise<boolean>;
  /** How many files are waiting, so a caller can skip the round trip. */
  pendingCount: () => number;
}

export interface UploaderProps {
  category: FileCategory;
  leadId?: string;
  siteVisitId?: string;
  designProjectId?: string;
  executionProjectId?: string;
  executionTaskId?: string;
  maxSizeMb: number;
  /** Design uploads let the designer explain what changed (§5.6). */
  showVersionNote?: boolean;
  cameraCapture?: boolean;
  label?: string;
  helpText?: string;
  /**
   * Accept several files at once.
   *
   * Off by default: a design version is one drawing, and multi-select there
   * would silently create several versions. Site photos are the opposite — a
   * designer shoots five and wants them in while standing on the site, not on
   * whatever day they remember to come back.
   */
  multiple?: boolean;
  /** Ceiling on a single batch. Ignored unless `multiple`. */
  maxFiles?: number;
  /**
   * Hide the built-in Upload button because a parent form drives the upload
   * through the ref. Stops a dialog showing two buttons that both look like
   * the one that finishes the job.
   */
  hideAction?: boolean;
}

export const FileUploader = React.forwardRef<FileUploaderHandle, UploaderProps>(
  function FileUploader(
    {
      category,
      leadId,
      siteVisitId,
      designProjectId,
      executionProjectId,
      executionTaskId,
      maxSizeMb,
      showVersionNote,
      cameraCapture = false,
      label = 'Upload a file',
      helpText,
      multiple = false,
      maxFiles = 10,
      hideAction = false,
    },
    ref,
  ) {
    const router = useRouter();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [phase, setPhase] = React.useState<Phase>('idle');
    const [queue, setQueue] = React.useState<QueueItem[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [versionNote, setVersionNote] = React.useState('');

    // `uploadAll` runs across many awaits and is also called from a parent's
    // submit handler, so it needs the queue as of the moment it runs rather
    // than as of the render that created the closure. Synced in an effect, not
    // during render — a ref write in the render body is exactly the pattern
    // that makes a component miss updates.
    const queueRef = React.useRef<QueueItem[]>([]);
    React.useEffect(() => {
      queueRef.current = queue;
    }, [queue]);

    const busy = phase === 'working';
    const outstanding = queue.filter((item) => item.status === 'queued' || item.status === 'failed');
    const uploaded = queue.filter((item) => item.status === 'done');

    function reset() {
      setPhase('idle');
      setQueue([]);
      setVersionNote('');
      setError(null);
      if (inputRef.current) inputRef.current.value = '';
    }

    function validateLocally(candidate: File): string | null {
      const extension = candidate.name.split('.').pop()?.toLowerCase() ?? '';

      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        return `.${extension} files are not supported.`;
      }
      if (candidate.size === 0) return 'That file is empty.';
      if (candidate.size > maxSizeMb * 1024 * 1024) {
        return `${formatBytes(candidate.size)} — the limit is ${maxSizeMb} MB.`;
      }
      return null;
    }

    function onPick(picked: FileList | null) {
      setError(null);

      const chosen = Array.from(picked ?? []);
      if (chosen.length === 0) {
        setQueue([]);
        return;
      }

      // Only files not yet uploaded are replaced. Anything already in storage
      // stays listed so the designer can see what is safely in.
      const keep = queueRef.current.filter((item) => item.status === 'done');
      const room = multiple ? maxFiles - keep.length : 1;

      if (room <= 0) {
        setError(`That is already ${maxFiles} files, the most allowed here.`);
        return;
      }

      const accepted = chosen.slice(0, room);
      if (chosen.length > room) {
        setError(
          `Only the first ${room} of ${chosen.length} files were added — the limit is ${maxFiles}.`,
        );
      }

      setQueue([
        ...keep,
        ...accepted.map((file, index) => ({
          id: `${Date.now()}-${index}-${file.name}`,
          file,
          status: 'queued' as QueueStatus,
          progress: 0,
          error: validateLocally(file),
        })),
      ]);
    }

    function removeItem(id: string) {
      setQueue((current) => current.filter((item) => item.id !== id));
      if (inputRef.current) inputRef.current.value = '';
    }

    /** One file, all three steps. Throws with a message fit to show a user. */
    async function uploadOne(item: QueueItem): Promise<void> {
      const { file } = item;

      /* Step 1 — authorization. */
      const presignResponse = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          category,
          lead_id: leadId,
          site_visit_id: siteVisitId,
          design_project_id: designProjectId,
          execution_project_id: executionProjectId,
          execution_task_id: executionTaskId,
        }),
      });

      const presigned = await presignResponse.json();
      if (!presignResponse.ok) {
        throw new Error(presigned?.message ?? 'The upload was not authorized.');
      }

      /* Step 2 — the bytes. */
      await putWithProgress(presigned.uploadUrl, presigned.headers, file, (percent) =>
        setQueue((current) =>
          current.map((row) => (row.id === item.id ? { ...row, progress: percent } : row)),
        ),
      );

      /* Step 3 — confirm and record. */
      const finalizeResponse = await fetch('/api/uploads/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_token: presigned.uploadToken,
          version_note: versionNote || undefined,
        }),
      });

      const finalized = await finalizeResponse.json();
      if (!finalizeResponse.ok) {
        throw new Error(finalized?.message ?? 'The file uploaded but could not be recorded.');
      }
    }

    /**
     * Uploads the queue one file at a time.
     *
     * A failure part-way does not roll back what already succeeded — those
     * bytes are in storage and recorded, and throwing them away because photo
     * four failed would be worse than the failure. The failed rows stay in the
     * list marked as such, so the retry is one tap.
     */
    const uploadAll = React.useCallback(async (): Promise<boolean> => {
      const pending = queueRef.current.filter(
        (item) => item.status === 'queued' || item.status === 'failed',
      );
      if (pending.length === 0) return true;

      const invalid = pending.find((item) => item.error && item.status === 'queued');
      if (invalid) {
        setError(`${invalid.file.name}: ${invalid.error}`);
        return false;
      }

      setPhase('working');
      setError(null);
      let allSucceeded = true;

      for (const item of pending) {
        setQueue((current) =>
          current.map((row) =>
            row.id === item.id ? { ...row, status: 'uploading', progress: 0, error: null } : row,
          ),
        );

        try {
          await uploadOne(item);
          setQueue((current) =>
            current.map((row) =>
              row.id === item.id ? { ...row, status: 'done', progress: 100, error: null } : row,
            ),
          );
        } catch (uploadError) {
          allSucceeded = false;
          const message =
            uploadError instanceof Error ? uploadError.message : 'The upload failed.';
          setQueue((current) =>
            current.map((row) =>
              row.id === item.id ? { ...row, status: 'failed', error: message } : row,
            ),
          );
        }
      }

      setPhase(allSucceeded ? 'done' : 'idle');
      router.refresh();

      if (allSucceeded) {
        const count = pending.length;
        toast.success(count === 1 ? 'File uploaded.' : `${count} files uploaded.`);
        if (!hideAction) reset();
      } else {
        toast.error('Some files did not upload. Retry them below.');
      }

      return allSucceeded;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, leadId, siteVisitId, designProjectId, executionProjectId, executionTaskId, versionNote, hideAction]);

    React.useImperativeHandle(
      ref,
      () => ({
        uploadAll,
        pendingCount: () =>
          queueRef.current.filter((item) => item.status === 'queued' || item.status === 'failed')
            .length,
      }),
      [uploadAll],
    );

    const defaultHint = multiple
      ? `Up to ${maxFiles} files, ${maxSizeMb} MB each.`
      : `Up to ${maxSizeMb} MB. Previewed in the browser: ${PREVIEWABLE_EXTENSIONS.map((e) => `.${e}`).join(', ')}. Download only: ${DOWNLOAD_ONLY_EXTENSIONS.map((e) => `.${e}`).join(', ')}.`;

    return (
      <div className="space-y-3">
        <Field label={label} htmlFor={`upload-${category}`} hint={helpText ?? defaultHint}>
          <Input
            ref={inputRef}
            id={`upload-${category}`}
            type="file"
            multiple={multiple}
            disabled={busy}
            accept={cameraCapture ? 'image/*' : ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')}
            capture={cameraCapture ? 'environment' : undefined}
            onChange={(e) => onPick(e.target.files)}
            className="h-auto py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-800"
          />
        </Field>

        {/* The chosen files, by name. The browser's own "3 files" summary does
            not say which three, and a designer needs to see that the photo they
            just took is the one about to go up. */}
        {queue.length > 0 ? (
          <ul className="space-y-1.5">
            {queue.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-line px-2.5 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-subtle">
                    {formatBytes(item.file.size)}
                  </span>
                  <StatusChip item={item} />
                  {item.status !== 'uploading' && item.status !== 'done' ? (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={busy}
                      aria-label={`Remove ${item.file.name}`}
                      className="shrink-0 rounded p-1 text-ink-subtle hover:bg-surface-muted hover:text-danger"
                    >
                      <LuTrash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>

                {item.status === 'uploading' ? (
                  <div
                    className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-muted"
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width]"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                ) : null}

                {item.error ? <p className="mt-1 text-danger">{item.error}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {showVersionNote && queue.length > 0 ? (
          <Field
            label="What changed in this version?"
            htmlFor="version_note"
            hint="Visible to the reviewer alongside the file."
          >
            <Textarea
              id="version_note"
              rows={2}
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              disabled={busy}
              placeholder="Moved the seating deck, added drainage detail on sheet 2."
            />
          </Field>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {hideAction ? (
          // A parent form owns the upload. Say what its button will do, so the
          // absence of an Upload button here does not read as a missing step.
          outstanding.length > 0 ? (
            <p className="text-xs text-ink-muted">
              {outstanding.length} {outstanding.length === 1 ? 'file' : 'files'} will upload when you
              save.
              {uploaded.length > 0 ? ` ${uploaded.length} already uploaded.` : ''}
            </p>
          ) : null
        ) : (
          <Button
            onClick={() => void uploadAll()}
            disabled={outstanding.length === 0 || busy}
            className="gap-2"
          >
            <LuUpload className="size-4" />
            {busy
              ? 'Uploading…'
              : outstanding.length > 1
                ? `Upload ${outstanding.length} files`
                : 'Upload'}
          </Button>
        )}
      </div>
    );
  },
);

function StatusChip({ item }: { item: QueueItem }) {
  if (item.status === 'done') {
    return <span className="shrink-0 font-medium text-[--color-ok]">Uploaded</span>;
  }
  if (item.status === 'uploading') {
    return <span className="shrink-0 tabular-nums text-ink-muted">{item.progress}%</span>;
  }
  if (item.status === 'failed') {
    return <span className="shrink-0 font-medium text-danger">Failed</span>;
  }
  return null;
}

/**
 * PUT with progress.
 *
 * `fetch` cannot report upload progress, and §16 requires it — a designer
 * pushing a 40 MB drawing over site Wi-Fi needs to see that something is
 * happening.
 */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    // These headers are part of the signature; changing them breaks it.
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage rejected the upload (${xhr.status}). Please try again.`));
      }
    };

    xhr.onerror = () => {
      let storageHost = 'object storage';
      try {
        storageHost = new URL(url).hostname;
      } catch {
        // The presign endpoint already validates the URL. Keep the fallback
        // message if a browser extension rewrote it into something invalid.
      }

      reject(
        new Error(
          `The browser blocked the upload to ${storageHost}. Check browser privacy/ad-blocking shields, then hard-refresh after changing CORS and retry.`,
        ),
      );
    };
    xhr.onabort = () => reject(new Error('The upload was cancelled before it finished.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out. Try again on a better connection.'));

    xhr.timeout = 10 * 60 * 1000;
    xhr.send(file);
  });
}
