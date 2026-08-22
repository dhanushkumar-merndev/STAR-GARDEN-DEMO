'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { LuCheck, LuChevronDown, LuLoaderCircle, LuSearch } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};

export type CustomSelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'defaultValue' | 'multiple' | 'onChange' | 'size' | 'value'
> & {
  children: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  /**
   * Force the search box on regardless of how many options there are.
   *
   * Every picker that lists *people* passes this. A team of three today is a
   * team of thirty next year, and staff should not have to learn that the
   * same "Owner" dropdown types in some places and not others — the control
   * behaves one way wherever a name is being chosen. Left unset, the search
   * box still appears on its own past `SEARCH_THRESHOLD`.
   */
  searchable?: boolean;
  /**
   * Ask the server for matches instead of filtering the options already in
   * the page — a Server Action taking what was typed and returning the
   * options to show.
   *
   * This is what keeps a picker's cost proportional to what is on screen
   * rather than to the size of the table behind it. The page renders one
   * screenful of options; typing asks for the rest, debounced by
   * `SEARCH_DEBOUNCE_MS` so a name typed at speed costs one query and not one
   * per keystroke. Clearing the box returns to the options the page shipped,
   * with no request at all.
   */
  onSearch?: (search: string) => Promise<{ value: string; label: string }[]>;
};

/** Below this many real options, a search box only adds a step with nothing to filter. */
const SEARCH_THRESHOLD = 7;

/** Long enough to finish a name, short enough not to feel like a wait. */
const SEARCH_DEBOUNCE_MS = 500;

/**
 * Below this, typing filters what the page already sent instead of asking the
 * server. Postgres' trigram index needs three characters to match on, so a one
 * or two letter `ilike '%a%'` is a sequential scan of the staff table that
 * would also match nearly everyone — a scan to answer a useless question.
 */
const SEARCH_MIN_LENGTH = 3;

/** One look for the closed control, whichever menu is behind it. */
const TRIGGER_CLASSES =
  'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-ink transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle';

/**
 * Whether this is a touch device, tracked live (a tablet can gain a mouse).
 *
 * `useSyncExternalStore` rather than an effect: it has an explicit server
 * snapshot, so the first client render matches the HTML instead of flipping
 * the whole control on hydration.
 */
function useCoarsePointer(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia('(pointer: coarse)');
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
}

/**
 * A form-compatible Radix select that accepts normal `<option>` children.
 * Keeping the native-looking API means every existing CRM form gets the same
 * accessible custom menu without rewriting its validation or FormData flow.
 *
 * Past `SEARCH_THRESHOLD` options — or on any picker that passes `searchable`,
 * which every people picker does — a search box appears above the list and the
 * list itself caps at roughly three rows with a scrollbar for the rest, rather
 * than one long list a hundred names deep with no way to jump to one. With
 * `onSearch` the typing goes to the server, so the page never has to ship the
 * whole list to begin with.
 *
 * On a touch device the options open in a bottom sheet instead of Radix's
 * popper. A popper and a virtual keyboard fight: Radix moves focus onto the
 * selected item once the popper reports its position, which shuts the keyboard
 * the search box just opened; its content locks body scrolling on top of the
 * mobile shell's own lock, which shifts the trigger out from under the finger
 * mid-tap so the menu dismisses itself; and the trigger stops toggling because
 * the tap that should close it is treated as an outside press that reopens it.
 * The sheet is a plain dialog with a plain input, so none of that applies — and
 * it is the pattern the rest of this app's mobile surfaces already use.
 */
