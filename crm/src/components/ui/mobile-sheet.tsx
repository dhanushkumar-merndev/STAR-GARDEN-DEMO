'use client';

import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils/cn';

/** Mobile-only bottom sheet. Radix locks body scroll while the sheet is open. */
export function MobileSheet({ label, title, description, icon, children, triggerClassName }: {
  label: string; title: string; description?: string; icon?: ReactNode; children: ReactNode;
  /** Extra classes on the trigger button — e.g. `flex-1` to match a sibling button's width. */
  triggerClassName?: string;
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger
        className={cn(
          'tap inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink shadow-sm hover:bg-surface-muted lg:hidden',
          triggerClassName,
        )}
      >
        {icon}{label}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        {/* This is deliberately a plain backdrop rather than Radix Overlay.
            Radix Overlay mounts react-remove-scroll, but the authenticated
            mobile shell already locks the document and scrolls only `<main>`.
            Applying both locks can move that scroller to its empty area, which
            makes the backdrop look like a solid grey page. Dialog Content still
            supplies focus trapping, Escape and outside-click dismissal. */}
        <div
          aria-hidden="true"
          className="fixed inset-0 z-50 bg-black/40"
          style={{ pointerEvents: 'auto' }}
        />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-0.5rem)] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl lg:hidden">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="tap -mt-1 -mr-1 flex shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Close">
              <LuX className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
