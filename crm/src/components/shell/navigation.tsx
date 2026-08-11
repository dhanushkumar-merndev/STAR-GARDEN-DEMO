'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  PencilRuler,
  Megaphone,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { UserRole } from '@/types/database';

/**
 * Navigation.
 *
 * Mobile gets a fixed bottom bar with the most-used destinations for the
 * signed-in role; desktop gets a sidebar with the full list. §16 asks for
 * important actions within a few taps, and a thumb reaches the bottom of a
 * phone screen far more easily than a hamburger in the top corner.
 *
 * Which items appear is a convenience, not a control: every route re-checks the
 * role on the server (§7.5).
 */

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  /** Eligible for the mobile bottom bar. */
  primary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'BDM', 'DESIGNER', 'EXECUTION'],
    primary: true,
  },
  {
    href: '/leads',
    label: 'Leads',
    shortLabel: 'Leads',
    icon: Users,
    roles: ['ADMIN', 'BDM'],
    primary: true,
  },
  {
    href: '/follow-ups',
    label: 'Follow-ups',
    shortLabel: 'Tasks',
    icon: ClipboardList,
    roles: ['ADMIN', 'BDM'],
    primary: true,
  },
  {
    href: '/site-visits',
    label: 'Site visits',
    shortLabel: 'Visits',
    icon: CalendarDays,
    roles: ['ADMIN', 'BDM', 'DESIGNER'],
    primary: true,
  },
  {
    href: '/designs',
    label: 'Designs',
    shortLabel: 'Designs',
    icon: PencilRuler,
    roles: ['ADMIN', 'BDM', 'DESIGNER'],
    primary: true,
  },
  {
    href: '/execution',
    label: 'Execution',
    shortLabel: 'Work',
    icon: HardHat,
    roles: ['ADMIN', 'BDM', 'EXECUTION'],
    primary: true,
  },
  {
    href: '/reports',
    label: 'Reports',
    shortLabel: 'Reports',
    icon: BarChart3,
    roles: ['ADMIN'],
  },
  {
    href: '/marketing/meta-ads',
    label: 'Marketing',
    shortLabel: 'Ads',
    icon: Megaphone,
    roles: ['ADMIN'],
  },
  {
    href: '/settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
    roles: ['ADMIN'],
  },
  {
    href: '/notifications',
    label: 'Notifications',
    shortLabel: 'Alerts',
    icon: Bell,
    roles: ['ADMIN', 'BDM', 'DESIGNER', 'EXECUTION'],
  },
];

function itemsFor(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

const WORKSPACE_LABEL: Record<UserRole, string> = {
  ADMIN: 'All modules',
  BDM: 'BDM workspace',
  DESIGNER: 'Landscape workspace',
  EXECUTION: 'Execution workspace',
};

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav({ role }: { role: UserRole }) {
  const isActive = useIsActive();
  const items = itemsFor(role);

  return (
    <nav
      aria-label="Desktop navigation"
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 self-start flex-col gap-1 overflow-y-auto overscroll-contain border-r border-line bg-surface p-3 [scrollbar-gutter:stable] lg:flex"
    >
      <p className="px-3 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">
        {WORKSPACE_LABEL[role]}
      </p>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-50 text-brand-800'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
            )}
          >
            <Icon className="size-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ role }: { role: UserRole }) {
  const isActive = useIsActive();
  // Five is the most that stays tappable across a 360px-wide phone.
  const items = itemsFor(role)
    .filter((i) => i.primary)
    .slice(0, 5);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'tap flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                active ? 'text-brand-700' : 'text-ink-subtle',
              )}
            >
              <Icon className={cn('size-5', active && 'stroke-[2.25]')} />
              {item.shortLabel}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