export function CustomSelect({
  children,
  className,
  defaultValue,
  disabled,
  id,
  name,
  onChange,
  onSearch,
  required,
  searchable: searchableProp,
  value,
  ...props
}: CustomSelectProps) {
  const options = React.useMemo(() => readOptions(children), [children]);
  const placeholder = options.find((option) => option.value === '')?.label ?? 'Select an option';
  const firstSelectable = options.find((option) => option.value !== '' && !option.disabled)?.value ?? '';
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(() => defaultValue ?? firstSelectable);
  const selectedValue = controlled ? value ?? '' : internalValue;

  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);
  const touch = useCoarsePointer();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const listboxId = React.useId();

  const selectable = React.useMemo(() => options.filter((option) => option.value !== ''), [options]);
  // A forced search box still needs something to filter: with one option
  // there is nothing to type towards, so it would only be a step in the way.
  // Server-backed pickers are the exception — the one option on screen is a
  // page of many, and the rest are a keystroke away.
  const searchable = onSearch
    ? true
    : searchableProp
      ? selectable.length > 1
      : options.length > SEARCH_THRESHOLD + 1; // +1 for the blank placeholder option

  /* ---------------------------------------------------------------------- */
  /* Server-backed search                                                    */
  /* ---------------------------------------------------------------------- */

  const [results, setResults] = React.useState<SelectOption[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  // Labels for people the page never shipped, learned from search results —
  // see `pinned` below for what they are for.
  const [knownLabels, setKnownLabels] = React.useState<Record<string, string>>({});

  // Held in a ref so a call site passing an inline arrow cannot restart the
  // debounce on every render.
  const onSearchRef = React.useRef(onSearch);
  React.useEffect(() => {
    onSearchRef.current = onSearch;
  });

  // Bumped per request, so a slow answer to "ab" can never overwrite the
  // answer to "abhi" that the user is already looking at.
  const requestRef = React.useRef(0);

  /** When the menu opened, so the tap that opened it cannot also dismiss it. */
  const openedAtRef = React.useRef(0);

  /**
   * The debounce itself. Clearing the box and the "searching…" flag belong to
   * the change handler below rather than here: an effect that sets state
   * synchronously just to react to its own input is a cascading render, and
   * the state in question is a direct consequence of a keystroke.
   */
  React.useEffect(() => {
    if (!onSearch) return;

    const search = query.trim();
    if (search.length < SEARCH_MIN_LENGTH) return;

    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const found = (await onSearchRef.current?.(search)) ?? [];
        if (requestRef.current !== request) return;
        setResults(found.map((option) => ({ ...option, disabled: false })));
        setKnownLabels((previous) => {
          let changed = false;
          const next = { ...previous };
          for (const option of found) {
            if (next[option.value] !== option.label) {
              next[option.value] = option.label;
              changed = true;
            }
          }
          return changed ? next : previous;
        });
      } catch {
        // A failed lookup shows "No match" rather than an empty menu with no
        // explanation; the next keystroke retries on its own.
        if (requestRef.current === request) setResults([]);
      } finally {
        if (requestRef.current === request) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, onSearch]);

  /* ---------------------------------------------------------------------- */
  /* What the menu shows                                                     */
  /* ---------------------------------------------------------------------- */

  const base = results ?? selectable;

  // The chosen option has to stay in the list even once the results it came
  // from are gone: Radix renders the trigger's label from the selected item's
  // own text node — and keeps that item mounted in a detached fragment while
  // the menu is closed — so dropping it blanks the control back to its
  // placeholder. Unmounting it also costs the search box its focus (see the
  // Viewport comment below). Picking someone from a search result and then
  // clearing the query is exactly that case, so the label remembered from
  // that result re-renders the chosen one.
  const pinnedLabel = selectedValue ? knownLabels[selectedValue] : undefined;
  const pinned =
    pinnedLabel && !base.some((option) => option.value === selectedValue)
      ? { value: selectedValue, label: pinnedLabel, disabled: false }
      : null;

  const shown = pinned ? [...base, pinned] : base;

  const needle = query.trim().toLowerCase();
  const matches = (option: SelectOption) => !needle || option.label.toLowerCase().includes(needle);
  const visible = shown.filter(matches);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (!onSearch) return;
    // Whatever is in flight answers a query the user has already moved past.
    requestRef.current += 1;
    if (next.trim().length >= SEARCH_MIN_LENGTH) {
      setSearching(true);
    } else {
      setResults(null);
      setSearching(false);
    }
  }

  function handleValueChange(nextValue: string) {
    if (!controlled) setInternalValue(nextValue);
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as React.ChangeEvent<HTMLSelectElement>);
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      setQuery('');
      /**
       * Auto-focus the search box on pointer devices only.
       *
       * Radix focuses the selected item once the popper reports it has been
       * positioned — an effect keyed on `isPositioned`, which lands a frame or
       * two after open, i.e. *after* this. On a desktop that race is invisible.
       * On a phone it is not: our focus opens the virtual keyboard, Radix takes
       * focus back onto a `div`, and the keyboard closes again — a flash of
       * keyboard for every dropdown tap, which is the bug this guards.
       *
       * A touch user has to tap the field to type anyway, and by then the
       * positioning effect has already run and has nothing left to steal.
       */
      const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      if (searchable && !touch) requestAnimationFrame(() => searchRef.current?.focus());
      openedAtRef.current = Date.now();
    } else {
      requestRef.current += 1;
      setResults(null);
      setSearching(false);
    }
  }

  const selectedLabel = shown.find((option) => option.value === selectedValue)?.label;
  const sheetTitle = props['aria-label'] ?? placeholder;

  const searchBox = searchable ? (
    <div className="relative">
      {searching ? (
        <LuLoaderCircle
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-brand-600"
          aria-hidden="true"
        />
      ) : (
        <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
      )}
      <input
        ref={searchRef}
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder="Search…"
        className="h-11 w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
      />
    </div>
  ) : null;

  if (touch) {
    return (
      <>
        {/* Radix's own hidden `<select>` goes with the popper, so the form
            needs this to keep submitting a value. Native `required` is lost
            with it — every one of these forms validates on the server, which
            is where the real check has always been. */}
        {name ? <input type="hidden" name={name} value={selectedValue} /> : null}

        <button
          type="button"
          id={id}
          disabled={disabled}
          // `combobox`, not the implicit `button`: a button role carries
          // neither `aria-invalid` nor `aria-expanded`, and this control is
          // exactly what combobox describes — a value plus a list to pick from.
          role="combobox"
          aria-label={props['aria-label']}
          aria-invalid={props['aria-invalid']}
          aria-describedby={props['aria-describedby']}
          aria-haspopup="listbox"
          aria-expanded={sheetOpen}
          aria-controls={listboxId}
          onClick={() => {
            setSheetOpen(true);
            handleOpenChange(true);
          }}
          className={cn(TRIGGER_CLASSES, !selectedLabel && 'text-ink-subtle', className)}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <LuChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        </button>

        <DialogPrimitive.Root
          open={sheetOpen}
          onOpenChange={(next) => {
            setSheetOpen(next);
            handleOpenChange(next);
          }}
        >
          <DialogPrimitive.Portal>
            {/* A plain backdrop, not Radix Overlay — the same reason
                `MobileSheet` gives: the authenticated mobile shell already
                locks the document and scrolls `<main>`, and a second
                react-remove-scroll lock on top of that moves that scroller. */}
            <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/40" style={{ pointerEvents: 'auto' }} />
            <DialogPrimitive.Content
              // No auto-focus: on a phone that opens the keyboard over the
              // list before anyone has asked to type. Tapping the search box
              // opens it, and by then nothing is left to steal focus back.
              onOpenAutoFocus={(event) => event.preventDefault()}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl"
            >
              <div className="shrink-0 space-y-3 border-b border-line px-4 py-3">
                <DialogPrimitive.Title className="text-base font-semibold text-ink">
                  {sheetTitle}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">{sheetTitle}</DialogPrimitive.Description>
                {searchBox}
              </div>

              <div
                id={listboxId}
                role="listbox"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
                style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
              >
                {visible.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-ink-subtle">
                    {searching ? 'Searching…' : 'No match'}
                  </p>
                ) : (
                  visible.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === selectedValue}
                      disabled={option.disabled}
                      onClick={() => {
                        handleValueChange(option.value);
                        setSheetOpen(false);
                        handleOpenChange(false);
                      }}
                      className={cn(
                        'tap flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm text-ink disabled:opacity-50',
                        option.value === selectedValue && 'bg-brand-50 font-medium text-brand-900',
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {option.value === selectedValue ? (
                        <LuCheck className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </>
    );
  }

  return (
    <SelectPrimitive.Root
      name={name}
      value={selectedValue || undefined}
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={props['aria-invalid']}
        aria-describedby={props['aria-describedby']}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-ink transition-colors',
          'focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none',
          'data-[placeholder]:text-ink-subtle disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <LuChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          // Typing in the search box must not also move the Radix "roving
          // highlight" that arrow keys/typeahead normally drive — that's
          // what double-filters (once by our query, once by Radix's own
          // first-letter jump) and fights the cursor. Only search box
          // keystrokes are exempted below; item navigation is untouched.
          onCloseAutoFocus={(event) => searchable && event.preventDefault()}
          /**
           * Ignore an "outside" press in the first moments after opening.
           *
           * On a phone the menu opens on `click`, not `pointerdown` (Radix
           * defers for non-mouse pointers), so the rest of that same tap is
           * still to come — and the layout moves underneath it: the mobile
           * shell scrolls `main` rather than the document, while Radix's
           * content mounts react-remove-scroll and locks the body too. The
           * same double lock this repo already worked around for MobileSheet.
           * When that shifts the trigger out from under the finger, the tap's
           * own release lands outside the menu and dismisses it — the menu
           * appears to open and shut in one tap.
           *
           * A dismissal this soon can only be the opening tap; a deliberate
           * second press is never 300ms behind the first.
           */
          onPointerDownOutside={(event) => {
            if (Date.now() - openedAtRef.current < 300) event.preventDefault();
          }}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {searchable ? (
            <div className="relative mb-1 border-b border-line px-1 pb-1">
              {searching ? (
                <LuLoaderCircle
                  className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 animate-spin text-brand-600"
                  aria-hidden="true"
                />
              ) : (
                <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-subtle" />
              )}
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  // Radix's own typeahead intercepts a-z keystrokes on the
                  // Content element before they reach here unless stopped —
                  // it would otherwise jump-select by first letter on top of
                  // our filtering.
                  event.stopPropagation();
                  if (event.key === 'Enter' && visible.length > 0) {
                    event.preventDefault();
                    handleValueChange(visible[0]!.value);
                  }
                }}
                placeholder="Search…"
                className="h-8 w-full rounded-md border-0 bg-surface-muted py-1.5 pr-2 pl-8 text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          ) : null}

          <SelectPrimitive.Viewport
            className={cn('overflow-y-auto', searchable ? 'max-h-32' : 'max-h-72')}
          >
            {/* Every option stays mounted; the ones that do not match are
                hidden rather than removed.

                Unmounting them is what made the search box lose focus after a
                keystroke. Radix tracks the selected item as *state* (set from
                each Item's ref callback) and re-runs `focusSelectedItem()`
                whenever that state changes. Filtering the selected option out
                of the tree fires its ref callback with `null`, so Radix falls
                through to focusing the Content element — pulling focus off the
                input mid-word, which is exactly what happened as soon as the
                query stopped matching the current selection. Hiding keeps the
                ref attached, so Radix has no reason to move focus at all.

                `disabled` on a hidden option keeps arrow keys from walking
                into it — Radix's Up/Down handler skips disabled items. */}
            {shown.map((option) => {
              const isVisible = matches(option);
              return (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled || !isVisible}
                  className={cn(
                    'relative flex min-h-10 cursor-pointer select-none items-center rounded-md py-2 pr-8 pl-3 text-sm text-ink outline-none data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                    !isVisible && 'hidden',
                  )}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center text-brand-700">
                    <LuCheck className="size-4" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              );
            })}
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-ink-subtle">
                {searching ? 'Searching…' : 'No match'}
              </p>
            ) : null}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function readOptions(children: React.ReactNode): SelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== 'option') return [];
    const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode };
    const label = optionText(props.children).trim();
    return [{ value: props.value === undefined ? label : String(props.value), label, disabled: Boolean(props.disabled) }];
  });
}

function optionText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return React.isValidElement(child)
        ? optionText((child.props as { children?: React.ReactNode }).children)
        : '';
    })
    .join('');
}
