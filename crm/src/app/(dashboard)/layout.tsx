import Link from 'next/link';
import Image from 'next/image';
import { Bell } from 'lucide-react';
import { requirePageUser, ROLE_SHORT_LABELS } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { signOutAction } from '@/server/actions/auth';
import { DesktopNav, MobileNav } from '@/components/shell/navigation';
import { initials } from '@/lib/utils/format';

/**
 * Authenticated application shell.
 *
 * `requirePageUser()` is the gate: middleware only refreshes the session cookie
 * and does a coarse redirect, so this is where a signed-in-but-not-authorised
 * account actually stops (§7.5, §15).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();

  const supabase = await createClient();
  const { count: unread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-ink">
            <Image
              src="/images/logo.webp"
              alt="Star Garden CRM"
              width={140}
              height={32}
              priority
              className="h-7 w-auto object-contain"
            />
            <span className="rounded-md border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-brand-800 uppercase">
              CRM
            </span>
          </Link>

          <div className="flex-1" />

          <Link
            href="/notifications"
            className="tap relative flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label={
              unread && unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
            }
          >
            <Bell className="size-5" />
            {unread && unread > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-muted"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
                {initials(user.profile.full_name)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium text-ink">
                  {user.profile.full_name}
                </span>
                <span className="block text-xs text-ink-muted">
                  {ROLE_SHORT_LABELS[user.role]}
                </span>
              </span>
            </Link>

            <form action={signOutAction}>
              <button
                type="submit"
                className="tap rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <DesktopNav role={user.role} />

        {/* pb-20 keeps the last row clear of the fixed mobile nav bar. */}
        <main className="min-w-0 flex-1 px-4 pt-4 pb-20 lg:px-6 lg:pb-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      <MobileNav role={user.role} />
    </div>
  );
}
