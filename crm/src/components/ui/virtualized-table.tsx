'use client';

import * as React from 'react';
import { Badge, Button, Select, type Tone } from '@/components/ui';

export interface VirtualizedColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'right';
}

export interface VirtualizedCell {
  text: string;
  tone?: Tone;
}

export interface VirtualizedRow {
  id: string;
  cells: Record<string, VirtualizedCell>;
}

const ROW_HEIGHT = 49;
const OVERSCAN = 4;

/**
 * Fixed-height virtualized table with client pagination.
 *
 * Only the visible rows (plus four above/below) enter the DOM. Pagination keeps
 * navigation predictable on phones and caps the amount of data held by one
 * viewport. This is intended for flat admin/report rows; complex editable cards
 * use server pagination instead because their heights are intentionally fluid.
 */
export function VirtualizedTable({
  columns,
  rows,
  initialPageSize = 25,
  emptyMessage = 'No data.',
}: {
  columns: VirtualizedColumn[];
  rows: VirtualizedRow[];
  initialPageSize?: 10 | 25 | 50 | 100;
  emptyMessage?: string;
}) {
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const [page, setPage] = React.useState(1);
  const [scrollTop, setScrollTop] = React.useState(0);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const viewportHeight = Math.min(490, Math.max(ROW_HEIGHT, pageRows.length * ROW_HEIGHT));
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(pageRows.length, start + visibleCount + OVERSCAN * 2);
  const visibleRows = pageRows.slice(start, end);
  const gridTemplateColumns = columns.map((column) => column.width ?? 'minmax(8rem,1fr)').join(' ');

  function go(nextPage: number) {
    setPage(Math.max(1, Math.min(totalPages, nextPage)));
    setScrollTop(0);
    viewportRef.current?.scrollTo({ top: 0 });
  }

  if (rows.length === 0) return <p className="p-4 text-sm text-ink-muted">{emptyMessage}</p>;

  return (
    <div>
      <div className="overflow-x-auto" role="table" aria-rowcount={rows.length}>
        <div className="min-w-max">
          <div
            role="row"
            className="grid h-11 items-center border-b border-line bg-surface-muted text-xs font-medium text-ink-muted"
            style={{ gridTemplateColumns }}
          >
            {columns.map((column) => (
              <div key={column.key} role="columnheader" className={column.align === 'right' ? 'px-3 text-right' : 'px-3'}>
                {column.label}
              </div>
            ))}
          </div>

          <div
            ref={viewportRef}
            className="overflow-y-auto"
            style={{ height: viewportHeight }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <div className="relative" style={{ height: pageRows.length * ROW_HEIGHT }} role="rowgroup">
              {visibleRows.map((row, visibleIndex) => {
                const rowIndex = start + visibleIndex;
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-rowindex={(currentPage - 1) * pageSize + rowIndex + 2}
                    className="absolute inset-x-0 grid items-center border-b border-line bg-surface text-sm hover:bg-surface-muted"
                    style={{
                      gridTemplateColumns,
                      height: ROW_HEIGHT,
                      transform: `translateY(${rowIndex * ROW_HEIGHT}px)`,
                    }}
                  >
                    {columns.map((column) => {
                      const cell = row.cells[column.key] ?? { text: '—' };
                      return (
                        <div
                          key={column.key}
                          role="cell"
                          className={`truncate px-3 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                          title={cell.text}
                        >
                          {cell.tone ? <Badge tone={cell.tone}>{cell.text}</Badge> : cell.text}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Rows per page
          <Select
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as 10 | 25 | 50 | 100);
              go(1);
            }}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </Select>
        </label>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <span className="w-full text-xs text-ink-muted sm:w-auto">Page {currentPage} of {totalPages} · {rows.length} rows</span>
          <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => go(currentPage - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => go(currentPage + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
