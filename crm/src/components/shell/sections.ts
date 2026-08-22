import {
  LuBell,
  LuCalendarDays,
  LuChartColumn,
  LuClipboardList,
  LuHardHat,
  LuLayoutDashboard,
  LuMegaphone,
  LuPencilRuler,
  LuSettings,
  LuUsers,
  LuWallet,
} from 'react-icons/lu';
import type { UserRole } from '@/types/database';

/**
 * The single definition of the application's navigation.
 *
 * Grouped into named sections because a flat list of ten links gives the eye
 * nothing to anchor on — "Landscape" and "Execution" are stages of one pipeline
 * and read far faster under a heading that says so.
 *
 * The same table drives the sidebar, the mobile bar and the page title in the
 * header, so a route can never appear in the nav under one name and in the
 * header under another.
 *
 * Which items appear is a convenience, not a control: every route re-checks the
 * role on the server (§7.5).
 */

export interface NavItem {
  href: string;
  label: string;
  /** Fits a 360px-wide phone's bottom bar. */
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  /** Eligible for the mobile bottom bar. */
  primary?: boolean;
  /** Extra routes that should light this item up and borrow its title. */
  matches?: string[];
}

export interface NavSection {
  /** Null renders the items with no heading — used for the single Home link. */
  title: string | null;
  items: NavItem[];
}

const STAFF: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'BDM', 'LANDSCAPER', 'EXECUTION'];

export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        shortLabel: 'Home',
        icon: LuLayoutDashboard,
        roles: STAFF,
        primary: true,
      },
    ],
  },
  {
    title: 'Sales',
    items: [
      {
        href: '/leads',
        label: 'Leads',
        shortLabel: 'Leads',
        icon: LuUsers,
        roles: ['SUPER_ADMIN', 'ADMIN', 'BDM'],
        primary: true,
      },
      {
        href: '/follow-ups',
        label: 'Follow-ups',
        shortLabel: 'Tasks',
        icon: LuClipboardList,
        roles: ['SUPER_ADMIN', 'ADMIN', 'BDM'],
        primary: true,
      },
    ],
  },
  {
    title: 'Delivery',
    items: [
      {
        href: '/site-visits',
        label: 'Site visits',
        shortLabel: 'Visits',
        icon: LuCalendarDays,
        roles: ['SUPER_ADMIN', 'ADMIN', 'BDM', 'LANDSCAPER'],
        primary: true,
      },
      {
        href: '/designs',
        label: 'Landscape design',
        shortLabel: 'Design',
        icon: LuPencilRuler,
        roles: ['SUPER_ADMIN', 'ADMIN', 'BDM', 'LANDSCAPER'],
        primary: true,
      },
      {
        href: '/execution',
        label: 'Execution',
        shortLabel: 'Work',
        icon: LuHardHat,
        roles: ['SUPER_ADMIN', 'ADMIN', 'BDM', 'EXECUTION'],
        primary: true,
      },
    ],
  },
  {
    title: 'Business',
    items: [
      {
        href: '/accounts',
        label: 'Accounts',
        shortLabel: 'Accounts',
        icon: LuWallet,
        // Super-Admin-only: money, in both directions (§ permissions/index.ts
        // canRecordAccount/canViewAccounts/canExportAccounts).
        roles: ['SUPER_ADMIN'],
      },
      {
        href: '/reports',
        label: 'Reports',
        shortLabel: 'Reports',
        icon: LuChartColumn,
        roles: ['SUPER_ADMIN'],
      },
      {
        href: '/marketing/meta-ads',
        label: 'Marketing',
        shortLabel: 'Ads',
        icon: LuMegaphone,
        roles: ['SUPER_ADMIN'],
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        href: '/notifications',
        label: 'Notifications',
        shortLabel: 'Alerts',
        icon: LuBell,
        roles: STAFF,
      },
      {
        href: '/settings',
        label: 'Settings',
        shortLabel: 'Settings',
        icon: LuSettings,
        // Super-Admin-only: this is where roles themselves are handed out, so
        // an Admin cannot promote a colleague (or themselves) to Super Admin.
        roles: ['SUPER_ADMIN'],
        matches: ['/profile'],
      },
    ],
  },
];

/** Flattened, for lookups that do not care about grouping. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function sectionsFor(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

export function primaryItemsFor(role: UserRole): NavItem[] {
  // Five is the most that stays tappable across a 360px-wide phone.
  return NAV_ITEMS.filter((item) => item.roles.includes(role) && item.primary).slice(0, 5);
}

export function isActivePath(pathname: string, item: NavItem): boolean {
  const candidates = [item.href, ...(item.matches ?? [])];
  return candidates.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

/**
 * The title shown in the header bar.
 *
 * Longest match wins, so `/settings/users` picks up "Users" rather than falling
 * back to "Settings". Detail routes that carry a record id resolve to their
 * section's name — the record's own identity is the first thing on the page
 * itself, so repeating it in the bar would be noise.
 */
const EXTRA_TITLES: Record<string, string> = {
  '/profile': 'My profile',
  '/settings/users': 'Users and access',
  '/settings/integrations': 'Integrations',
  '/settings/integrations/mapping': 'Lead field mapping',
  '/settings/integrations/issues': 'Integration issues',
  '/settings/options': 'Dropdown options',
  '/settings/audit': 'Audit log',
  '/leads/new': 'New lead',
};

export function titleForPath(pathname: string): string {
  const exact = EXTRA_TITLES[pathname];
  if (exact) return exact;

  const extraPrefix = Object.keys(EXTRA_TITLES)
    .filter((href) => pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (extraPrefix) return EXTRA_TITLES[extraPrefix]!;

  const match = NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];

  return match?.label ?? 'Star Gardens CRM';
}
