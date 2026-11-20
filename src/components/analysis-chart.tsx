'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartData } from '@/lib/document-types';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface AnalysisChartProps {
  data: ChartData;
  onImageReady: (image: string) => void;
}

const CHART_COLORS = ['#C44732', '#292826', '#8B8780', '#E4A093', '#B9B4AC'];

function DataTable({ data }: { data: ChartData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#E8E5E0]">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <caption className="px-4 py-3 text-left font-medium text-[#20201E]">
          {data.title}
        </caption>
        <thead className="bg-[#F7F6F3] text-xs text-[#74716B]">
          <tr>
            <th className="border-t border-[#E8E5E0] px-4 py-3 font-medium">分类</th>
            {data.series.map((series) => (
              <th key={series.name} className="border-t border-[#E8E5E0] px-4 py-3 font-medium">
                {series.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.categories.map((category, categoryIndex) => (
            <tr key={`${category}-${categoryIndex}`} className="border-t border-[#E8E5E0]">
              <th className="px-4 py-3 font-normal text-[#20201E]">{category}</th>
              {data.series.map((series, seriesIndex) => (
                <td key={`${series.name}-${seriesIndex}`} className="px-4 py-3 tabular-nums text-[#55524D]">
                  {series.data[categoryIndex] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysisChart({ data, onImageReady }: AnalysisChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data.type === 'table' || !containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    const series = data.series.map((item, index) => ({
      name: item.name,
      type: data.type,
      data: item.data,
      smooth: data.type === 'line' ? 0.25 : undefined,
      symbolSize: 7,
      lineStyle: { width: 2.5 },
      itemStyle: {
        color: CHART_COLORS[index % CHART_COLORS.length],
        borderRadius: data.type === 'bar' ? [3, 3, 0, 0] : 0,
      },
      barMaxWidth: 42,
    }));

    chart.setOption({
      color: CHART_COLORS,
      animationDuration: 500,
      textStyle: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' },
      tooltip: { trigger: 'axis', confine: true },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 5,
        textStyle: { color: '#74716B', fontSize: 12 },
      },
      grid: { top: 54, right: 18, bottom: 34, left: 48, containLabel: false },
      xAxis: {
        type: 'category',
        data: data.categories,
        axisLine: { lineStyle: { color: '#D8D4CE' } },
        axisTick: { show: false },
        axisLabel: { color: '#74716B', fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        name: data.unit ?? '',
        nameTextStyle: { color: '#74716B', fontSize: 11 },
        splitLine: { lineStyle: { color: '#EEECE8', type: 'dashed' } },
        axisLabel: { color: '#74716B', fontSize: 11 },
      },
      series,
    });

    const handleFinished = () => {
      chart.off('finished', handleFinished);
      onImageReady(
        chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#FFFFFF' }),
      );
    };
    chart.on('finished', handleFinished);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.off('finished', handleFinished);
      chart.dispose();
    };
  }, [data, onImageReady]);

  if (data.type === 'table') return <DataTable data={data} />;

  return (
    <div>
      <h3 className="mb-2 text-base font-semibold text-[#20201E]">{data.title}</h3>
      <div
        ref={containerRef}
        className="h-[320px] w-full sm:h-[360px]"
        role="img"
        aria-label={`${data.title}，${data.type === 'line' ? '折线图' : '柱状图'}`}
      />
    </div>
  );
}
