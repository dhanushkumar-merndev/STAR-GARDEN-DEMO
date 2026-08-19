'use client';

import * as React from 'react';
import Link from 'next/link';
import type { EChartsOption } from 'echarts';
import {
  LuArrowRight,
  LuCalendarCheck,
  LuChartLine,
  LuClipboardCheck,
  LuHardHat,
  LuMaximize2,
  LuMinimize2,
  LuPencilRuler,
  LuPhoneCall,
  LuTable2,
  LuUsers,
} from 'react-icons/lu';
import type {
  AdminOperationalKpis,
  DashboardBreakdownItem,
} from '@/server/services/dashboard';
import { Chart } from '@/components/charts/chart';
import { AXIS_LABEL, CHART_BRAND, CHART_INK, TOOLTIP_BASE } from '@/components/charts/theme';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { humanizeEnum } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { loadSalesMemberAnalyticsAction } from '@/server/actions/admin';

type MetricKey = keyof AdminOperationalKpis['trends'][number];
type Tone = 'brand' | 'neutral' | 'warn' | 'danger' | 'info' | 'ok';

interface KpiCardData {
  label: string;
  value: number;
  tone?: Tone;
  hint?: string;
  href?: string;
}

interface KpiSectionData {
  id: string;
  title: string;
  description: string;
  metric: MetricKey;
  icon: React.ReactNode;
  cards: KpiCardData[];
  breakdown: DashboardBreakdownItem[];
  details?: React.ReactNode;
  hideCardsInDialog?: boolean;
  viewHref: string;
}

