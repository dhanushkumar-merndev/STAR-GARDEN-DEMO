'use client';

import * as React from 'react';
import type { EChartsOption } from 'echarts';
import { Chart } from '@/components/charts/chart';
import {
  AXIS_LABEL,
  CHART_BRAND,
  CHART_FONT,
  CHART_INK,
  TOOLTIP_BASE,
  sourceColor,
} from '@/components/charts/theme';

/**
 * Dashboard analytics (AGENTS.md §12.1).
 *
 * Three forms, because the four cards ask three different questions. A single
 * "render some bars" component made every card look identical and hid what each
 * one was for:
 *
 *   trend    change over time      -> area line
 *   share    part of a whole       -> donut, with the total in the hole
 *   ranking  compare magnitudes    -> horizontal bar, one hue
 *
 * The donut is capped at five slices for a reason — see the palette note in
 * `charts/theme.ts`. Ranking bars stay a single colour: the bar's length is
 * already the magnitude, so colouring by rank would repaint the chart every
 * time a filter changed the order, for no added meaning.
 */

export interface CountItem {
  label: string;
  count: number;
  /** Stable identity for colour assignment — the enum value, not the position. */
  key?: string;
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                       */
/* -------------------------------------------------------------------------- */

export function LeadTrendChart({ trend }: { trend: CountItem[] }) {
  const total = trend.reduce((sum, item) => sum + item.count, 0);
  const peak = trend.reduce((best, item) => (item.count > best.count ? item : best), {
    label: '—',
    count: 0,
  });

  const option = React.useMemo<EChartsOption>(
    () => ({
      grid: { top: 16, right: 16, bottom: 24, left: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        ...TOOLTIP_BASE,
        axisPointer: { type: 'line', lineStyle: { color: CHART_INK.subtle, type: 'dashed' } },
        valueFormatter: (value) => `${value} lead${value === 1 ? '' : 's'}`,
      },
      xAxis: {
        type: 'category',
        data: trend.map((item) => item.label),
        boundaryGap: false,
        axisLine: { lineStyle: { color: CHART_INK.line } },
        axisTick: { show: false },
        axisLabel: { ...AXIS_LABEL, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: CHART_INK.line, type: 'dashed' } },
        axisLabel: AXIS_LABEL,
      },
      series: [
        {
          type: 'line',
          name: 'Leads',
          data: trend.map((item) => item.count),
          smooth: 0.3,
          showSymbol: false,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { color: CHART_BRAND.base, width: 2 },
          itemStyle: { color: CHART_BRAND.base, borderColor: CHART_INK.surface, borderWidth: 2 },
          emphasis: { focus: 'series' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0, 113, 62, 0.22)' },
                { offset: 1, color: 'rgba(0, 113, 62, 0.01)' },
              ],
            },
          },
        },
      ],
    }),
    [trend],
  );

  if (total === 0) return <ChartEmpty label="No leads in this range" />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-ink">{total}</span>
        <span className="text-xs text-ink-muted">
          leads · busiest day {peak.label} ({peak.count})
        </span>
      </div>
      <Chart
        option={option}
        className="h-56"
        summary={`Leads received per day. ${total} in total, peaking at ${peak.count} on ${peak.label}.`}
        table={trend.filter((item) => item.count > 0).map((item) => ({ label: item.label, value: String(item.count) }))}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Share                                                                       */
/* -------------------------------------------------------------------------- */

export function LeadShareChart({ items }: { items: CountItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  const option = React.useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        ...TOOLTIP_BASE,
        formatter: (params) => {
          const point = params as { name: string; value: number; percent: number };
          return `${point.name}<br/><strong>${point.value}</strong> (${point.percent}%)`;
        },
      },
      legend: {
        bottom: 0,
        left: 'center',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 14,
        textStyle: { color: CHART_INK.muted, fontSize: 11, fontFamily: CHART_FONT },
      },
      series: [
        {
          type: 'pie',
          radius: ['58%', '82%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          // A 2px gap in the surface colour keeps neighbouring slices apart for
          // readers who cannot separate the hues.
          itemStyle: { borderColor: CHART_INK.surface, borderWidth: 2 },
          label: {
            show: true,
            formatter: '{d}%',
            color: CHART_INK.primary,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: CHART_FONT,
          },
          labelLine: { length: 8, length2: 8, lineStyle: { color: CHART_INK.subtle } },
          emphasis: { scale: true, scaleSize: 4 },
          data: items.map((item, index) => ({
            name: item.label,
            value: item.count,
            itemStyle: { color: sourceColor(item.key ?? item.label, index) },
          })),
        },
      ],
    }),
    [items],
  );

  if (total === 0) return <ChartEmpty label="No leads in this range" />;

  return (
    <div className="relative">
      <Chart
        option={option}
        className="h-64"
        summary={`Share of leads by source. ${items
          .map((item) => `${item.label} ${Math.round((item.count / total) * 100)}%`)
          .join(', ')}.`}
        table={items.map((item) => ({
          label: item.label,
          value: `${item.count} (${Math.round((item.count / total) * 100)}%)`,
        }))}
      />
      {/* The hole is the natural home for the total the slices add up to. */}
      <div className="pointer-events-none absolute inset-x-0 top-[26%] flex flex-col items-center">
        <span className="text-xl font-semibold tabular-nums text-ink">{total}</span>
        <span className="text-[11px] text-ink-muted">leads</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                     */
/* -------------------------------------------------------------------------- */

export function LeadRankingChart({ items, height }: { items: CountItem[]; height?: string }) {
  const sorted = React.useMemo(() => [...items].sort((a, b) => b.count - a.count), [items]);
  const total = sorted.reduce((sum, item) => sum + item.count, 0);

  const option = React.useMemo<EChartsOption>(
    () => ({
      grid: { top: 4, right: 44, bottom: 4, left: 4, containLabel: true },
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        ...TOOLTIP_BASE,
        formatter: (params) => {
          const point = params as { name: string; value: number };
          const share = total > 0 ? Math.round((point.value / total) * 100) : 0;
          return `${point.name}<br/><strong>${point.value}</strong> (${share}%)`;
        },
      },
      xAxis: { type: 'value', show: false, max: 'dataMax' },
      yAxis: {
        type: 'category',
        data: sorted.map((item) => item.label),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...AXIS_LABEL,
          color: CHART_INK.primary,
          fontSize: 12,
          width: 132,
          overflow: 'truncate',
        },
      },
      series: [
        {
          type: 'bar',
          data: sorted.map((item) => item.count),
          barMaxWidth: 14,
          itemStyle: { color: CHART_BRAND.base, borderRadius: [0, 4, 4, 0] },
          // A faint track shows each bar against the largest, so a short bar
          // reads as "small share" rather than just "short".
          showBackground: true,
          backgroundStyle: { color: '#f2f6f3', borderRadius: 4 },
          label: {
            show: true,
            position: 'right',
            formatter: '{c}',
            color: CHART_INK.muted,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: CHART_FONT,
          },
          emphasis: { itemStyle: { color: CHART_BRAND.strong } },
        },
      ],
    }),
    [sorted, total],
  );

  if (total === 0) return <ChartEmpty label="Nothing to show yet" />;

  return (
    <Chart
      option={option}
      className={height ?? 'h-64'}
      summary={`${sorted.map((item) => `${item.label}: ${item.count}`).join(', ')}.`}
      table={sorted.map((item) => ({ label: item.label, value: String(item.count) }))}
    />
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg bg-surface-muted/60 text-sm text-ink-muted">
      {label}
    </div>
  );
}
