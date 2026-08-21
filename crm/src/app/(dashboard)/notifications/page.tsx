import type { Metadata } from 'next';
import Link from 'next/link';
import { LuBell } from 'react-icons/lu';
import { requirePageUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { AutoMarkRead } from '@/components/notifications/notification-actions';
import { formatRelative, humanizeEnum } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Notifications' };

/** Notification centre (AGENTS.md §11.2, §13). In-app only in the MVP. */
export default async function NotificationsPage() {
  const user = await requirePageUser();
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const items = notifications ?? [];
  const unread = items.filter((n) => !n.read_at);

  return (
    <>
      {/* Opening this page marks everything read; the highlighting below still
          shows which items were new on arrival. */}
      <AutoMarkRead hasUnread={unread.length > 0} />

      <PageHeader
        title="Notifications"
        subtitle={
          unread.length > 0
            ? `${unread.length} new since you last looked`
            : 'Assignments, reviews and reminders'
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={<LuBell className="size-8" />}
            title="No notifications yet"
            description="Assignments, reviews and reminders appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((notification) => {
              const href = entityHref(notification.entity_type, notification.entity_id);
              const isUnread = !notification.read_at;

              const body = (
                <div className="flex items-start gap-3">
                  <span
                    className={
                      isUnread
                        ? 'mt-1.5 size-2 shrink-0 rounded-full bg-brand-500'
                        : 'mt-1.5 size-2 shrink-0 rounded-full bg-transparent'
                    }
                    aria-hidden="true"
                  />
                  {/* One row from `sm` up: title and detail on the left, kind
                      and time on the right. The time was stranded on a third
                      line beside the badge, which pushed every notification to
                      three lines and made a list of ten a page of scrolling.
                      Stacks again below `sm`, where there is no room to pair
                      them. */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          isUnread ? 'text-sm font-semibold text-ink' : 'text-sm text-ink-muted'
                        }
                      >
                        {notification.title}
                      </p>
                      {notification.body ? (
                        <p className="mt-0.5 truncate text-sm text-ink-muted">{notification.body}</p>
                      ) : null}
                    </div>

                    <p className="flex shrink-0 items-center gap-2 text-xs text-ink-subtle">
                      <Badge tone="neutral">{humanizeEnum(notification.type)}</Badge>
                      <span className="whitespace-nowrap">
                        {formatRelative(notification.created_at)}
                      </span>
                      {isUnread ? <span className="sr-only">Unread</span> : null}
                    </p>
                  </div>
                </div>
              );

              return (
                <li key={notification.id} className="px-4 py-3">
                  {href ? (
                    <Link href={href} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;

  switch (entityType) {
    case 'lead':
      return `/leads/${entityId}`;
    case 'design_project':
      return `/designs/${entityId}`;
    case 'execution_project':
      return `/execution/${entityId}`;
    case 'site_visit':
      return `/site-visits/${entityId}`;
    case 'follow_up':
      return '/follow-ups';
    default:
      return null;
  }
}