export function OperationalKpis({
  data,
  rangeLabel,
  rangeFrom,
  rangeTo,
}: {
  data: AdminOperationalKpis;
  rangeLabel: string;
  rangeFrom: string;
  rangeTo: string;
}) {
  const [active, setActive] = React.useState<KpiSectionData | null>(null);
  const [salesExpanded, setSalesExpanded] = React.useState(false);
  const [selectedMember, setSelectedMember] = React.useState<AdminOperationalKpis['sales']['members'][number] | null>(null);
  const [memberFrom, setMemberFrom] = React.useState(toIstDate(rangeFrom));
  const [memberTo, setMemberTo] = React.useState(toIstDate(new Date(new Date(rangeTo).getTime() - 1).toISOString()));
  const [memberDays, setMemberDays] = React.useState<MemberDailyRow[]>([]);
  const [memberError, setMemberError] = React.useState<string | null>(null);
  const [memberPending, startMemberTransition] = React.useTransition();
  const [memberView, setMemberView] = React.useState<'CHART' | 'TABLE'>('CHART');
  const [memberPage, setMemberPage] = React.useState(1);
  const [memberPageSize, setMemberPageSize] = React.useState(25);
  const [memberExpanded, setMemberExpanded] = React.useState(true);
  const [followUpMembersOpen, setFollowUpMembersOpen] = React.useState(false);
  const [followUpPage, setFollowUpPage] = React.useState(1);
  const [followUpPageSize, setFollowUpPageSize] = React.useState(25);

  function loadMember(
    member: AdminOperationalKpis['sales']['members'][number],
    from = memberFrom,
    to = memberTo,
    initialView?: 'CHART' | 'TABLE',
  ) {
    setSelectedMember(member);
    setMemberExpanded(true);
    if (initialView) setMemberView(initialView);
    setMemberError(null);
    startMemberTransition(async () => {
      const result = await loadSalesMemberAnalyticsAction(
        member.id,
        `${from}T00:00:00+05:30`,
        new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString(),
      );
      if (!result.ok) {
        setMemberError(result.message);
        return;
      }
      setMemberDays(result.data.days ?? []);
      setMemberPage(1);
    });
  }

  const sections: KpiSectionData[] = [
    {
      id: 'leads',
      title: 'Leads',
      description: 'Lead intake and unsuccessful contact outcomes',
      metric: 'leads',
      icon: <LuUsers className="size-4" />,
      cards: [
        { label: 'Today leads', value: data.leads.today, tone: 'brand' },
        { label: 'Leads in range', value: data.leads.all },
        { label: 'Not interested', value: data.leads.not_interested, tone: data.leads.not_interested ? 'warn' : 'neutral', hint: 'Includes unsuccessful outcomes' },
        { label: 'Invalid', value: data.leads.invalid, tone: data.leads.invalid ? 'danger' : 'neutral' },
      ],
      // This popup is for lead intake and call results. Lead workflow stages
      // such as SITE_VISIT_COMPLETED belong to the dedicated Site visits KPI.
      breakdown: data.leads.call_outcomes,
      details: (
        <BreakdownList
          items={[
            { label: 'Today leads', count: data.leads.today },
            { label: 'Leads in range', count: data.leads.all },
            ...data.leads.call_outcomes,
          ]}
        />
      ),
      hideCardsInDialog: true,
      viewHref: '/leads',
    },
    {
      id: 'sales',
      title: 'Sales',
      description: 'Contact and assignment performance by sales member',
      metric: 'sales',
      icon: <LuPhoneCall className="size-4" />,
      cards: [
        { label: 'Contacted', value: data.sales.contacted, tone: 'ok' },
        { label: 'Uncontacted', value: data.sales.uncontacted, tone: data.sales.uncontacted ? 'warn' : 'neutral' },
        { label: 'Assigned', value: data.sales.assigned },
        { label: 'Unassigned', value: data.sales.unassigned, tone: data.sales.unassigned ? 'warn' : 'neutral' },
      ],
      breakdown: data.sales.members.map((member) => ({ label: member.name, count: member.assigned })),
      details: <SalesMemberTable members={data.sales.members} onSelect={loadMember} />,
      viewHref: '/leads',
    },
    {
      id: 'site-visits',
      title: 'Site visits',
      description: 'Visits scheduled inside the selected date range',
      metric: 'site_visits',
      icon: <LuCalendarCheck className="size-4" />,
      cards: [
        { label: 'Today visits', value: data.site_visits.today, tone: 'brand', href: '/site-visits?scope=TODAY' },
        { label: 'Upcoming', value: data.site_visits.upcoming ?? 0, tone: 'info', href: '/site-visits?scope=UPCOMING' },
        { label: 'Completed', value: data.site_visits.completed, tone: 'ok', href: '/site-visits?scope=COMPLETED' },
        { label: 'Overdue', value: data.site_visits.overdue ?? 0, tone: data.site_visits.overdue ? 'danger' : 'neutral', href: '/site-visits?scope=OVERDUE' },
      ],
      breakdown: data.site_visits.breakdown,
      viewHref: '/site-visits',
    },
    {
      id: 'designs',
      title: 'Design',
      description: 'Landscape design workflow progress',
      metric: 'designs',
      icon: <LuPencilRuler className="size-4" />,
      cards: [
        { label: 'In process', value: data.designs.in_process, tone: 'info' },
        { label: 'Completed', value: data.designs.completed, tone: 'ok' },
        { label: 'Overdue', value: data.designs.overdue, tone: data.designs.overdue ? 'danger' : 'neutral' },
        { label: 'Approval pending', value: data.designs.approval_pending, tone: data.designs.approval_pending ? 'warn' : 'neutral' },
      ],
      breakdown: data.designs.breakdown,
      viewHref: '/designs',
    },
    {
      id: 'follow-ups',
      title: 'Follow-ups',
      description: 'Due work and completion across the sales team',
      metric: 'follow_ups',
      icon: <LuClipboardCheck className="size-4" />,
      cards: [
        { label: 'Pending', value: data.follow_ups.pending, tone: data.follow_ups.pending ? 'warn' : 'neutral', href: '/follow-ups?scope=PENDING' },
        { label: 'Today', value: data.follow_ups.today, tone: 'brand', href: '/follow-ups?scope=TODAY' },
        { label: 'Completed', value: data.follow_ups.completed, tone: 'ok', href: '/follow-ups?scope=COMPLETED' },
        { label: 'Overdue', value: data.follow_ups.overdue, tone: data.follow_ups.overdue ? 'danger' : 'neutral', href: '/follow-ups?scope=OVERDUE' },
      ],
      breakdown: data.follow_ups.breakdown,
      viewHref: '/follow-ups',
    },
    {
      id: 'execution',
      title: 'Execution',
      description: 'Project delivery health and blockers',
      metric: 'execution',
      icon: <LuHardHat className="size-4" />,
      cards: [
        { label: 'In progress', value: data.execution.in_progress, tone: 'info' },
        { label: 'Completed', value: data.execution.completed, tone: 'ok' },
        { label: 'Blocked', value: data.execution.blocked, tone: data.execution.blocked ? 'danger' : 'neutral' },
        { label: 'Overdue', value: data.execution.overdue, tone: data.execution.overdue ? 'danger' : 'neutral' },
      ],
      breakdown: data.execution.breakdown,
      viewHref: '/execution',
    },
  ];

  return (
    // Two sections abreast once there is room for both to keep their four
    // tiles across; below that they stack, since a half-width column would
    // start wrapping the tiles two-up and lose the at-a-glance row.
    <div className="grid gap-6 2xl:grid-cols-2">
      {sections.map((section) => (
        <section key={section.id}>
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="text-brand-700">{section.icon}</span>
                {section.title}
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">{section.description}</p>
            </div>
            <span className="shrink-0 text-xs text-ink-muted">{rangeLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {section.cards.map((card) => (
              <KpiCard key={card.label} card={card} onClick={() => setActive(section)} />
            ))}
          </div>

          {!['site-visits', 'designs', 'follow-ups', 'execution'].includes(section.id) ? (
            <div className="mt-3 rounded-xl border border-line bg-surface p-3 sm:p-4">
              {section.id === 'leads' ? (
                <CallOutcomeLineChart trend={data.leads.call_outcome_trends} />
              ) : section.id === 'sales' ? (
                <SalesOverview
                  members={data.sales.members}
                  onSelect={(member) => loadMember(member, memberFrom, memberTo, 'TABLE')}
                />
              ) : (
                <PhaseLineChart trend={data.trends} metric={section.metric} label={section.title} />
              )}
            </div>
          ) : null}
          {section.id === 'follow-ups' ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <FollowUpPie data={data.follow_ups} />
              <FollowUpTopMembers
                members={data.follow_ups.members ?? []}
                onShowAll={() => {
                  setFollowUpPage(1);
                  setFollowUpMembersOpen(true);
                }}
              />
            </div>
          ) : null}
          {section.id === 'site-visits' ? (
            <SiteVisitOverview data={data.site_visits} />
          ) : null}
          {section.id === 'designs' ? (
            <DesignOverview data={data.designs} />
          ) : null}
          {section.id === 'execution' ? (
            <ExecutionOverview data={data.execution} />
          ) : null}
        </section>
      ))}

      <Dialog open={Boolean(active)} onOpenChange={(open) => {
        if (!open) {
          setActive(null);
          setSalesExpanded(false);
        }
      }}>
        {active ? (
          <DialogContent
            title={`${active.title} details`}
            description={`Counts for ${rangeLabel}.`}
            headerAction={active.id === 'sales' ? (
              <button
                type="button"
                aria-label={salesExpanded ? 'Exit full screen' : 'Expand sales table'}
                title={salesExpanded ? 'Exit full screen' : 'Expand table'}
                onClick={() => setSalesExpanded((expanded) => !expanded)}
                className="tap flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                {salesExpanded ? <LuMinimize2 className="size-5" /> : <LuMaximize2 className="size-5" />}
              </button>
            ) : null}
            className={cn(
              'sm:max-w-3xl',
              active.id === 'sales' && salesExpanded &&
                'sm:!inset-4 sm:!h-[calc(100dvh-2rem)] sm:!max-h-none sm:!w-[calc(100vw-2rem)] sm:!max-w-none sm:!translate-x-0 sm:!translate-y-0',
            )}
          >
            <div className="space-y-4">
              {!active.hideCardsInDialog ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {active.cards.map((card) => (
                    <div key={card.label} className="rounded-lg border border-line bg-canvas p-3">
                      <p className="text-xs text-ink-muted">{card.label}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{card.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {active.details ?? <BreakdownList items={active.breakdown} />}
              <Link href={active.viewHref} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
                View full {active.title.toLowerCase()} page
                <LuArrowRight className="size-4" />
              </Link>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => {
        if (!open) {
          setSelectedMember(null);
          setMemberExpanded(true);
        }
      }}>
        {selectedMember ? (
          <DialogContent
            title={`${selectedMember.name} performance`}
            description="Daily latest call outcomes for this sales member."
            headerAction={(
              <button
                type="button"
                aria-label={memberExpanded ? 'Exit full screen' : 'Expand member analytics'}
                title={memberExpanded ? 'Exit full screen' : 'Expand analytics'}
                onClick={() => setMemberExpanded((expanded) => !expanded)}
                className="tap flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                {memberExpanded ? <LuMinimize2 className="size-5" /> : <LuMaximize2 className="size-5" />}
              </button>
            )}
            className={cn(
              'sm:max-w-5xl',
              memberExpanded &&
                'sm:!inset-4 sm:!h-[calc(100dvh-2rem)] sm:!max-h-none sm:!w-[calc(100vw-2rem)] sm:!max-w-none sm:!translate-x-0 sm:!translate-y-0',
            )}
          >
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-xs font-medium text-ink-muted">
                  From
                  <input type="date" value={memberFrom} max={memberTo} onChange={(event) => setMemberFrom(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink" />
                </label>
                <label className="text-xs font-medium text-ink-muted">
                  To
                  <input type="date" value={memberTo} min={memberFrom} onChange={(event) => setMemberTo(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink" />
                </label>
                <button type="button" disabled={memberPending || !memberFrom || !memberTo} onClick={() => loadMember(selectedMember)} className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                  {memberPending ? 'Loading…' : 'Apply'}
                </button>
              </div>
              {memberError ? <p className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{memberError}</p> : null}
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
                  <button type="button" onClick={() => setMemberView('CHART')} className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold', memberView === 'CHART' ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-muted hover:text-ink')}>
                    <LuChartLine className="size-4" /> Line chart
                  </button>
                  <button type="button" onClick={() => setMemberView('TABLE')} className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold', memberView === 'TABLE' ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-muted hover:text-ink')}>
                    <LuTable2 className="size-4" /> Table
                  </button>
                </div>
                <span className="text-xs text-ink-muted">{memberDays.length} days</span>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3 sm:p-4">
                {memberPending && memberDays.length === 0 ? (
                  <div className="flex h-80 items-center justify-center text-sm text-ink-muted">Loading performance…</div>
                ) : memberView === 'TABLE' ? (
                  <MemberOutcomeTable
                    days={memberDays}
                    page={memberPage}
                    pageSize={memberPageSize}
                    onPageChange={setMemberPage}
                    onPageSizeChange={(size) => {
                      setMemberPageSize(size);
                      setMemberPage(1);
                    }}
                  />
                ) : (
                  <MemberOutcomeLineChart days={memberDays} />
                )}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={followUpMembersOpen} onOpenChange={setFollowUpMembersOpen}>
        <DialogContent title="Follow-up workload by staff" description={`Counts for ${rangeLabel}.`} className="sm:max-w-4xl">
          <FollowUpMemberTable
            members={data.follow_ups.members ?? []}
            page={followUpPage}
            pageSize={followUpPageSize}
            onPageChange={setFollowUpPage}
            onPageSizeChange={(size) => {
              setFollowUpPageSize(size);
              setFollowUpPage(1);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ card, onClick }: { card: KpiCardData; onClick: () => void }) {
  const classes = cn(
    'relative min-h-24 overflow-hidden rounded-xl border border-line bg-surface p-3 text-left transition hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-sm',
    card.href && 'block',
  );
  const content = (
    <>
      <span className={cn('absolute inset-y-0 left-0 w-1', toneEdge(card.tone))} />
      <p className="pl-1 text-xs font-medium text-ink-muted">{card.label}</p>
      <p className="mt-1.5 pl-1 text-2xl font-semibold tabular-nums text-ink">{card.value}</p>
      {card.hint ? <p className="mt-1 pl-1 text-[11px] leading-tight text-ink-subtle">{card.hint}</p> : null}
    </>
  );
  return card.href ? <Link href={card.href} className={classes}>{content}</Link> : <button type="button" className={classes} onClick={onClick}>{content}</button>;
}

function toneEdge(tone: Tone = 'neutral') {
  return { brand: 'bg-brand-500', neutral: 'bg-line', warn: 'bg-orange-400', danger: 'bg-danger', info: 'bg-sky-500', ok: 'bg-emerald-500' }[tone];
}

function BreakdownList({ items }: { items: DashboardBreakdownItem[] }) {
  if (!items.length) return <p className="rounded-lg bg-canvas p-4 text-sm text-ink-muted">No records in this range.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between border-b border-line px-3 py-2.5 text-sm last:border-b-0">
          <span>{humanizeEnum(item.label)}</span><strong className="tabular-nums">{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

function SalesMemberTable({
  members,
  onSelect,
}: {
  members: AdminOperationalKpis['sales']['members'];
  onSelect: (member: AdminOperationalKpis['sales']['members'][number]) => void;
}) {
  if (!members.length) return <p className="text-sm text-ink-muted">No active sales members.</p>;
  return (
    <div className="max-h-[48dvh] overflow-auto rounded-lg border border-line">
      <table className="w-full min-w-[1040px] text-left text-xs">
        <thead className="sticky top-0 bg-canvas text-ink-muted">
          <tr>{['Sales member', 'Assigned', 'Contacted', 'Uncontacted', 'Interested', 'Not interested', 'Connected', 'No answer', 'Busy', 'Switched off', 'Invalid'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-medium">{label}</th>)}</tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} tabIndex={0} role="button" onClick={() => onSelect(member)} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(member);
            }} className="cursor-pointer border-t border-line transition hover:bg-brand-50 focus:bg-brand-50 focus:outline-none">
              <td className="px-3 py-2.5 font-medium text-ink">{member.name}</td>
              {[member.assigned, member.contacted, member.uncontacted, member.interested, member.not_interested, member.connected, member.no_answer, member.busy, member.switched_off, member.invalid].map((value, index) => <td key={index} className="px-3 py-2.5 tabular-nums">{value ?? 0}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CALL_OUTCOME_COLORS: Record<string, string> = {
  INTERESTED: '#00875a',
  NOT_INTERESTED: '#dc2626',
  CONNECTED: '#2563eb',
  NO_ANSWER: '#f59e0b',
  BUSY: '#7c3aed',
  SWITCHED_OFF: '#64748b',
  INVALID_NUMBER: '#be123c',
};

type MemberDailyRow = {
  day: string;
  outcomes: Array<{ label: string; count: number }>;
};

function SalesOverview({
  members,
  onSelect,
}: {
  members: AdminOperationalKpis['sales']['members'];
  onSelect: (member: AdminOperationalKpis['sales']['members'][number]) => void;
}) {
  const ranked = React.useMemo(
    () => [...members]
      .sort((a, b) =>
        (b.interested ?? 0) - (a.interested ?? 0) ||
        (b.contacted ?? 0) - (a.contacted ?? 0) ||
        a.name.localeCompare(b.name),
      )
      .slice(0, 10),
    [members],
  );

  return (
    <div className="grid min-h-72 gap-4 lg:grid-cols-2 lg:gap-0">
      <div className="min-w-0 lg:pr-4">
        <SalesOutcomePieChart members={members} />
      </div>
      <div className="min-w-0 border-t border-line pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink">Top performers</p>
            <p className="text-[11px] text-ink-muted">Ranked by Interested leads</p>
          </div>
          <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700">Top 10</span>
        </div>
        <div className="h-[15rem] overflow-hidden rounded-lg border border-line">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <th className="w-9 px-2 py-1.5 text-center font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Sales member</th>
                <th className="w-20 px-2 py-1.5 text-center font-medium">Interested</th>
                <th className="w-24 px-2 py-1.5 text-center font-medium">Not interested</th>
              </tr>
            </thead>
            <tbody>
              {ranked.length ? ranked.map((member, index) => (
                <tr
                  key={member.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => onSelect(member)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelect(member);
                  }}
                  className="h-[1.3rem] cursor-pointer border-t border-line transition hover:bg-brand-50 focus:bg-brand-50 focus:outline-none"
                >
                  <td className="px-2 text-center font-semibold tabular-nums text-brand-700">{index + 1}</td>
                  <td className="truncate px-2 font-medium text-ink" title={member.name}>{member.name}</td>
                  <td className="px-2 text-center font-semibold tabular-nums text-brand-700">{member.interested ?? 0}</td>
                  <td className="px-2 text-center tabular-nums text-ink-muted">{member.not_interested ?? 0}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="p-6 text-center text-ink-muted">No sales members.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">Select a row to open daily performance in Table view.</p>
      </div>
    </div>
  );
}

type FollowUpMember = AdminOperationalKpis['follow_ups']['members'][number];

function DesignOverview({ data }: { data: AdminOperationalKpis['designs'] }) {
  const pie = [
    { name: 'Pending', value: data.in_process ?? 0, itemStyle: { color: '#f59e0b' } },
    { name: 'Completed', value: data.completed ?? 0, itemStyle: { color: '#00875a' } },
  ].filter((item) => item.value > 0);
  const option: EChartsOption = {
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} ({d}%)', ...TOOLTIP_BASE },
    legend: { bottom: 0, textStyle: AXIS_LABEL },
    series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '44%'], label: { formatter: '{b}\n{c}', color: CHART_INK.muted }, data: pie }],
  };
  const members = (data.members ?? []).slice(0, 10);
  return (
    <div className="mt-3 grid overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-2">
      <div className="min-w-0 p-3 sm:p-4 lg:border-r lg:border-line">
        <p className="text-sm font-semibold text-ink">Design work</p>
        <p className="text-[11px] text-ink-muted">Pending compared with completed designs</p>
        {pie.length ? <Chart option={option} className="h-64" summary="Pending and completed landscape design projects." /> : <div className="flex h-64 items-center justify-center text-sm text-ink-muted">No design work in this range.</div>}
      </div>
      <div className="min-w-0 border-t border-line p-3 sm:p-4 lg:border-t-0">
        <div className="mb-2 flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Designer workload</p><p className="text-[11px] text-ink-muted">Top 10 by pending work</p></div><Link href="/designs" className="text-xs font-semibold text-brand-700">View all</Link></div>
        <div className="h-64 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-canvas text-ink-muted"><tr><th className="px-3 py-2 font-medium">Designer</th><th className="px-3 py-2 text-center font-medium">Pending</th><th className="px-3 py-2 text-center font-medium">Completed</th></tr></thead>
            <tbody>{members.map((member) => <tr key={member.id} className="border-t border-line">
              <td className="px-3 py-2.5 font-medium text-ink"><Link href={`/designs?scope=ALL&designer=${member.id}`} className="hover:text-brand-700 hover:underline">{member.name}</Link></td>
              <td className="p-0 text-center font-semibold tabular-nums text-orange-700"><Link href={`/designs?scope=PENDING&designer=${member.id}`} className="block px-3 py-2.5 hover:bg-orange-50 hover:underline" aria-label={`Open ${member.name}'s pending designs`}>{member.pending}</Link></td>
              <td className="p-0 text-center font-semibold tabular-nums text-brand-700"><Link href={`/designs?scope=COMPLETED&designer=${member.id}`} className="block px-3 py-2.5 hover:bg-brand-50 hover:underline" aria-label={`Open ${member.name}'s completed designs`}>{member.completed}</Link></td>
            </tr>)}</tbody>
          </table>
          {!members.length ? <div className="flex h-48 items-center justify-center text-sm text-ink-muted">No active designers.</div> : null}
        </div>
      </div>
    </div>
  );
}

function ExecutionOverview({ data }: { data: AdminOperationalKpis['execution'] }) {
  const pie = [
    { name: 'Assigned', value: data.assigned ?? 0, itemStyle: { color: '#2563eb' } },
    { name: 'In progress', value: data.in_progress ?? 0, itemStyle: { color: '#f59e0b' } },
    { name: 'Completed', value: data.completed ?? 0, itemStyle: { color: '#00875a' } },
  ].filter((item) => item.value > 0);
  const option: EChartsOption = {
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} ({d}%)', ...TOOLTIP_BASE },
    legend: { bottom: 0, textStyle: AXIS_LABEL },
    series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '44%'], label: { formatter: '{b}\n{c}', color: CHART_INK.muted }, data: pie }],
  };
  return (
    <div className="mt-3 grid overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-2">
      <div className="min-w-0 p-3 sm:p-4 lg:border-r lg:border-line">
        <p className="text-sm font-semibold text-ink">Execution progress</p>
        <p className="text-[11px] text-ink-muted">Assigned, in progress, and completed projects</p>
        {pie.length ? <Chart option={option} className="h-64" summary="Assigned, in-progress, and completed execution projects." /> : <div className="flex h-64 items-center justify-center text-sm text-ink-muted">No execution projects in this range.</div>}
      </div>
      <div className="min-w-0 border-t border-line p-3 sm:p-4 lg:border-t-0">
        <div className="mb-2 flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Execution projects</p><p className="text-[11px] text-ink-muted">Select a row for full project details</p></div><Link href="/execution" className="text-xs font-semibold text-brand-700">View all</Link></div>
        <div className="h-64 overflow-y-auto rounded-lg border border-line">
          {(data.projects ?? []).length ? (data.projects ?? []).map((project) => (
            <Link key={project.id} href={`/execution/${project.id}`} className="block border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-brand-50">
              <div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{project.title}</span><span className="block truncate text-[11px] text-ink-muted">{project.assignees}</span></span><span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-[10px] text-ink-muted">{humanizeEnum(project.status)}</span></div>
              <div className="mt-2 flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${project.progress_percent}%` }} /></span><span className="text-[10px] font-medium tabular-nums text-ink-muted">{project.progress_percent}%</span></div>
            </Link>
          )) : <div className="flex h-full items-center justify-center text-sm text-ink-muted">No execution projects.</div>}
        </div>
      </div>
    </div>
  );
}

function SiteVisitOverview({ data }: { data: AdminOperationalKpis['site_visits'] }) {
  const pieData = [
    { name: 'Scheduled / active', value: data.scheduled ?? 0, itemStyle: { color: '#00875a' } },
    { name: 'Completed', value: data.completed ?? 0, itemStyle: { color: '#2563eb' } },
  ].filter((item) => item.value > 0);
  const option = React.useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} ({d}%)', ...TOOLTIP_BASE },
    legend: { bottom: 0, textStyle: AXIS_LABEL },
    series: [{
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['50%', '44%'],
      label: { formatter: '{b}\n{c}', color: CHART_INK.muted },
      data: pieData,
    }],
  }), [pieData]);

  return (
    <div className="mt-3 grid overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-2">
      <div className="min-w-0 p-3 sm:p-4 lg:border-r lg:border-line">
        <p className="text-sm font-semibold text-ink">Scheduled vs completed</p>
        <p className="text-[11px] text-ink-muted">Visits in the selected date range</p>
        {pieData.length ? (
          <Chart option={option} className="h-64" summary="Scheduled or active site visits compared with completed visits." />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-ink-muted">No scheduled or completed visits.</div>
        )}
      </div>
      <div className="min-w-0 border-t border-line p-3 sm:p-4 lg:border-t-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Today&apos;s active visits</p>
            <p className="text-[11px] text-ink-muted">Scheduled, rescheduled, or in progress</p>
          </div>
          <Link href="/site-visits?scope=TODAY" className="text-xs font-semibold text-brand-700 hover:underline">View all</Link>
        </div>
        <div className="h-64 overflow-y-auto rounded-lg border border-line">
          {(data.today_active ?? []).length ? (data.today_active ?? []).map((visit) => (
            <Link key={visit.id} href={`/leads/${visit.lead_id}?tab=visits`} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-brand-50">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                {new Date(visit.scheduled_start_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{visit.customer_name}</span>
                <span className="block truncate text-[11px] text-ink-muted">{visit.address || 'Address not added'}</span>
              </span>
              <span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-[10px] font-medium text-ink-muted">{humanizeEnum(visit.status)}</span>
            </Link>
          )) : (
            <div className="flex h-full items-center justify-center p-4 text-sm text-ink-muted">No active visits today.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function FollowUpPie({ data }: { data: AdminOperationalKpis['follow_ups'] }) {
  const pie = [
    { name: 'Pending', value: Math.max(0, data.pending - data.overdue), itemStyle: { color: '#f59e0b' } },
    { name: 'Overdue', value: data.overdue, itemStyle: { color: '#dc2626' } },
    { name: 'Completed', value: data.completed, itemStyle: { color: '#00875a' } },
  ].filter((item) => item.value > 0);
  const option: EChartsOption = {
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} ({d}%)', ...TOOLTIP_BASE },
    legend: { bottom: 0, textStyle: AXIS_LABEL },
    series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '44%'], label: { formatter: '{b}\n{c}', color: CHART_INK.muted }, data: pie }],
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface p-3 sm:p-4">
      <p className="text-sm font-semibold text-ink">Follow-up status</p>
      <p className="text-[11px] text-ink-muted">Pending, overdue, and completed work</p>
      {pie.length ? <Chart option={option} className="h-64" summary="Pending, overdue, and completed follow-ups." /> : <div className="flex h-64 items-center justify-center text-sm text-ink-muted">No follow-ups in this range.</div>}
    </div>
  );
}

function FollowUpTopMembers({
  members,
  onShowAll,
}: {
  members: FollowUpMember[];
  onShowAll: () => void;
}) {
  const top = [...members]
    .sort((a, b) => b.total - a.total || b.overdue - a.overdue || a.name.localeCompare(b.name))
    .slice(0, 10);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <button type="button" onClick={onShowAll} className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2.5 text-left hover:bg-brand-50 sm:px-4">
        <span>
          <span className="block text-sm font-semibold text-ink">Top follow-up workload</span>
          <span className="block text-[11px] text-ink-muted">Top 10 Admins/BDMs by total follow-ups</span>
        </span>
        <span className="text-xs font-semibold text-brand-700">View all</span>
      </button>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-canvas text-ink-muted">
            <tr><th className="w-10 px-3 py-2 text-center font-medium">#</th><th className="px-3 py-2 font-medium">Staff member</th><th className="px-3 py-2 text-center font-medium">Follow-ups</th><th className="px-3 py-2 text-center font-medium">Overdue</th></tr>
          </thead>
          <tbody>
            {top.map((member, index) => (
              <tr key={member.id} tabIndex={0} role="button" onClick={onShowAll} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onShowAll();
              }} className="cursor-pointer border-t border-line hover:bg-brand-50 focus:bg-brand-50 focus:outline-none">
                <td className="px-3 py-2 text-center font-semibold text-brand-700">{index + 1}</td>
                <td className="px-3 py-2 font-medium text-ink">{member.name}</td>
                <td className="px-3 py-2 text-center font-semibold tabular-nums">{member.total}</td>
                <td className={cn('px-3 py-2 text-center font-semibold tabular-nums', member.overdue > 0 ? 'text-danger-700' : 'text-ink-muted')}>{member.overdue}</td>
              </tr>
            ))}
            {!top.length ? <tr><td colSpan={4} className="p-5 text-center text-ink-muted">No staff follow-ups in this range.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FollowUpMemberTable({
  members,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  members: FollowUpMember[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const ranked = React.useMemo(
    () => [...members].sort((a, b) => b.total - a.total || b.overdue - a.overdue || a.name.localeCompare(b.name)),
    [members],
  );
  const totalPages = Math.max(1, Math.ceil(ranked.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = ranked.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <div className="space-y-3">
      <div className="max-h-[58dvh] overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-canvas text-ink-muted">
            <tr><th className="w-12 px-3 py-2 text-center font-medium">Rank</th><th className="px-3 py-2 font-medium">Staff member</th><th className="px-3 py-2 text-center font-medium">Total</th><th className="px-3 py-2 text-center font-medium">Pending</th><th className="px-3 py-2 text-center font-medium">Completed</th><th className="px-3 py-2 text-center font-medium">Overdue</th></tr>
          </thead>
          <tbody>
            {rows.map((member, index) => (
              <tr key={member.id} className="border-t border-line [content-visibility:auto] [contain-intrinsic-size:40px]">
                <td className="px-3 py-2.5 text-center font-semibold text-brand-700">{(currentPage - 1) * pageSize + index + 1}</td>
                <td className="px-3 py-2.5 font-medium text-ink">{member.name}</td>
                <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{member.total}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{member.pending}</td>
                <td className="px-3 py-2.5 text-center tabular-nums">{member.completed}</td>
                <td className={cn('px-3 py-2.5 text-center font-semibold tabular-nums', member.overdue > 0 ? 'text-danger-700' : 'text-ink-muted')}>{member.overdue}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6} className="p-6 text-center text-ink-muted">No staff found.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <label className="flex items-center gap-2 text-ink-muted">Rows
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-8 rounded-md border border-line bg-surface px-2 text-ink">
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-ink-muted">Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="h-8 rounded-md border border-line px-3 font-medium disabled:opacity-40">Previous</button>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="h-8 rounded-md border border-line px-3 font-medium disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}

function SalesOutcomePieChart({ members }: { members: AdminOperationalKpis['sales']['members'] }) {
  const data = React.useMemo(() => [
    { name: 'Interested', value: members.reduce((sum, member) => sum + (member.interested ?? 0), 0), color: CALL_OUTCOME_COLORS.INTERESTED },
    { name: 'Not interested', value: members.reduce((sum, member) => sum + (member.not_interested ?? 0), 0), color: CALL_OUTCOME_COLORS.NOT_INTERESTED },
    { name: 'Connected', value: members.reduce((sum, member) => sum + (member.connected ?? 0), 0), color: CALL_OUTCOME_COLORS.CONNECTED },
    { name: 'No answer', value: members.reduce((sum, member) => sum + (member.no_answer ?? 0), 0), color: CALL_OUTCOME_COLORS.NO_ANSWER },
    { name: 'Busy', value: members.reduce((sum, member) => sum + (member.busy ?? 0), 0), color: CALL_OUTCOME_COLORS.BUSY },
    { name: 'Switched off', value: members.reduce((sum, member) => sum + (member.switched_off ?? 0), 0), color: CALL_OUTCOME_COLORS.SWITCHED_OFF },
    { name: 'Invalid number', value: members.reduce((sum, member) => sum + (member.invalid ?? 0), 0), color: CALL_OUTCOME_COLORS.INVALID_NUMBER },
  ], [members]);
  const visible = data.filter((item) => item.value > 0);
  const option = React.useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} ({d}%)', ...TOOLTIP_BASE },
    legend: { type: 'scroll', bottom: 0, textStyle: AXIS_LABEL },
    color: visible.map((item) => item.color ?? CHART_BRAND.base),
    series: [{
      name: 'Latest outcome',
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      label: { formatter: '{b}\n{c}', color: CHART_INK.muted },
      data: visible,
    }],
  }), [visible]);
  if (!visible.length) return <div className="flex h-56 items-center justify-center text-sm text-ink-muted">No contacted leads in this range.</div>;
  return <Chart option={option} className="h-72" summary="Latest call outcome distribution across sales members." />;
}

function MemberOutcomeLineChart({ days }: { days: MemberDailyRow[] }) {
  const labels = Object.keys(CALL_OUTCOME_COLORS);
  const rows = days.map((row) => ({
    day: row.day,
    values: Object.fromEntries(row.outcomes.map((outcome) => [outcome.label, outcome.count])),
  }));
  const option = React.useMemo<EChartsOption>(() => ({
    grid: { top: 42, right: 14, bottom: 28, left: 8, containLabel: true },
    legend: { type: 'scroll', top: 0, textStyle: AXIS_LABEL, data: labels.map(humanizeEnum) },
    tooltip: { trigger: 'axis', appendToBody: true, ...TOOLTIP_BASE },
    xAxis: { type: 'category', data: rows.map((row) => row.day), boundaryGap: false, axisTick: { show: false }, axisLabel: { ...AXIS_LABEL, hideOverlap: true }, axisLine: { lineStyle: { color: CHART_INK.line } } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: CHART_INK.line, type: 'dashed' } } },
    series: labels.map((label) => ({
      name: humanizeEnum(label),
      type: 'line',
      data: rows.map((row) => Number(row.values[label]) || 0),
      smooth: 0.2,
      showSymbol: rows.length <= 31,
      symbolSize: 6,
      lineStyle: { color: CALL_OUTCOME_COLORS[label], width: 2 },
      itemStyle: { color: CALL_OUTCOME_COLORS[label] },
    })),
  }), [labels, rows]);
  if (!days.length) return <div className="flex h-80 items-center justify-center text-sm text-ink-muted">No outcomes in this date range.</div>;
  return <Chart option={option} className="h-80 sm:h-[26rem]" summary="Daily call outcomes for the selected sales member." />;
}

function MemberOutcomeTable({
  days,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  days: MemberDailyRow[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const newestFirst = React.useMemo(() => [...days].reverse(), [days]);
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  // Windowed pagination: only this slice reaches the DOM, keeping a one-year
  // report compact even on low-memory phones.
  const visibleRows = newestFirst.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const labels = Object.keys(CALL_OUTCOME_COLORS);

  if (!days.length) return <div className="flex h-52 items-center justify-center text-sm text-ink-muted">No outcomes in this date range.</div>;

  return (
    <div className="space-y-3">
      <div className="max-h-[52dvh] overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-canvas text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              {labels.map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-medium">{humanizeEnum(label)}</th>)}
              <th className="px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const values = Object.fromEntries(row.outcomes.map((outcome) => [outcome.label, outcome.count]));
              const total = labels.reduce((sum, label) => sum + (Number(values[label]) || 0), 0);
              return (
                <tr key={row.day} className="border-t border-line [content-visibility:auto] [contain-intrinsic-size:40px]">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{formatReportDate(row.day)}</td>
                  {labels.map((label) => <td key={label} className="px-3 py-2.5 tabular-nums">{Number(values[label]) || 0}</td>)}
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-ink">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <label className="flex items-center gap-2 text-ink-muted">
          Rows
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-8 rounded-md border border-line bg-surface px-2 text-ink">
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-ink-muted">Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="h-8 rounded-md border border-line px-3 font-medium text-ink disabled:opacity-40">Previous</button>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="h-8 rounded-md border border-line px-3 font-medium text-ink disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}

function toIstDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function formatReportDate(day: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${day}T00:00:00+05:30`));
}

function CallOutcomeLineChart({
  trend,
}: {
  trend: AdminOperationalKpis['leads']['call_outcome_trends'];
}) {
  const labels = Object.keys(CALL_OUTCOME_COLORS);
  const rows = trend.map((row) => ({
    day: row.day,
    values: Object.fromEntries(row.outcomes.map((outcome) => [outcome.label, outcome.count])),
  }));
  const option = React.useMemo<EChartsOption>(() => ({
    grid: { top: 36, right: 12, bottom: 24, left: 8, containLabel: true },
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: AXIS_LABEL,
      data: labels.map(humanizeEnum),
    },
    tooltip: { trigger: 'axis', appendToBody: true, ...TOOLTIP_BASE },
    xAxis: { type: 'category', data: rows.map((row) => row.day), boundaryGap: false, axisTick: { show: false }, axisLabel: { ...AXIS_LABEL, hideOverlap: true }, axisLine: { lineStyle: { color: CHART_INK.line } } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: CHART_INK.line, type: 'dashed' } } },
    series: labels.map((label) => ({
      name: humanizeEnum(label),
      type: 'line',
      data: rows.map((row) => Number(row.values[label]) || 0),
      smooth: 0.2,
      showSymbol: false,
      lineStyle: { color: CALL_OUTCOME_COLORS[label], width: 2 },
      itemStyle: { color: CALL_OUTCOME_COLORS[label] },
    })),
  }), [labels, rows]);

  return (
    <Chart
      option={option}
      className="h-56 sm:h-64"
      summary="Daily Interested, Not interested, Connected, No answer, Busy, Switched off, and Invalid number call outcomes."
    />
  );
}

function PhaseLineChart({ trend, metric, label }: { trend: AdminOperationalKpis['trends']; metric: MetricKey; label: string }) {
  const rows = trend.map((row) => ({ label: row.day, value: Number(row[metric]) || 0 }));
  const option = React.useMemo<EChartsOption>(() => ({
    grid: { top: 12, right: 12, bottom: 20, left: 8, containLabel: true },
    tooltip: { trigger: 'axis', appendToBody: true, ...TOOLTIP_BASE },
    xAxis: { type: 'category', data: rows.map((row) => row.label), boundaryGap: false, axisTick: { show: false }, axisLabel: { ...AXIS_LABEL, hideOverlap: true }, axisLine: { lineStyle: { color: CHART_INK.line } } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: CHART_INK.line, type: 'dashed' } } },
    series: [{ type: 'line', data: rows.map((row) => row.value), smooth: 0.25, showSymbol: false, lineStyle: { color: CHART_BRAND.base, width: 2 }, itemStyle: { color: CHART_BRAND.base }, areaStyle: { color: 'rgba(0, 113, 62, 0.08)' } }],
  }), [rows]);
  return <Chart option={option} className="h-44 sm:h-52" summary={`${label} activity by day.`} table={rows.map((row) => ({ label: row.label, value: String(row.value) }))} />;
}
