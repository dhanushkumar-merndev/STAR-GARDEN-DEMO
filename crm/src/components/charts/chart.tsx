'use client';

import * as React from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

/**
 * The one ECharts mount in the CRM.
 *
 * Imports are from `echarts/core` with the four charts and three components
 * registered by hand: `import * as echarts from 'echarts'` pulls the entire
 * library — every chart type, map and toolbox — into the client bundle for the
 * sake of three cards.
 *
 * SVG rather than canvas: these are small, static, text-heavy charts, and SVG
 * stays sharp on the high-DPI phones the CRM is used on (§2, §16).
 *
 * A chart is an image to a screen reader, so every caller passes a `summary`
 * for the accessible name and a `table` of the underlying rows. §16 forbids
 * carrying meaning in colour alone, and a plotted shape is no better — the
 * table is the non-visual route to the same numbers.
 */

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);

export interface ChartProps {
  option: EChartsOption;
  /** Accessible name — say what the chart shows, not that it is a chart. */
  summary: string;
  /** The same numbers, for anyone not reading the picture. */
  table?: { label: string; value: string }[];
  /** Tailwind height class. Charts need an explicit box to measure against. */
  className?: string;
  /**
   * Grow to fill a flex parent instead of standing at `className`'s height.
   *
   * Needed because the wrapping `<figure>` is a plain block: an `h-full` on the
   * canvas inside it resolves against a parent of auto height and does nothing,
   * which is how a stretched panel ended up with a short chart and a band of
   * white space beneath it. With this the figure joins the flex column and
   * passes the height through.
   *
   * `className` still applies, so a caller can set a floor with `min-h-*`.
   */
  fill?: boolean;
}

export function Chart({ option, summary, table, className = 'h-64', fill = false }: ChartProps) {
  const elementRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);

  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Kept apart from mounting so a data change updates in place rather than
  // tearing down and rebuilding the chart.
  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    chart.setOption({ ...option, animation: !reduceMotion }, { notMerge: true });
  }, [option]);

  return (
    <figure className={fill ? 'm-0 flex min-h-0 min-w-0 flex-1 flex-col' : 'm-0'}>
      {/* `min-w-0` matters as much as `min-h-0` once this is a flex item.
          ECharts writes an explicit pixel width onto its `<svg>`, and a flex
          item's default `min-width: auto` refuses to shrink below that — so the
          chart pinned the dashboard grid open and the whole page overflowed
          sideways on a phone. */}
      <div
        ref={elementRef}
        className={`w-full ${fill ? 'min-h-0 min-w-0 flex-1 ' : ''}${className}`}
        role="img"
        aria-label={summary}
      />
      {table && table.length > 0 ? (
        <div className="sr-only">
          <table>
            <caption>{summary}</caption>
            <tbody>
              {table.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
