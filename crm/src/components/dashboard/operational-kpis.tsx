'use client';

import * as React from 'react';
import Link from 'next/link';
import type { EChartsOption } from 'echarts';
import {
  LuArrowRight,
  LuCalendarCheck,
  LuClipboardCheck,
  LuHardHat,
  LuInfo,
  LuPencilRuler,
  LuPhoneCall,
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
}: {
  data: AdminOperationalKpis;
  rangeLabel: string;
}) {
  const [active, setActive] = React.useState<KpiSectionData | null>(null);
  const [leadInfoOpen, setLeadInfoOpen] = React.useState(false);

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
      details: <SalesMemberTable members={data.sales.members} />,
      viewHref: '/leads',
    },
    {
      id: 'site-visits',
      title: 'Site visits',
      description: 'Visits scheduled inside the selected date range',
      metric: 'site_visits',
      icon: <LuCalendarCheck className="size-4" />,
      cards: [
        { label: 'Total visits', value: data.site_visits.total },
        { label: 'Today visits', value: data.site_visits.today, tone: 'brand', href: '/site-visits?scope=TODAY' },
        { label: 'Completed', value: data.site_visits.completed, tone: 'ok' },
        { label: 'Due', value: data.site_visits.due, tone: data.site_visits.due ? 'warn' : 'neutral' },
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
        { label: 'Pending', value: data.follow_ups.pending, tone: data.follow_ups.pending ? 'warn' : 'neutral' },
        { label: 'Today', value: data.follow_ups.today, tone: 'brand', href: '/follow-ups?scope=TODAY' },
        { label: 'Completed', value: data.follow_ups.completed, tone: 'ok' },
        { label: 'Overdue', value: data.follow_ups.overdue, tone: data.follow_ups.overdue ? 'danger' : 'neutral' },
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
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.id}>
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="text-brand-700">{section.icon}</span>
                {section.title}
                {section.id === 'leads' ? (
                  <span
                    className="relative inline-flex"
                    onMouseEnter={() => setLeadInfoOpen(true)}
                    onMouseLeave={() => setLeadInfoOpen(false)}
                  >
                    <button
                      type="button"
                      aria-label="What the Leads KPI includes"
                      aria-expanded={leadInfoOpen}
                      onClick={() => setLeadInfoOpen((open) => !open)}
                      onFocus={() => setLeadInfoOpen(true)}
                      onBlur={() => setLeadInfoOpen(false)}
                      className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <LuInfo className="size-4" />
                    </button>
                    {leadInfoOpen ? (
                      <span
                        role="tooltip"
                        className="absolute left-0 top-7 z-30 w-64 rounded-lg bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg"
                      >
                        Counts unique leads by their latest outcome: Interested, Not interested,
                        Connected, No answer, Busy, Switched off, or Invalid number.
                      </span>
                    ) : null}
                  </span>
                ) : null}
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

          <div className="mt-3 rounded-xl border border-line bg-surface p-3 sm:p-4">
            {section.id === 'leads' ? (
              <CallOutcomeLineChart trend={data.leads.call_outcome_trends} />
            ) : (
              <PhaseLineChart trend={data.trends} metric={section.metric} label={section.title} />
            )}
          </div>
        </section>
      ))}

      <Dialog open={Boolean(active)} onOpenChange={(open) => !open && setActive(null)}>
        {active ? (
          <DialogContent title={`${active.title} details`} description={`Counts for ${rangeLabel}.`} className="sm:max-w-3xl">
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

function SalesMemberTable({ members }: { members: AdminOperationalKpis['sales']['members'] }) {
  if (!members.length) return <p className="text-sm text-ink-muted">No active sales members.</p>;
  return (
    <div className="max-h-[48dvh] overflow-auto rounded-lg border border-line">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="sticky top-0 bg-canvas text-ink-muted">
          <tr>{['Sales member', 'Assigned', 'Contacted', 'Uncontacted', 'Interested', 'Not interested', 'Invalid'].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-t border-line">
              <td className="px-3 py-2.5 font-medium text-ink">{member.name}</td>
              {[member.assigned, member.contacted, member.uncontacted, member.interested, member.not_interested, member.invalid].map((value, index) => <td key={index} className="px-3 py-2.5 tabular-nums">{value}</td>)}
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
