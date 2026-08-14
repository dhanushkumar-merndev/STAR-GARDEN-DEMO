'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LuBell, LuCheck, LuCheckCheck } from 'react-icons/lu';
import { markNotificationReadAction } from '@/server/actions/notifications';
import { formatRelative } from '@/lib/utils/format';

type NotificationPreview = {
  id: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationMenu({
  notifications,
  unreadCount,
}: {
  notifications: NotificationPreview[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function markRead(notificationId?: string) {
    const formData = new FormData();
    if (notificationId) formData.set('notification_id', notificationId);
    else formData.set('all', 'true');

    startTransition(async () => {
      const result = await markNotificationReadAction(null, formData);
      if (result.ok) router.refresh();
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="tap relative flex shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:outline-none"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <LuBell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[calc(100vw-1.5rem)] max-w-96 overflow-hidden rounded-xl border border-line bg-surface shadow-xl lg:w-96"
        >
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-base font-semibold text-ink">Notifications</p>
              <p className="text-xs text-ink-muted">Live operational alerts for your role</p>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => markRead()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                <LuCheckCheck className="size-4" />
                Mark read
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto overscroll-contain bg-canvas p-3">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-muted">
                No notifications yet.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {notifications.map((notification) => {
                  const href = entityHref(notification.entity_type, notification.entity_id);
                  const unread = !notification.read_at;
                  return (
                    <li
                      key={notification.id}
                      className={`rounded-xl border ${unread ? 'border-brand-200 bg-brand-50' : 'border-line bg-surface'}`}
                    >
                      <div className="flex items-start gap-3 px-3 py-3.5">
                        <span
                          aria-hidden="true"
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${unread ? 'bg-surface text-brand-700' : 'bg-surface-muted text-ink-subtle'}`}
                        >
                          <LuBell className="size-4" />
                        </span>
                        <DropdownMenu.Item asChild>
                          <Link href={href ?? '/notifications'} className="min-w-0 flex-1 outline-none">
                            <p className={`flex items-center gap-2 text-sm ${unread ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                              <span>{notification.title}</span>
                              {unread ? <span className="size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" /> : null}
                            </p>
                            {notification.body ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                                {notification.body}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-ink-subtle">
                              {formatRelative(notification.created_at)}
                            </p>
                          </Link>
                        </DropdownMenu.Item>
                        {unread ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => markRead(notification.id)}
                            className="tap -mt-1 flex shrink-0 items-center justify-center rounded-lg text-ink-subtle hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                            aria-label={`Mark ${notification.title} as read`}
                          >
                            <LuCheck className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DropdownMenu.Item asChild>
            <Link
              href="/notifications"
              className="flex h-11 items-center justify-center border-t border-line text-sm font-semibold text-brand-700 outline-none hover:bg-brand-50"
            >
              View all notifications
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case 'lead': return `/leads/${entityId}`;
    case 'design_project': return `/designs/${entityId}`;
    case 'execution_project': return `/execution/${entityId}`;
    case 'site_visit': return `/site-visits/${entityId}`;
    case 'follow_up': return '/follow-ups';
    default: return null;
  }
}
