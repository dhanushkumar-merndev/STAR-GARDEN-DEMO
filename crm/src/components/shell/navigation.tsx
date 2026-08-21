'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { LuMenu, LuX } from 'react-icons/lu';
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
  const primaryItems = primaryItemsFor(role).slice(0, 4);
  const primaryHrefs = new Set(primaryItems.map((item) => item.href));
  const menuSections = sectionsFor(role)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !primaryHrefs.has(item.href)),
    }))
    .filter((section) => section.items.length > 0);
  const menuActive = menuSections.some((section) =>
    section.items.some((item) => isActivePath(pathname, item)),
  );

  return (
    <nav
      className="relative z-40 w-full shrink-0 overflow-x-clip border-t border-line bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {/* Edge to edge, not a centred 32rem bar. The cap was meant to keep five
          targets in thumb reach on a large phone, but it reads as the nav being
          off-centre against a full-width page, and every phone this is used on
          is narrower than the cap anyway. */}
      <div className="flex w-full min-w-0">
        {primaryItems.map((item) => {
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

        <DialogPrimitive.Root>
          <DialogPrimitive.Trigger
            className={cn(
              'tap flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
              menuActive ? 'text-brand-700' : 'text-ink-subtle',
            )}
            aria-label="Open navigation menu"
          >
            <LuMenu className={cn('size-5', menuActive && 'stroke-[2.25]')} />
            <span>Menu</span>
          </DialogPrimitive.Trigger>

          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="mobile-menu-overlay fixed inset-0 z-50 bg-black/40" />
            <DialogPrimitive.Content
              className="mobile-menu-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col bg-surface shadow-2xl focus:outline-none sm:w-[min(21rem,88vw)] sm:border-l sm:border-line"
              aria-describedby={undefined}
            >
              <div className="flex h-14 items-center justify-between border-b border-line px-4">
                <DialogPrimitive.Title className="text-base font-semibold text-ink">
                  Menu
                </DialogPrimitive.Title>
                <DialogPrimitive.Close className="tap flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Close menu">
                  <LuX className="size-5" />
                </DialogPrimitive.Close>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
                <div className="space-y-5">
                  {menuSections.map((section, index) => (
                    <section key={section.title ?? `menu-group-${index}`}>
                      {section.title ? (
                        <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">
                          {section.title}
                        </p>
                      ) : null}
                      <div className="space-y-1">
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          const active = isActivePath(pathname, item);
                          return (
                            <DialogPrimitive.Close asChild key={item.href}>
                              <Link
                                href={item.href}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                  'tap flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                                  active
                                    ? 'bg-brand-50 text-brand-800'
                                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                                )}
                              >
                                <Icon className={cn('size-5 shrink-0', active && 'stroke-[2.25]')} />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              </Link>
                            </DialogPrimitive.Close>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
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
