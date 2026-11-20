'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Download,
  FileCheck2,
  FileText,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ScanText,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { QaPanel } from '@/components/qa-panel';
import { ReportPreview } from '@/components/report-preview';
import { analyzeDocument, uploadDocument, type AnalysisProgress } from '@/lib/client-api';
import { validateFileMetadata } from '@/lib/file-validation';
import type {
  AnalysisResult,
  AnalysisStage,
  DocumentOverview,
} from '@/lib/document-types';

type PagePhase = 'upload' | 'analyzing' | 'result';

const ANALYSIS_STEPS: Array<{
  stage: AnalysisStage;
  label: string;
  description: string;
  doneAt: number;
}> = [
  { stage: 'parse', label: '解析文档结构', description: '识别标题、段落与表格', doneAt: 24 },
  { stage: 'embedding', label: '建立语义索引', description: '按段落切块并生成向量', doneAt: 46 },
  { stage: 'summary', label: '提炼摘要与关键词', description: '200 字以内摘要，最多 5 个关键词', doneAt: 64 },
  { stage: 'chart', label: '核验数据与图表', description: '只采用能够回溯原文的数据', doneAt: 82 },
  { stage: 'content', label: '生成结构化报告', description: '章节、结论、发现、风险与建议', doneAt: 100 },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-[#C44732] text-white">
        <ScanText className="size-5" />
      </span>
      <div>
        <div className="font-display text-lg font-semibold leading-none text-[#20201E]">析文</div>
        <div className="mt-1 text-[9px] tracking-[0.16em] text-[#8A867F]">AI DOCUMENT</div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-[#E8E5E0] bg-white/95">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <Brand />
        <div className="flex items-center gap-2 text-xs text-[#74716B]">
          <ShieldCheck className="size-4 text-[#C44732]" />
          <span className="hidden sm:inline">文档仅在当前会话中处理</span>
          <span className="sm:hidden">会话级处理</span>
        </div>
      </div>
    </header>
  );
}

function Stepper({ phase }: { phase: PagePhase }) {
  const activeIndex = phase === 'upload' ? 0 : phase === 'analyzing' ? 1 : 2;
  const steps = ['上传文档', 'AI 分析', '报告与问答'];
  return (
    <div className="mx-auto flex w-full max-w-xl items-center py-7">
      {steps.map((step, index) => (
        <div key={step} className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
          <div className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full border text-[11px] font-medium ${
                index < activeIndex
                  ? 'border-[#C44732] bg-[#C44732] text-white'
                  : index === activeIndex
                    ? 'border-[#C44732] bg-[#F8ECE8] text-[#C44732]'
                    : 'border-[#DCD8D2] bg-white text-[#A29D95]'
              }`}
            >
              {index < activeIndex ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={`whitespace-nowrap text-xs sm:text-sm ${index <= activeIndex ? 'font-medium text-[#35332F]' : 'text-[#A29D95]'}`}>
              {step}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={`mx-3 h-px flex-1 sm:mx-5 ${index < activeIndex ? 'bg-[#C44732]' : 'bg-[#E1DED8]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<PagePhase>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [overview, setOverview] = useState<DocumentOverview | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('等待上传');
  const [currentStage, setCurrentStage] = useState<AnalysisStage>('upload');
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [chartImage, setChartImage] = useState('');
  const chartImageRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChartImageReady = useCallback((image: string) => {
    chartImageRef.current = image;
    setChartImage(image);
  }, []);

  const startAnalysis = async (file: File) => {
    setError('');
    try {
      validateFileMetadata(file.name, file.size);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : '文件校验失败。');
      return;
    }

    setSelectedFile(file);
    setAnalysis(null);
    setOverview(null);
    setDocumentId(null);
    setChartImage('');
    chartImageRef.current = '';
    setProgress(2);
    setCurrentStage('upload');
    setStatusMessage('正在安全上传文档');
    setPhase('analyzing');

    try {
      const uploaded = await uploadDocument(file, (percentage) => {
        setProgress(Math.max(2, Math.round(percentage * 0.2)));
        setStatusMessage(percentage >= 100 ? '正在解析标题、段落与表格' : '正在安全上传文档');
      });
      setDocumentId(uploaded.documentId);
      setOverview(uploaded.overview);
      setProgress(24);
      setCurrentStage('parse');
      setStatusMessage('文档结构解析完成，准备 AI 分析');

      const result = await analyzeDocument(uploaded.documentId, (update: AnalysisProgress) => {
        setProgress(update.progress);
        setCurrentStage(update.stage);
        setStatusMessage(update.message);
      });
      setAnalysis(result.analysis);
      setOverview(result.overview);
      setProgress(100);
      setPhase('result');
    } catch (analysisError) {
      setPhase('upload');
      setError(analysisError instanceof Error ? analysisError.message : '文档分析失败，请重试。');
    }
  };

  const reset = () => {
    setPhase('upload');
    setSelectedFile(null);
    setDocumentId(null);
    setOverview(null);
    setAnalysis(null);
    setError('');
    setProgress(0);
    setChartImage('');
    chartImageRef.current = '';
  };

  const downloadReport = async () => {
    if (!documentId || !overview || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const response = await fetch(`/api/documents/${documentId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartImage: chartImageRef.current }),
      });
      if (!response.ok) {
        let message = 'Word 报告生成失败，请重试。';
        try {
          const body: unknown = await response.json();
          if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
            message = body.error;
          }
        } catch {
          // 保留默认中文错误提示。
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${overview.fileName.replace(/\.[^.]+$/, '')}-分析报告.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '报告下载失败，请重试。');
    } finally {
      setDownloading(false);
    }
  };

  const chartNeedsImage = analysis?.chart.hasChart && analysis.chart.data?.type !== 'table';

  return (
    <div className="min-h-screen bg-white text-[#20201E]">
      <Header />
      <main className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Stepper phase={phase} />

        {phase === 'upload' && (
          <div className="grid items-center gap-12 pb-16 pt-5 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:pb-24 lg:pt-12">
            <section>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E8E5E0] px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-[#74716B]">
                <Sparkles className="size-3.5 text-[#C44732]" />
                DOCUMENT INTELLIGENCE
              </div>
              <h1 className="font-display max-w-[650px] text-[42px] font-semibold leading-[1.2] tracking-[-0.03em] text-[#20201E] sm:text-[58px] lg:text-[64px]">
                读懂文档，
                <br />
                让结论<span className="text-[#C44732]">有据可依</span>。
              </h1>
              <p className="mt-6 max-w-[540px] text-base leading-8 text-[#6D6962]">
                上传一份文档，获得结构化分析报告与可下载的 Word 文件。继续追问细节，每个回答都能回到原文。
              </p>
              <div className="mt-9 grid max-w-[570px] grid-cols-1 gap-4 border-t border-[#E8E5E0] pt-7 sm:grid-cols-3">
                {[
                  ['结构化解析', '保留标题与表格'],
                  ['数据可核验', '不编造图表数据'],
                  ['原文级问答', '回答附引用片段'],
                ].map(([title, description], index) => (
                  <div key={title} className="flex gap-3 sm:block">
                    <span className="text-[11px] font-medium tabular-nums text-[#C44732]">0{index + 1}</span>
                    <div>
                      <h2 className="text-sm font-semibold sm:mt-2">{title}</h2>
                      <p className="mt-1 text-xs text-[#8A867F]">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[#E1DED8] bg-white p-5 shadow-[0_20px_60px_rgba(47,42,35,0.07)] sm:p-7">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold">开始分析</h2>
                  <p className="mt-1.5 text-xs text-[#8A867F]">一次上传一份需要深入阅读的文档</p>
                </div>
                <span className="rounded-md bg-[#F7F6F3] px-2 py-1 text-[10px] text-[#74716B]">最大 20MB</span>
              </div>

              <label
                className={`group flex min-h-[310px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-all ${
                  dragActive ? 'border-[#C44732] bg-[#F8ECE8]' : 'border-[#CFCAC2] bg-[#FAF9F7] hover:border-[#C44732] hover:bg-[#FDF7F5]'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const file = event.dataTransfer.files[0];
                  if (file) void startAnalysis(file);
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only"
                  accept=".docx,.pdf,.doc"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void startAnalysis(file);
                    event.target.value = '';
                  }}
                />
                <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-[#E8E5E0] bg-white text-[#C44732] shadow-sm transition-transform group-hover:-translate-y-1">
                  <UploadCloud className="size-7" strokeWidth={1.6} />
                </div>
                <h3 className="text-base font-semibold text-[#302E2A]">拖放文档到这里</h3>
                <p className="mt-2 text-sm text-[#8A867F]">或点击此处从设备中选择</p>
                <div className="mt-7 flex items-center gap-2">
                  {['DOCX', 'PDF', 'DOC'].map((format) => (
                    <span key={format} className="rounded border border-[#E1DED8] bg-white px-2.5 py-1 text-[10px] font-medium text-[#6D6962]">
                      .{format}
                    </span>
                  ))}
                </div>
              </label>

              {error && (
                <div className="mt-4 flex gap-2.5 rounded-lg border border-[#EAC9C0] bg-[#FDF5F2] p-3 text-xs leading-5 text-[#A83E2B]" role="alert">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-[#8A867F]">
                <LockKeyhole className="size-3.5" />
                前后端双重校验 · 会话结束不保留向量索引
              </div>
            </section>
          </div>
        )}

        {phase === 'analyzing' && (
          <section className="mx-auto max-w-3xl pb-20 pt-4">
            <div className="overflow-hidden rounded-2xl border border-[#E1DED8] bg-white shadow-[0_20px_60px_rgba(47,42,35,0.06)]">
              <div className="paper-scan relative flex flex-col items-center border-b border-[#E8E5E0] bg-[#FAF9F7] px-6 py-10 text-center">
                <div className="relative mb-5 flex size-20 items-center justify-center rounded-xl border border-[#E1DED8] bg-white text-[#C44732] shadow-sm">
                  <FileText className="size-9" strokeWidth={1.4} />
                  <span className="absolute -bottom-2 -right-2 flex size-7 items-center justify-center rounded-full bg-[#C44732] text-white">
                    <Sparkles className="size-3.5" />
                  </span>
                </div>
                <h1 className="font-display text-2xl font-semibold">正在读懂这份文档</h1>
                <p className="mt-2 max-w-md break-all text-xs text-[#8A867F]">{selectedFile?.name}</p>
                <div className="mt-7 w-full max-w-lg">
                  <div className="mb-2.5 flex items-center justify-between text-xs">
                    <span className="text-[#625F59]">{statusMessage}</span>
                    <span className="font-semibold tabular-nums text-[#C44732]">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5 bg-[#EAE6E0] [&_[data-slot=progress-indicator]]:bg-[#C44732]" />
                </div>
              </div>

              <div className="px-5 py-6 sm:px-10 sm:py-8">
                <div className="space-y-1">
                  {ANALYSIS_STEPS.map((step) => {
                    const isDone = progress >= step.doneAt;
                    const isActive = !isDone && (currentStage === step.stage || (step.stage === 'parse' && currentStage === 'upload'));
                    return (
                      <div key={step.stage} className="flex items-center gap-4 rounded-lg px-3 py-3.5">
                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${isDone ? 'bg-[#C44732] text-white' : isActive ? 'bg-[#F8ECE8] text-[#C44732]' : 'bg-[#F3F1ED] text-[#A29D95]'}`}>
                          {isDone ? <Check className="size-3.5" /> : isActive ? <LoaderCircle className="size-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-[#C7C2BA]" />}
                        </span>
                        <div className="flex-1">
                          <h2 className={`text-sm ${isDone || isActive ? 'font-medium text-[#35332F]' : 'text-[#A29D95]'}`}>{step.label}</h2>
                          <p className="mt-0.5 text-[11px] text-[#9A958D]">{step.description}</p>
                        </div>
                        {isDone && <span className="text-[11px] text-[#8A867F]">已完成</span>}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-5 border-t border-[#E8E5E0] pt-5 text-center text-[11px] leading-5 text-[#9A958D]">
                  分析时间取决于文档长度，请保持当前页面打开
                </p>
              </div>
            </div>
          </section>
        )}

        {phase === 'result' && analysis && overview && documentId && (
          <div className="pb-16">
            <div className="mb-6 flex flex-col gap-4 rounded-xl border border-[#E8E5E0] bg-[#FAF9F7] p-4 sm:p-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#F8ECE8] text-[#C44732]">
                  <FileCheck2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-sm font-semibold">{overview.fileName}</h1>
                    <CheckCircle2 className="size-4 shrink-0 text-[#C44732]" />
                  </div>
                  <p className="mt-1 text-[11px] text-[#8A867F]">
                    .{overview.fileType.toUpperCase()} · {overview.characterCount.toLocaleString('zh-CN')} 字符 · {overview.chunkCount} 个语义片段
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5 lg:ml-auto">
                <Button variant="outline" onClick={reset} className="border-[#DCD8D2] bg-white text-[#625F59] hover:bg-[#F1EFEB]">
                  <RotateCcw className="size-4" />
                  分析新文档
                </Button>
                <Button
                  onClick={() => void downloadReport()}
                  disabled={downloading || Boolean(chartNeedsImage && !chartImage)}
                  className="bg-[#C44732] text-white hover:bg-[#AD3C29]"
                >
                  {downloading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {downloading ? '正在生成 Word' : chartNeedsImage && !chartImage ? '图表渲染中' : '下载 Word 报告'}
                  {!downloading && !(chartNeedsImage && !chartImage) && <ArrowRight className="size-3.5" />}
                </Button>
              </div>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-[#EAC9C0] bg-[#FDF5F2] p-3 text-xs text-[#A83E2B]" role="alert">
                <CircleAlert className="size-4" />
                {error}
              </div>
            )}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.85fr)]">
              <ReportPreview analysis={analysis} overview={overview} onChartImageReady={handleChartImageReady} />
              <QaPanel documentId={documentId} />
            </div>
          </div>
        )}
      </main>
      <footer className="border-t border-[#E8E5E0] py-6 text-center text-[11px] text-[#9A958D]">
        析文 · 让每一份结论都能回到原文
      </footer>
    </div>
  );
}
