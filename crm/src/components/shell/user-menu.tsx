'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LuChevronDown, LuLogOut, LuUserRound } from 'react-icons/lu';
import { signOutAction } from '@/server/actions/auth';
import { initials } from '@/lib/utils/format';

/**
 * The account menu in the header.
 *
 * Collapses what used to be three separate header controls — a name block, a
 * profile link and a permanently visible "Sign out" button — into one avatar.
 * Sign-out is a rare, destructive-feeling action and does not deserve a
 * permanent slot next to the bell.
 *
 * Radix handles the parts that are easy to get wrong by hand: focus trapping,
 * Escape to close, arrow-key navigation and the `aria-expanded` wiring.
 */

export interface UserMenuProps {
  fullName: string;
  email: string | null;
  roleLabel: string;
  /** Google's profile picture. Null falls back to initials. */
  avatarUrl: string | null;
}

export function UserMenu({ fullName, email, roleLabel, avatarUrl }: UserMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="tap flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 pl-0.5 transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:outline-none"
        aria-label={`Account menu for ${fullName}`}
      >
        <Avatar fullName={fullName} avatarUrl={avatarUrl} />
        <LuChevronDown className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-60 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <div className="flex items-start gap-3 border-b border-line px-3 py-3">
            <Avatar fullName={fullName} avatarUrl={avatarUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{fullName}</p>
              {email ? (
                // `break-all` rather than truncate: a half-shown address is
                // worse than a wrapped one when you are checking which account
                // you are signed in as.
                <p className="mt-0.5 text-xs break-all text-ink-muted">{email}</p>
              ) : null}
              <p className="mt-1 text-[11px] font-medium tracking-wide text-brand-700 uppercase">
                {roleLabel}
              </p>
            </div>
          </div>

          <div className="p-1">
            <DropdownMenu.Item asChild>
              <Link
                href="/profile"
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-muted outline-none data-highlighted:bg-surface-muted data-highlighted:text-ink"
              >
                <LuUserRound className="size-4" />
                My profile
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="my-1 h-px bg-line" />

            {/*
              Not a <form action> — Radix closes and unmounts this item the
              instant it's selected, which races the form's native submission
              and can rip it out of the DOM mid-flight ("Form submission
              canceled because the form is not connected"), silently dropping
              the sign-out. signOutAction takes no arguments specifically so
              it can be called directly here instead, which has no such race.
            */}
            <DropdownMenu.Item
              onSelect={() => {
                void signOutAction();
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-danger outline-none data-highlighted:bg-[--color-danger-bg]"
            >
              <LuLogOut className="size-4" />
              Sign out
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Google's picture, or initials.
 *
 * A plain `<img>` rather than `next/image`: the URL is on Google's CDN and
 * would otherwise need a `remotePatterns` entry, and these are 32px avatars
 * where the optimiser earns nothing. `referrerPolicy` is what stops Google
 * returning 403 for the request.
 */
function Avatar({ fullName, avatarUrl }: { fullName: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={32}
        height={32}
        referrerPolicy="no-referrer"
        className="size-8 shrink-0 rounded-full border border-line object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800"
    >
      {initials(fullName)}
    </span>
  );
}
