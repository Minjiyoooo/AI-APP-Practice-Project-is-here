import { z } from 'zod';
import { streamDeepSeek } from '@/server/deepseek';
import type {
  ChartAnalysis,
  ContentAnalysis,
} from '@/lib/document-types';

const MAX_CONTEXT_LENGTH = 90000;

const summarySchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
});

const chartDataSchema = z.object({
  title: z.string(),
  type: z.enum(['line', 'bar', 'table']),
  categories: z.array(z.string()).max(40),
  series: z
    .array(
      z.object({
        name: z.string(),
        data: z.array(z.union([z.number(), z.string(), z.null()])),
      }),
    )
    .max(10),
  unit: z.string().optional(),
});

const chartSchema = z.object({
  hasChart: z.boolean(),
  reason: z.string(),
  data: chartDataSchema.nullable().optional(),
});

const contentSchema = z.object({
  sections: z.array(z.object({ title: z.string(), summary: z.string() })).max(16),
  coreConclusions: z.array(z.string()).max(10),
  keyFindings: z.array(z.string()).max(12),
  risks: z.array(z.string()).max(10),
  suggestions: z.array(z.string()).max(10),
});

function prepareContext(structuredText: string): string {
  if (structuredText.length <= MAX_CONTEXT_LENGTH) return structuredText;
  const headLength = 65000;
  const tailLength = MAX_CONTEXT_LENGTH - headLength;
  return `${structuredText.slice(0, headLength)}\n\n[文档中段因长度限制未纳入本轮分析，请仅依据可见内容作答。]\n\n${structuredText.slice(-tailLength)}`;
}

function parseJsonObject(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('AI 返回内容不是有效的 JSON，请重新分析。');
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (error) {
    throw new Error('AI 分析结果格式异常，请重新分析。', { cause: error });
  }
}

async function callJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const stream = streamDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  let content = '';

  for await (const delta of stream) content += delta;

  return schema.parse(parseJsonObject(content));
}

function documentPrompt(task: string, structuredText: string): string {
  return `${task}\n\n以下是保留标题、段落与表格标记的文档原文：\n---\n${prepareContext(structuredText)}\n---`;
}

export async function analyzeSummaryAndKeywords(
  structuredText: string,
): Promise<{ summary: string; keywords: string[] }> {
  const result = await callJson(
    '你是严谨的中文文档摘要编辑。只依据原文，不补充外部知识，不编造事实。',
    documentPrompt(
      '本阶段只完成“摘要与关键词”任务。生成一段不超过200个汉字（含标点也不得超过200字符）的中文摘要，并提取最多5个关键词。仅输出 JSON：{"summary":"...","keywords":["..."]}。不要输出 Markdown，不要执行其他分析任务。',
      structuredText,
    ),
    summarySchema,
  );

  return {
    summary: result.summary.trim().slice(0, 200),
    keywords: result.keywords.map((item) => item.trim()).filter(Boolean).slice(0, 5),
  };
}

function sourceNumbers(structuredText: string): Set<string> {
  const values = new Set<string>();
  const matches = structuredText.match(/[-+]?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  for (const match of matches) {
    values.add(match.replace(/[,%]/g, ''));
  }
  return values;
}

function numericValues(value: number | string | null): string[] {
  if (value === null) return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [String(value)] : ['invalid'];
  return (value.match(/[-+]?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((item) =>
    item.replace(/[,%]/g, ''),
  );
}

function validateAndNormalizeChart(
  input: z.infer<typeof chartSchema>,
  structuredText: string,
): ChartAnalysis {
  if (!input.hasChart) {
    return {
      hasChart: false,
      reason: input.reason.trim() || '文档中未发现适合对比展示的量化数据，因此未生成图表。',
      data: null,
    };
  }

  const data = input.data;
  const invalid = (reason: string): ChartAnalysis => ({
    hasChart: false,
    reason,
    data: null,
  });

  if (!data || data.categories.length < 2 || !data.series.length) {
    return invalid('文档中的量化信息不足以形成可靠对比，因此未生成图表。');
  }
  if (data.series.some((series) => series.data.length !== data.categories.length)) {
    return invalid('识别到的数据维度不完整，为避免误读已跳过图表生成。');
  }

  const availableNumbers = sourceNumbers(structuredText);
  const allValues = data.series.flatMap((series) => series.data);
  const numbers = allValues.flatMap(numericValues);
  if (numbers.length < 2 || numbers.some((value) => !availableNumbers.has(value))) {
    return invalid('部分图表数值无法完整回溯至原文，为避免编造数据已跳过图表生成。');
  }

  return {
    hasChart: true,
    reason: input.reason.trim() || '图表数据均提取自文档原文。',
    data: {
      ...data,
      title: data.title.trim(),
      categories: data.categories.map((category) => category.trim()),
      series: data.series.map((series) => ({
        name: series.name.trim(),
        data:
          data.type === 'table'
            ? series.data
            : series.data.map((value) => {
                if (typeof value === 'number') return value;
                if (typeof value !== 'string' || !value.trim()) return null;
                const normalized = value.replace(/[,%\s]/g, '');
                return Number.isFinite(Number(normalized)) ? Number(normalized) : null;
              }),
      })),
    },
  };
}

export async function analyzeChartData(
  structuredText: string,
): Promise<ChartAnalysis> {
  const result = await callJson(
    '你是审慎的数据审校员。你只能提取原文明示的数据，禁止估算、插值、补全或编造任何数值。',
    documentPrompt(
      '本阶段只完成“数据与图表判断”任务。先判断原文是否确实存在可比较的量化数据或时间趋势，例如多期指标、同比环比、多个主体同类指标。没有可比较信息时必须返回 hasChart=false。确实存在时：时间趋势选 line，多主体对比选 bar，明细数据选 table。每个数值必须逐字来自原文。仅输出 JSON：{"hasChart":true,"reason":"数据依据","data":{"title":"...","type":"line|bar|table","categories":["..."],"series":[{"name":"...","data":[1,2]}],"unit":"可选单位"}}；无图表时 data=null。categories 至少2项，每个 series.data 与 categories 等长。不要输出 Markdown，不要做摘要或内容解析。',
      structuredText,
    ),
    chartSchema,
  );

  return validateAndNormalizeChart(result, structuredText);
}

export async function analyzeDocumentContent(
  structuredText: string,
): Promise<ContentAnalysis> {
  const result = await callJson(
    '你是专业的中文内容分析编辑。所有结论、发现、风险与建议都必须能在原文中找到依据，不得补写原文不存在的事实。',
    documentPrompt(
      '本阶段只完成“内容解析”任务。输出章节结构、核心结论、关键发现、风险提示，并基于原文给出审慎建议。原文没有明确风险时 risks 返回空数组，不要强行寻找风险。仅输出 JSON：{"sections":[{"title":"章节名","summary":"本节要点"}],"coreConclusions":["..."],"keyFindings":["..."],"risks":["..."],"suggestions":["..."]}。不要输出 Markdown，不要生成摘要、关键词或图表。',
      structuredText,
    ),
    contentSchema,
  );

  return {
    sections: result.sections.filter((item) => item.title.trim() && item.summary.trim()),
    coreConclusions: result.coreConclusions.map((item) => item.trim()).filter(Boolean),
    keyFindings: result.keyFindings.map((item) => item.trim()).filter(Boolean),
    risks: result.risks.map((item) => item.trim()).filter(Boolean),
    suggestions: result.suggestions.map((item) => item.trim()).filter(Boolean),
  };
}
