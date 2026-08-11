'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuArchive, LuDownload, LuEye, LuFileText, LuImage, LuPaperclip } from 'react-icons/lu';
import { toast } from 'sonner';
import { Badge, Button, EmptyState } from '@/components/ui';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { formatBytes, isPreviewable } from '@/lib/utils/files';
import { formatDateTime } from '@/lib/utils/format';
import { getFileUrlAction, archiveFileAction } from '@/server/actions/files';
import type { FileRow } from '@/types/database';

/**
 * File list with preview and download (AGENTS.md §5.2, §16).
 *
 * Every action mints a fresh short-lived signed URL through a Server Action —
 * nothing here holds a URL, and §15 forbids storing one. Formats that cannot be
 * previewed say so explicitly rather than offering a broken preview button.
 */

export interface FileListItem extends FileRow {
  uploader_name?: string | null;
  version_label?: string | null;
  is_approved_version?: boolean;
}

export function FileList({
  files,
  canArchive = false,
  emptyMessage = 'No files yet.',
}: {
  files: FileListItem[];
  canArchive?: boolean;
  emptyMessage?: string;
}) {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={<LuPaperclip className="size-8" />}
        title={emptyMessage}
        description="Uploaded files appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {files.map((file) => (
        <FileRowItem key={file.id} file={file} canArchive={canArchive} />
      ))}
    </ul>
  );
}

function FileRowItem({ file, canArchive }: { file: FileListItem; canArchive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'preview' | 'download' | null>(null);
  const [preview, setPreview] = React.useState<{ url: string; outdated: boolean } | null>(null);

  const previewable = isPreviewable(file.extension);
  const Icon = file.extension.match(/^(jpe?g|png|webp)$/) ? LuImage : LuFileText;

  async function open(action: 'PREVIEW' | 'DOWNLOAD') {
    setBusy(action === 'PREVIEW' ? 'preview' : 'download');

    const result = await getFileUrlAction(file.id, action);
    setBusy(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    // §16: warn before handing over a version that is not the approved one.
    if (result.data.isOutdatedVersion && action === 'DOWNLOAD') {
      const proceed = window.confirm(
        'This is NOT the approved design version.\n\n' +
          'Sending an outdated design to a customer causes rework on site. Download anyway?',
      );
      if (!proceed) return;
    }

    if (action === 'DOWNLOAD') {
      window.location.href = result.data.url;
    } else {
      setPreview({ url: result.data.url, outdated: result.data.isOutdatedVersion });
    }
  }

  async function archive() {
    if (!window.confirm(`Archive "${file.original_filename}"? It will be hidden from this list.`)) {
      return;
    }

    const formData = new FormData();
    formData.set('file_id', file.id);

    const result = await archiveFileAction(null, formData);
    if (result.ok) {
      toast.success('File archived.');
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Icon className="size-5 shrink-0 text-ink-subtle" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{file.original_filename}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {formatBytes(file.size_bytes)} · {formatDateTime(file.created_at)}
          {file.uploader_name ? ` · ${file.uploader_name}` : ''}
        </p>
        {!previewable ? (
          <p className="mt-1 text-xs text-ink-subtle">Preview unavailable — download the file.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        {file.is_approved_version ? <Badge tone="ok">Approved</Badge> : null}
        {file.version_label ? <Badge tone="neutral">{file.version_label}</Badge> : null}

        {previewable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => open('PREVIEW')}
            disabled={busy !== null}
            aria-label={`Preview ${file.original_filename}`}
          >
            <LuEye className="size-4" />
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => open('DOWNLOAD')}
          disabled={busy !== null}
          aria-label={`Download ${file.original_filename}`}
        >
          <LuDownload className="size-4" />
        </Button>

        {canArchive && file.category !== 'DESIGN_VERSION' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={archive}
            aria-label={`Archive ${file.original_filename}`}
          >
            <LuArchive className="size-4" />
          </Button>
        ) : null}
      </div>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        {preview ? (
          <DialogContent title={file.original_filename} className="sm:max-w-3xl">
            {preview.outdated ? (
              <div className="mb-3 rounded-lg border border-[--color-warn]/30 bg-[--color-warn-bg] px-3 py-2 text-sm">
                <strong className="font-semibold">Not the approved version.</strong> Check the
                version history before sharing this with a customer.
              </div>
            ) : null}

            {file.extension === 'pdf' ? (
              <iframe
                src={preview.url}
                title={file.original_filename}
                className="h-[65dvh] w-full rounded-lg border border-line"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={file.original_filename}
                className="mx-auto max-h-[65dvh] rounded-lg object-contain"
              />
            )}

            <p className="mt-3 text-xs text-ink-subtle">
              This preview link expires in a couple of minutes and is recorded in the audit log.
            </p>
          </DialogContent>
        ) : null}
      </Dialog>
    </li>
  );
}
