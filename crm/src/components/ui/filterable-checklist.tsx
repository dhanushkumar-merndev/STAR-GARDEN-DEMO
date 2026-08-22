'use client';

import * as React from 'react';
import { LuLoaderCircle, LuSearch } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

type Person = { id: string; full_name: string };

/** Matches the single-select picker, so both people controls feel the same. */
const SEARCH_DEBOUNCE_MS = 500;

/** Below this, typing filters what the page already sent — see `CustomSelect`. */
const SEARCH_MIN_LENGTH = 3;

/**
 * A checkbox list of people with a search box and a capped, scrolling height —
 * the multi-select counterpart to `CustomSelect`, for pickers like "Assign to"
 * on the execution handover, where more than one person can be chosen.
 *
 * With `onSearch` it works the same way that control does: the page ships one
 * screenful and typing asks the server for the rest, debounced so a name typed
 * at speed costs one query rather than one per letter. Without it, typing
 * filters the names already in the page.
 *
 * Plain checkboxes underneath (same `name`/`value` pair repeated, exactly how
 * the existing `Checkbox` component already worked here), so the server
 * action's `formData.getAll(name)` is unaffected either way.
 */
export function FilterableChecklist({
  name,
  items,
  emptyLabel = 'Nobody available.',
  onSearch,
}: {
  name: string;
  items: Person[];
  emptyLabel?: string;
  /** Server Action returning the people matching what was typed. */
  onSearch?: (search: string) => Promise<{ value: string; label: string }[]>;
}) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<Person[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  /**
   * Who is ticked, by id, with the name to render them by.
   *
   * Held here rather than left to the DOM because the list underneath changes:
   * search for "prem", tick Prema, search for someone else, and an uncontrolled
   * checkbox would unmount and take the choice with it. Everyone ticked stays
   * rendered — below the results if the search no longer matches them — so the
   * form submits the full selection and you can always see what you picked.
   */
  const [selected, setSelected] = React.useState<Record<string, string>>({});

  const onSearchRef = React.useRef(onSearch);
  React.useEffect(() => {
    onSearchRef.current = onSearch;
  });

  // Bumped per request, so a slow answer to "ab" cannot overwrite "abhi".
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    if (!onSearch) return;
    const search = query.trim();
    if (search.length < SEARCH_MIN_LENGTH) return;

    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const found = (await onSearchRef.current?.(search)) ?? [];
        if (requestRef.current !== request) return;
        setResults(found.map((person) => ({ id: person.value, full_name: person.label })));
      } catch {
        if (requestRef.current === request) setResults([]);
      } finally {
        if (requestRef.current === request) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, onSearch]);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (!onSearch) return;
    requestRef.current += 1;
    if (next.trim().length >= SEARCH_MIN_LENGTH) {
      setSearching(true);
    } else {
      setResults(null);
      setSearching(false);
    }
  }

  function toggle(person: Person, checked: boolean) {
    setSelected((previous) => {
      const next = { ...previous };
      if (checked) next[person.id] = person.full_name;
      else delete next[person.id];
      return next;
    });
  }

  const needle = query.trim().toLowerCase();
  const base = results ?? items;
  const matching = base.filter(
    (person) => !needle || person.full_name.toLowerCase().includes(needle),
  );

  // Ticked people the current list does not contain, kept on screen so the
  // selection is never invisible or silently dropped.
  const pinned = Object.entries(selected)
    .filter(([id]) => !matching.some((person) => person.id === id))
    .map(([id, full_name]) => ({ id, full_name }));

  const searchable = Boolean(onSearch) || items.length > 1;

  if (items.length === 0 && !onSearch) {
    return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  }

  return (
    <div>
      {searchable ? (
        <div className="relative mb-2">
          {searching ? (
            <LuLoaderCircle
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 animate-spin text-brand-600"
              aria-hidden="true"
            />
          ) : (
            <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-subtle" />
          )}
          <input
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search…"
            className="h-9 w-full rounded-md border border-line bg-surface py-1.5 pr-2 pl-8 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </div>
      ) : null}

      <div className={cn('space-y-1 overflow-y-auto', searchable ? 'max-h-32' : '')}>
        {matching.length === 0 && pinned.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-subtle">{searching ? 'Searching…' : 'No match'}</p>
        ) : (
          [...matching, ...pinned].map((person) => (
            <label
              key={person.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                name={name}
                value={person.id}
                checked={Boolean(selected[person.id])}
                onChange={(event) => toggle(person, event.target.checked)}
                className="size-5 shrink-0 rounded border-line text-brand-600 focus:ring-brand-300"
              />
              <span className="text-sm font-medium text-ink">{person.full_name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
