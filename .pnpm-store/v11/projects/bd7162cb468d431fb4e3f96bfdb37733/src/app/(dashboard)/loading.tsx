/**
 * Immediate navigation feedback for every authenticated route.
 *
 * Besides avoiding a frozen-looking click, this boundary lets Next.js
 * partially prefetch the dynamic dashboard routes while preserving the shared
 * application shell.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-surface-muted" />
          <div className="h-3 w-56 max-w-[65vw] rounded bg-surface-muted" />
        </div>
        <div className="h-10 w-24 rounded-lg bg-surface-muted" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="card h-20 bg-surface-muted/60" />
        ))}
      </div>

      <div className="card overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="border-b border-line p-4 last:border-b-0">
            <div className="h-4 w-2/5 rounded bg-surface-muted" />
            <div className="mt-2 h-3 w-3/5 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
