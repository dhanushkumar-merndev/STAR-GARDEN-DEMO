import Link from 'next/link';
import Image from 'next/image';
import { requirePageUser, ROLE_LABELS } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { DesktopNav, HeaderTitle, MobileNav } from '@/components/shell/navigation';
import { UserMenu } from '@/components/shell/user-menu';
import { NotificationMenu } from '@/components/notifications/notification-menu';

/**
 * Authenticated application shell.
 *
 * `requirePageUser()` is the gate: middleware only refreshes the session cookie
 * and does a coarse redirect, so this is where a signed-in-but-not-authorised
 * account actually stops (§7.5, §15). It also bounces a CLIENT to their portal,
 * which is the only page their grants can populate.
 *
 * The header carries the page's name. Pages therefore render no `<h1>` of their
 * own — `PageHeader` was changed to match — which removed both the duplicated
 * title and the band of empty space it used to sit in.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();

  const supabase = await createClient();
  const [{ count }, { data: notificationPreviews }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
    supabase
      .from('notifications')
      .select('id, title, body, entity_type, entity_id, read_at, created_at')
      .eq('user_id', user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const unread = count ?? 0;

  return (
    <div className="crm-shell flex h-dvh flex-col overflow-hidden bg-canvas lg:h-auto lg:min-h-dvh lg:overflow-visible">
      <header className="crm-header sticky top-0 z-30 shrink-0 border-b border-line bg-surface/95 backdrop-blur">
        <div className="crm-header-content flex h-14 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Link
            href="/dashboard"
            className="hidden shrink-0 items-center lg:flex"
            aria-label="Star Gardens CRM home"
          >
            <Image
              src="/images/logo.webp"
              alt="Star Gardens"
              /* 2991x539 source; this pair must keep that 5.55 ratio or
                 Next warns and the logo renders letterboxed. */
              width={155}
              height={28}
              priority
              className="h-7 w-auto object-contain"
              style={{ width: 'auto' }}
            />
          </Link>

          {/* Reads as "logo, then where you are" rather than as two unrelated
              labels sharing a bar. */}
          <span className="hidden h-6 w-px shrink-0 bg-line lg:block" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <HeaderTitle />
          </div>

          <NotificationMenu notifications={notificationPreviews ?? []} unreadCount={unread} />

          <UserMenu
            fullName={user.profile.full_name}
            email={user.email ?? user.profile.email}
            roleLabel={ROLE_LABELS[user.role]}
            avatarUrl={user.profile.avatar_url}
          />
        </div>
      </header>

      <div className="crm-workspace flex min-h-0 min-w-0 flex-1 overflow-hidden lg:overflow-visible">
        <DesktopNav role={user.role} />

        {/* On mobile this is the shell's only scrolling region. Keeping the
            header and bottom navigation outside it makes both remain visible
            even in browsers that treat fixed elements as document content. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto px-3 pt-4 pb-4 sm:px-4 lg:overflow-y-visible lg:px-6 lg:pb-8">
          {/* Uncapped: this is a work surface, not an article. Dense screens —
              the lead table, the analytics grid — were being squeezed into
              64rem while a wide monitor sat half empty either side. */}
          <div className="crm-main-content mx-auto w-full min-w-0 max-w-full">{children}</div>
        </main>
      </div>

      <MobileNav role={user.role} />
    </div>
  );
}
