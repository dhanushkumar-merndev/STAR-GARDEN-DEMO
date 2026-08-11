'use client';

import * as React from 'react';
import * as echarts from 'echarts';

type CountItem = { label: string; count: number };
type TrendItem = { label: string; count: number };

export function LeadAnalyticsChart({
  kind,
  items,
  trend,
}: {
  kind: 'bar' | 'line';
  items?: CountItem[];
  trend?: TrendItem[];
}) {
  const elementRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const chart = echarts.init(element, undefined, { renderer: 'svg' });
    const labels = kind === 'line' ? trend?.map((item) => item.label) ?? [] : items?.map((item) => item.label) ?? [];
    const values = kind === 'line' ? trend?.map((item) => item.count) ?? [] : items?.map((item) => item.count) ?? [];

    chart.setOption({
      animationDuration: 280,
      grid: kind === 'bar'
        ? { top: 12, right: 20, bottom: 12, left: 10, containLabel: true }
        : { top: 16, right: 20, bottom: 28, left: 10, containLabel: true },
      tooltip: { trigger: kind === 'line' ? 'axis' : 'item', appendToBody: true },
      xAxis: kind === 'line'
        ? {
            type: 'category',
            data: labels,
            axisLine: { lineStyle: { color: '#d7ddd8' } },
            axisLabel: { color: '#64706a', fontSize: 11, hideOverlap: true },
          }
        : { type: 'value', show: false },
      yAxis: kind === 'line'
        ? {
            type: 'value', minInterval: 1,
            splitLine: { lineStyle: { color: '#edf1ee' } },
            axisLabel: { color: '#64706a', fontSize: 11 },
          }
        : {
            type: 'category', data: labels, inverse: true,
            axisLine: { show: false }, axisTick: { show: false },
            axisLabel: { color: '#26332b', fontSize: 12, width: 120, overflow: 'truncate' },
          },
      series: [
        kind === 'line'
          ? {
              type: 'line', data: values, smooth: true, symbol: 'circle', symbolSize: 6,
              lineStyle: { color: '#15803d', width: 3 },
              itemStyle: { color: '#15803d' },
              areaStyle: { color: 'rgba(34, 197, 94, 0.14)' },
            }
          : {
              type: 'bar', data: values, barMaxWidth: 22,
              itemStyle: { color: '#22a35a', borderRadius: [0, 5, 5, 0] },
              label: { show: true, position: 'right', color: '#425049', fontSize: 11 },
            },
      ],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [items, kind, trend]);

  return <div ref={elementRef} className="h-64 w-full" aria-label="Lead analytics chart" role="img" />;
}
