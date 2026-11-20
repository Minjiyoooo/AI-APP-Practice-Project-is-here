import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type {
  AnalysisResult,
  ChartData,
  DocumentOverview,
} from '@/lib/document-types';

const INK = '20201E';
const MUTED = '74716B';
const ACCENT = 'C44732';
const LINE = 'E8E5E0';
const PAPER_GRAY = 'F7F6F3';
const FONT = 'Microsoft YaHei';

function textParagraph(
  text: string,
  options: {
    bold?: boolean;
    color?: string;
    size?: number;
    bullet?: boolean;
    spacingAfter?: number;
  } = {},
): Paragraph {
  return new Paragraph({
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: options.spacingAfter ?? 140, line: 340 },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        color: options.color ?? INK,
        size: options.size ?? 21,
        font: FONT,
      }),
    ],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    border: {
      bottom: { color: LINE, style: BorderStyle.SINGLE, size: 6, space: 8 },
    },
    children: [
      new TextRun({ text, bold: true, color: INK, size: 30, font: FONT }),
    ],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text, bold: true, color: ACCENT, size: 24, font: FONT }),
    ],
  });
}

function makeCell(text: string, header = false): TableCell {
  return new TableCell({
    shading: header ? { type: ShadingType.CLEAR, fill: PAPER_GRAY } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: header,
            color: INK,
            size: 18,
            font: FONT,
          }),
        ],
      }),
    ],
  });
}

function makeTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header) => makeCell(header, true)),
      }),
      ...rows.map(
        (row) => new TableRow({ children: row.map((cell) => makeCell(cell)) }),
      ),
    ],
  });
}

function chartTable(data: ChartData): Table {
  return makeTable(
    ['分类', ...data.series.map((series) => series.name)],
    data.categories.map((category, index) => [
      category,
      ...data.series.map((series) => {
        const value = series.data[index];
        return value === null || value === undefined ? '—' : String(value);
      }),
    ]),
  );
}

function overviewTable(overview: DocumentOverview): Table {
  const rows = [
    ['原始文档', overview.fileName],
    ['文档格式', `.${overview.fileType.toUpperCase()}`],
    ['正文字符', overview.characterCount.toLocaleString('zh-CN')],
    ['结构统计', `${overview.headingCount} 个标题 / ${overview.paragraphCount} 个段落 / ${overview.tableCount} 个表格`],
    ['语义片段', `${overview.chunkCount} 个（会话级向量索引）`],
  ];
  return makeTable(['项目', '内容'], rows);
}

export async function generateWordReport(
  overview: DocumentOverview,
  analysis: AnalysisResult,
  chartImage?: Buffer,
): Promise<Buffer> {
  const tables: Array<Paragraph | Table> = [];

  tables.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 180 },
      children: [
        new TextRun({
          text: '智能文档分析报告',
          bold: true,
          color: INK,
          size: 44,
          font: FONT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: overview.fileName,
          color: MUTED,
          size: 22,
          font: FONT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 420 },
      children: [
        new TextRun({
          text: `生成日期：${new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}`,
          color: MUTED,
          size: 18,
          font: FONT,
        }),
      ],
    }),
    sectionHeading('一、摘要'),
    textParagraph(analysis.summary),
    sectionHeading('二、关键词'),
    textParagraph(analysis.keywords.join('  ·  '), {
      bold: true,
      color: ACCENT,
      size: 22,
    }),
    sectionHeading('三、文档概览'),
    overviewTable(overview),
    sectionHeading('四、核心内容解析'),
  );

  for (const section of analysis.content.sections) {
    tables.push(subHeading(section.title), textParagraph(section.summary));
  }

  if (analysis.content.keyFindings.length) {
    tables.push(subHeading('关键发现'));
    for (const finding of analysis.content.keyFindings) {
      tables.push(textParagraph(finding, { bullet: true }));
    }
  }

  tables.push(subHeading('风险提示'));
  if (analysis.content.risks.length) {
    for (const risk of analysis.content.risks) {
      tables.push(textParagraph(risk, { bullet: true }));
    }
  } else {
    tables.push(textParagraph('原文未明确提出显著风险，建议结合具体使用场景复核。'));
  }

  tables.push(sectionHeading('五、数据图表'));
  if (analysis.chart.hasChart && analysis.chart.data) {
    const chart = analysis.chart.data;
    tables.push(subHeading(chart.title));
    if (chart.type !== 'table' && chartImage) {
      tables.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [
            new ImageRun({
              type: 'png',
              data: chartImage,
              transformation: { width: 600, height: 340 },
            }),
          ],
        }),
      );
    } else if (chart.type !== 'table') {
      tables.push(textParagraph('图表图片未随请求提供，请返回页面重新生成报告。'));
    } else {
      tables.push(textParagraph('该组数据适合以明细表格呈现，见下一节。'));
    }
    tables.push(textParagraph(`数据说明：${analysis.chart.reason}`, {
      color: MUTED,
      size: 18,
    }));
  } else {
    tables.push(textParagraph(analysis.chart.reason));
  }

  if (analysis.chart.hasChart && analysis.chart.data) {
    tables.push(
      sectionHeading('六、数据表格'),
      chartTable(analysis.chart.data),
      sectionHeading('七、结论与建议'),
    );
  } else {
    tables.push(sectionHeading('六、结论与建议'));
  }

  tables.push(subHeading('核心结论'));
  if (analysis.content.coreConclusions.length) {
    for (const conclusion of analysis.content.coreConclusions) {
      tables.push(textParagraph(conclusion, { bullet: true }));
    }
  } else {
    tables.push(textParagraph('原文未形成可明确提取的结论。'));
  }

  tables.push(subHeading('建议'));
  if (analysis.content.suggestions.length) {
    for (const suggestion of analysis.content.suggestions) {
      tables.push(textParagraph(suggestion, { bullet: true }));
    }
  } else {
    tables.push(textParagraph('原文未提供进一步建议。'));
  }

  const document = new Document({
    creator: '析文 AI 文档分析',
    title: `${overview.fileName} 分析报告`,
    description: '基于原始文档生成的结构化分析报告',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 21, color: INK },
          paragraph: { spacing: { line: 340, after: 140 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: ['第 ', PageNumber.CURRENT, ' 页'],
                    color: MUTED,
                    size: 16,
                    font: FONT,
                  }),
                ],
              }),
            ],
          }),
        },
        children: tables,
      },
    ],
  });

  return Packer.toBuffer(document);
}
