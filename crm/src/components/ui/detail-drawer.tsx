'use client';

import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';
import * as DialogPrimitive from '@radix-ui/react-dialog';

/**
 * Reference panel that stays reachable at every width.
 *
 * The sibling {@link MobileSheet} is deliberately `lg:hidden` — it fronts
 * content the desktop layout already shows inline, so surfacing it twice there
 * would be noise. This one is for content that has nowhere else to live on a
 * wide screen: the customer's number, address and requirement are otherwise
 * only in a tab, out of sight exactly when someone is deciding whether to call.
 *
 * It presents as the platform convention at each size — a bottom sheet on a
 * phone, a right-hand slide-over on a desktop — from one trigger. Radix locks
 * body scroll and traps focus in both.
 */
export function DetailDrawer({
  label,
  title,
  description,
  icon,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger className="tap inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink shadow-sm hover:bg-surface-muted">
        {icon}
        {label}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={[
            'fixed z-50 flex flex-col overflow-hidden bg-surface shadow-2xl',
            // Phone: bottom sheet, capped so the header behind stays visible.
            'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl',
            // Desktop: full-height panel pinned to the right edge. `left-auto`
            // undoes the `inset-x-0` above, which would otherwise stretch it
            // across the viewport.
            'lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:w-full lg:max-h-none lg:max-w-md',
            'lg:rounded-none lg:rounded-l-2xl',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold text-ink">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="tap -mt-1 -mr-1 flex shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted"
              aria-label="Close"
            >
              <LuX className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
