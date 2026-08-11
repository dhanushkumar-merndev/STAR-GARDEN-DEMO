'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
  isActivePath,
  primaryItemsFor,
  sectionsFor,
  titleForPath,
  type NavItem,
} from './sections';
import type { UserRole } from '@/types/database';

/**
 * Navigation.
 *
 * Desktop gets a grouped sidebar — Sales, Delivery, Business — because a flat
 * list of ten links gives the eye nothing to anchor on. Mobile gets a fixed
 * bottom bar with the five most-used destinations for the signed-in role: §16
 * asks for important actions within a few taps, and a thumb reaches the bottom
 * of a phone far more easily than a hamburger in the top corner.
 *
 * Both read from `sections.ts`, which is also what names the page in the header
 * bar — so a route cannot be called one thing in the nav and another above the
 * content.
 */

export function DesktopNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const sections = sectionsFor(role);

  return (
    <nav
      aria-label="Sections"
      className="crm-desktop-nav sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 self-start overflow-y-auto overscroll-contain border-r border-line bg-surface px-3 py-4 [scrollbar-gutter:stable] lg:block"
    >
      <div className="crm-desktop-nav-content flex flex-col gap-4">
        {sections.map((section, index) => (
          <div key={section.title ?? `group-${index}`} className="flex flex-col gap-0.5">
            {section.title ? (
              <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">
                {section.title}
              </p>
            ) : null}

            {section.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActivePath(pathname, item)} />
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-brand-50 text-brand-800'
          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
      )}
    >
      <Icon className={cn('size-5 shrink-0', active && 'stroke-[2.25]')} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function MobileNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = primaryItemsFor(role);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item);

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
              <span className="max-w-full truncate px-0.5">{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The current page's name, rendered in the header bar.
 *
 * A client component because it reads the pathname. It is the page's only
 * `<h1>` — `PageHeader` deliberately stopped rendering one, so the title
 * appears once rather than twice with a gap between.
 */
export function HeaderTitle() {
  const pathname = usePathname();

  return (
    <h1 className="truncate text-base font-semibold tracking-tight text-ink sm:text-lg">
      {titleForPath(pathname)}
    </h1>
  );
}
