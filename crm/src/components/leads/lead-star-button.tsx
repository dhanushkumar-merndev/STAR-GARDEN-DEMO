'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ActionResult } from '@/lib/errors';
import { LuPin, LuStar } from 'react-icons/lu';
import {
  toggleLeadFavoriteAction,
  toggleLeadGlobalStarAction,
} from '@/server/actions/leads';

/**
 * Two independent controls per lead row, both always visible — never hiding
 * one because the other is set (see
 * `20260822130000_lead_pin_independent_of_star`):
 *
 *   - A star: any staff member, private to them ("I want to find this
 *     again").
 *   - A pin (Admin/Super-Admin only): visible to everyone ("this lead
 *     matters"). Pinned leads sort to the top of whatever tab they already
 *     belong to — there is no separate Pinned tab.
 *
 * Both sit beside the row's `<Link>`, not inside it — a button nested in an
 * anchor is invalid HTML, so `stopPropagation` is what keeps a click here
 * from also navigating to the lead.
 */
export function LeadStarButton({
  leadId,
  isGloballyStarred,
  isFavorited,
  canSetGlobal,
}: {
  leadId: string;
  isGloballyStarred: boolean;
  isFavorited: boolean;
  canSetGlobal: boolean;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = React.useState<'star' | 'pin' | null>(null);

  const run = <T,>(kind: 'star' | 'pin', action: () => Promise<ActionResult<T>>) =>
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setPendingAction(kind);
      try {
        const result = await action();
        if (result.ok) {
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } finally {
        setPendingAction(null);
      }
    };

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        disabled={pendingAction !== null}
        aria-label={isFavorited ? 'Remove your personal star' : 'Star for yourself'}
        aria-pressed={isFavorited}
        title={isFavorited ? 'Remove your personal star' : 'Star for yourself'}
        onClick={run('star', () => toggleLeadFavoriteAction(leadId))}
        className="tap flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-surface-muted hover:text-brand-600 disabled:cursor-wait disabled:opacity-60"
      >
        <LuStar className={`size-4 ${isFavorited ? 'fill-current text-brand-600' : ''}`} />
      </button>

      {canSetGlobal ? (
        <button
          type="button"
          disabled={pendingAction !== null}
          aria-label={isGloballyStarred ? 'Remove the pin for everyone' : 'Pin for everyone'}
          aria-pressed={isGloballyStarred}
          title={isGloballyStarred ? 'Remove the pin for everyone' : 'Pin for everyone'}
          onClick={run('pin', () => toggleLeadGlobalStarAction(leadId))}
          className={`tap flex size-8 shrink-0 items-center justify-center rounded-lg transition disabled:cursor-wait disabled:opacity-60 ${
            isGloballyStarred
              ? 'text-brand-600 hover:bg-[--color-danger-bg] hover:text-danger'
              : 'text-ink-subtle hover:bg-surface-muted hover:text-brand-600'
          }`}
        >
          <LuPin className={`size-4 ${isGloballyStarred ? 'fill-current' : ''}`} />
        </button>
      ) : isGloballyStarred ? (
        <span
          className="flex size-8 items-center justify-center text-brand-600"
          aria-label="Pinned for everyone"
        >
          <LuPin className="size-4 fill-current" />
        </span>
      ) : null}
    </div>
  );
}
