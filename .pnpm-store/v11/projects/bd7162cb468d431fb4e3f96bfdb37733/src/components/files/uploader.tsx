'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuUpload } from 'react-icons/lu';
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
 * Three steps, in order:
 *   1. ask the server for authorization → get a presigned PUT and a signed token
 *   2. PUT the file straight to Tigris (XHR, because fetch has no upload
 *      progress and §16 requires showing it)
 *   3. tell the server it landed → it verifies and records the metadata
 *
 * The client validates size and extension too, but only to fail fast with a
 * friendly message. The server re-validates everything and is the only thing
 * that decides (§7.5).
 */

type Phase = 'idle' | 'authorizing' | 'uploading' | 'finalizing' | 'done';

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
}

export function FileUploader({
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
}: UploaderProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [versionNote, setVersionNote] = React.useState('');

  const busy = phase !== 'idle' && phase !== 'done';

  function reset() {
    setPhase('idle');
    setProgress(0);
    setFile(null);
    setVersionNote('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function validateLocally(candidate: File): string | null {
    const extension = candidate.name.split('.').pop()?.toLowerCase() ?? '';

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `.${extension} files are not supported. Allowed: ${ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(', ')}.`;
    }
    if (candidate.size === 0) return 'That file is empty.';
    if (candidate.size > maxSizeMb * 1024 * 1024) {
      return `That file is ${formatBytes(candidate.size)}. The limit is ${maxSizeMb} MB.`;
    }
    return null;
  }

  async function handleUpload() {
    if (!file) return;

    const localError = validateLocally(file);
    if (localError) {
      setError(localError);
      return;
    }

    setError(null);

    try {
      /* Step 1 — authorization. */
      setPhase('authorizing');

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
      setPhase('uploading');
      await putWithProgress(presigned.uploadUrl, presigned.headers, file, setProgress);

      /* Step 3 — confirm and record. */
      setPhase('finalizing');

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

      setPhase('done');
      toast.success(
        finalized.versionNumber
          ? `Version ${finalized.versionNumber} uploaded.`
          : 'File uploaded.',
      );
      reset();
      router.refresh();
    } catch (uploadError) {
      setPhase('idle');
      setProgress(0);
      const message =
        uploadError instanceof Error ? uploadError.message : 'The upload failed. Please try again.';
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-3">
      <Field
        label={label}
        htmlFor={`upload-${category}`}
        hint={
          helpText ??
          `Up to ${maxSizeMb} MB. Previewed in the browser: ${PREVIEWABLE_EXTENSIONS.map((e) => `.${e}`).join(', ')}. Download only: ${DOWNLOAD_ONLY_EXTENSIONS.map((e) => `.${e}`).join(', ')}.`
        }
      >
        <Input
          ref={inputRef}
          id={`upload-${category}`}
          type="file"
          disabled={busy}
          accept={cameraCapture ? 'image/*' : ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')}
          capture={cameraCapture ? 'environment' : undefined}
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            setError(chosen ? validateLocally(chosen) : null);
          }}
          className="h-auto py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-800"
        />
      </Field>

      {showVersionNote && file ? (
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

      {busy ? (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>
              {phase === 'authorizing' && 'Checking permission…'}
              {phase === 'uploading' && `Uploading ${file?.name ?? ''}`}
              {phase === 'finalizing' && 'Confirming…'}
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-brand-500 transition-[width]"
              style={{ width: `${phase === 'uploading' ? progress : phase === 'finalizing' ? 100 : 5}%` }}
            />
          </div>
        </div>
      ) : null}

      <Button onClick={handleUpload} disabled={!file || busy || Boolean(error)} className="gap-2">
        <LuUpload className="size-4" />
        {busy ? 'Uploading…' : 'Upload'}
      </Button>
    </div>
  );
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
