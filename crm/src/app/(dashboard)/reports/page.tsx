import type { Metadata } from 'next';
import { requirePageRole } from '@/lib/auth/session';
import { getAdminDashboard } from '@/server/services/dashboard';
import { listAssignableBdms } from '@/server/services/leads';
import { Card, CardBody, CardHeader, PageHeader, StatTile } from '@/components/ui';
import { humanizeEnum } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Reports' };

/**
 * Admin reports and filtered CSV export (AGENTS.md §12, §3.1).
 *
 * The export form is a plain GET to `/api/reports/export`, so the browser
 * downloads the file directly and the filters stay visible in the URL. Access
 * is enforced in the route, not by hiding this page.
 */
export default async function ReportsPage() {
  const user = await requirePageRole('ADMIN');
  const data = await getAdminDashboard(user);
  const bdms = await listAssignableBdms();

  return (
    <>
      <PageHeader title="Reports" subtitle="Pipeline health and data export" />

      <div className="space-y-4">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Pipeline</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Leads this month" value={data.leadsThisMonth} tone="brand" />
            <StatTile label="Unassigned" value={data.unassigned} tone={data.unassigned ? 'warn' : 'neutral'} />
            <StatTile
              label="No next action"
              value={data.noNextAction}
              tone={data.noNextAction ? 'warn' : 'neutral'}
            />
            <StatTile
              label="Overdue follow-ups"
              value={data.followUps.overdue}
              tone={data.followUps.overdue ? 'danger' : 'neutral'}
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="By status" description="Last 90 days" />
            <CardBody>
              <Table
                rows={data.byStatus.map((r) => [humanizeEnum(r.status), r.count])}
                headers={['Status', 'Leads']}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="By source" description="Last 90 days" />
            <CardBody>
              <Table
                rows={data.bySource.map((r) => [humanizeEnum(r.source), r.count])}
                headers={['Source', 'Leads']}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="By BDM" description="Last 90 days" />
            <CardBody>
              <Table rows={data.byBdm.map((r) => [r.name, r.count])} headers={['BDM', 'Leads']} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Work in flight" />
            <CardBody>
              <Table
                headers={['Area', 'Count']}
                rows={[
                  ['Designs awaiting a designer', data.designs.awaitingAssignment],
                  ['Designs ready for review', data.designs.readyForReview],
                  ['Designs due soon', data.designs.dueSoon],
                  ['Execution projects blocked', data.execution.blocked],
                  ['Execution tasks overdue', data.execution.overdue],
                  ['Site visits overdue', data.visitsOverdue],
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Export to CSV"
            description="Every export is recorded in the audit log with its filters."
          />
          <CardBody>
            <form action="/api/reports/export" method="GET" className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-ink">Report</span>
                <select
                  name="report"
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3"
                  defaultValue="leads"
                >
                  <option value="leads">Leads</option>
                  <option value="activities">Call activity</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-ink">Owner</span>
                <select
                  name="assignedTo"
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3"
                  defaultValue="ALL"
                >
                  <option value="ALL">Everyone</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  {bdms.map((bdm) => (
                    <option key={bdm.id} value={bdm.id}>
                      {bdm.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-ink">From</span>
                <input
                  type="date"
                  name="from"
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3"
                />
              </label>

              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-ink">To</span>
                <input
                  type="date"
                  name="to"
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3"
                />
              </label>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="tap inline-flex items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Download CSV
                </button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">No data.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {headers.map((header) => (
              <th key={header} className="pb-2 font-medium text-ink-muted">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cellIndex === 0 ? 'py-2 text-ink' : 'py-2 tabular-nums text-ink-muted'}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
