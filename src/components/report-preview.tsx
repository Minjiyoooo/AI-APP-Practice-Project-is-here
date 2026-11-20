'use client';

import {
  ChartNoAxesColumnIncreasing,
  FileSearch,
  Lightbulb,
  ListTree,
  ShieldAlert,
} from 'lucide-react';
import { AnalysisChart } from '@/components/analysis-chart';
import { Badge } from '@/components/ui/badge';
import type { AnalysisResult, DocumentOverview } from '@/lib/document-types';
import { formatFileSize } from '@/lib/file-validation';

interface ReportPreviewProps {
  analysis: AnalysisResult;
  overview: DocumentOverview;
  onChartImageReady: (image: string) => void;
}

function SectionTitle({
  number,
  title,
  icon,
}: {
  number: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center gap-3 border-b border-[#E8E5E0] pb-4">
      <span className="text-[11px] font-medium tabular-nums text-[#C44732]">{number}</span>
      <span className="text-[#C44732]">{icon}</span>
      <h2 className="font-display text-xl font-semibold text-[#20201E]">{title}</h2>
    </div>
  );
}

export function ReportPreview({
  analysis,
  overview,
  onChartImageReady,
}: ReportPreviewProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#E8E5E0] bg-white">
      <div className="border-b border-[#E8E5E0] px-5 py-8 sm:px-10 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-[#C44732]">
            DOCUMENT INTELLIGENCE
          </span>
          <span className="text-[11px] text-[#9A958D]">AI 分析报告</span>
        </div>
        <h1 className="font-display text-2xl font-semibold leading-snug text-[#20201E] sm:text-3xl">
          {overview.fileName.replace(/\.[^.]+$/, '')}
        </h1>
        <p className="mt-3 text-sm text-[#8A867F]">结构化解析 · 数据核验 · 原文问答</p>

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#20201E]">摘要</h2>
            <span className="text-[11px] tabular-nums text-[#9A958D]">{analysis.summary.length} / 200 字</span>
          </div>
          <p className="text-[15px] leading-8 text-[#45423D]">{analysis.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {analysis.keywords.map((keyword) => (
              <Badge
                key={keyword}
                variant="outline"
                className="border-[#EAC9C0] bg-[#F8ECE8] px-2.5 py-1 font-normal text-[#B5412D]"
              >
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <section className="border-b border-[#E8E5E0] px-5 py-8 sm:px-10">
        <SectionTitle number="01" title="文档概览" icon={<FileSearch className="size-4.5" />} />
        <div className="grid grid-cols-2 divide-x divide-y divide-[#E8E5E0] rounded-lg border border-[#E8E5E0] sm:grid-cols-4 sm:divide-y-0">
          {[
            ['正文字符', overview.characterCount.toLocaleString('zh-CN')],
            ['标题层级', `${overview.headingCount} 个`],
            ['段落 / 表格', `${overview.paragraphCount} / ${overview.tableCount}`],
            ['文件大小', formatFileSize(overview.fileSize)],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-5">
              <div className="text-lg font-semibold tabular-nums text-[#20201E]">{value}</div>
              <div className="mt-1 text-[11px] text-[#8A867F]">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[#8A867F]">
          已聚合为 {overview.chunkCount} 个语义片段，用于当前会话的原文检索。
        </p>
      </section>

      <section className="border-b border-[#E8E5E0] px-5 py-8 sm:px-10">
        <SectionTitle number="02" title="核心内容解析" icon={<ListTree className="size-4.5" />} />
        <div className="space-y-6">
          {analysis.content.sections.map((section, index) => (
            <div key={`${section.title}-${index}`} className="grid gap-2 sm:grid-cols-[150px_1fr] sm:gap-6">
              <h3 className="text-sm font-semibold leading-6 text-[#20201E]">{section.title}</h3>
              <p className="text-sm leading-7 text-[#625F59]">{section.summary}</p>
            </div>
          ))}
        </div>

        {analysis.content.keyFindings.length > 0 && (
          <div className="mt-8 rounded-lg bg-[#F7F6F3] p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#20201E]">关键发现</h3>
            <ul className="space-y-2.5">
              {analysis.content.keyFindings.map((finding, index) => (
                <li key={`${finding}-${index}`} className="flex gap-3 text-sm leading-6 text-[#55524D]">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-[#C44732]" />
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#20201E]">
            <ShieldAlert className="size-4 text-[#C44732]" />
            风险提示
          </h3>
          {analysis.content.risks.length ? (
            <ul className="space-y-2.5">
              {analysis.content.risks.map((risk, index) => (
                <li key={`${risk}-${index}`} className="border-l-2 border-[#E6B3A6] pl-3 text-sm leading-6 text-[#625F59]">
                  {risk}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-6 text-[#8A867F]">原文未明确提出显著风险，建议结合具体使用场景复核。</p>
          )}
        </div>
      </section>

      <section className="border-b border-[#E8E5E0] px-5 py-8 sm:px-10">
        <SectionTitle
          number="03"
          title="数据图表"
          icon={<ChartNoAxesColumnIncreasing className="size-4.5" />}
        />
        {analysis.chart.hasChart && analysis.chart.data ? (
          <>
            <AnalysisChart data={analysis.chart.data} onImageReady={onChartImageReady} />
            <p className="mt-3 border-t border-[#E8E5E0] pt-3 text-xs leading-5 text-[#8A867F]">
              数据说明：{analysis.chart.reason}
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-[#DCD8D2] bg-[#FAF9F7] px-5 py-8 text-center">
            <ChartNoAxesColumnIncreasing className="mx-auto mb-3 size-5 text-[#A29D95]" />
            <p className="mx-auto max-w-md text-sm leading-6 text-[#74716B]">{analysis.chart.reason}</p>
            <p className="mt-2 text-xs text-[#A29D95]">未使用推测或补全数据生成图表</p>
          </div>
        )}
      </section>

      <section className="px-5 py-8 sm:px-10">
        <SectionTitle number="04" title="结论与建议" icon={<Lightbulb className="size-4.5" />} />
        <div className="space-y-7">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[#20201E]">核心结论</h3>
            <ol className="space-y-3">
              {analysis.content.coreConclusions.map((conclusion, index) => (
                <li key={`${conclusion}-${index}`} className="flex gap-3 text-sm leading-7 text-[#4E4B46]">
                  <span className="font-semibold tabular-nums text-[#C44732]">{String(index + 1).padStart(2, '0')}</span>
                  {conclusion}
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-[#E8E5E0] pt-6">
            <h3 className="mb-3 text-sm font-semibold text-[#20201E]">行动建议</h3>
            <ul className="space-y-2.5">
              {analysis.content.suggestions.map((suggestion, index) => (
                <li key={`${suggestion}-${index}`} className="flex gap-3 text-sm leading-6 text-[#625F59]">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-[#C44732]" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </article>
  );
}
