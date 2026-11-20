import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import WordExtractor from 'word-extractor';
import { load } from 'cheerio';
import type {
  DocumentBlock,
  DocumentOverview,
  SupportedExtension,
} from '@/lib/document-types';

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function joinText(left: string, right: string): string {
  if (!left) return right;
  const needsSpace = /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
  return `${left}${needsSpace ? ' ' : ''}${right}`;
}

function detectHeading(text: string): DocumentBlock | null {
  const value = cleanText(text);
  if (!value || value.length > 60 || /[。！？!?]$/.test(value)) return null;

  const chapterMatch = value.match(/^第([一二三四五六七八九十百\d]+)[章节篇部]/);
  const numberedMatch = value.match(/^(\d+(?:\.\d+){0,4})[、.\s]/);
  const chineseMatch = value.match(/^[一二三四五六七八九十]+[、.]\s*/);

  if (chapterMatch) {
    return { type: 'heading', level: 1, text: value };
  }
  if (numberedMatch) {
    const depth = Math.min(6, numberedMatch[1].split('.').length);
    return { type: 'heading', level: depth, text: value };
  }
  if (chineseMatch) {
    return { type: 'heading', level: 2, text: value };
  }
  return null;
}

function textToBlocks(text: string, detectStructure: boolean): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let paragraph = '';

  const flushParagraph = () => {
    const value = cleanText(paragraph);
    if (value) blocks.push({ type: 'paragraph', text: value });
    paragraph = '';
  };

  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = cleanText(rawLine);
    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = detectStructure ? detectHeading(line) : null;
    if (heading) {
      flushParagraph();
      blocks.push(heading);
      continue;
    }

    paragraph = joinText(paragraph, line);
    if (/[。！？!?；;]$/.test(line)) {
      flushParagraph();
    }
  }
  flushParagraph();
  return blocks;
}

async function parseDocx(buffer: Buffer): Promise<DocumentBlock[]> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      includeDefaultStyleMap: true,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='标题'] => h1:fresh",
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='标题 2'] => h2:fresh",
        "p[style-name='标题 3'] => h3:fresh",
        "p[style-name='标题 4'] => h4:fresh",
        "p[style-name='标题 5'] => h5:fresh",
        "p[style-name='标题 6'] => h6:fresh",
      ],
    },
  );
  const $ = load(result.value);
  const blocks: DocumentBlock[] = [];

  $('body')
    .children()
    .each((_, element) => {
      const node = $(element);
      const tagName = element.tagName.toLowerCase();
      const headingMatch = tagName.match(/^h([1-6])$/);

      if (headingMatch) {
        const text = cleanText(node.text());
        if (text) {
          blocks.push({
            type: 'heading',
            level: Number(headingMatch[1]),
            text,
          });
        }
        return;
      }

      if (tagName === 'table') {
        const rows: string[][] = [];
        node.find('tr').each((_, row) => {
          const cells: string[] = [];
          $(row)
            .children('th,td')
            .each((__, cell) => {
              cells.push(cleanText($(cell).text()));
            });
          if (cells.some(Boolean)) rows.push(cells);
        });
        if (rows.length) blocks.push({ type: 'table', rows });
        return;
      }

      if (tagName === 'ul' || tagName === 'ol') {
        node.children('li').each((__, item) => {
          const text = cleanText($(item).text());
          if (text) blocks.push({ type: 'paragraph', text: `• ${text}` });
        });
        return;
      }

      const text = cleanText(node.text());
      if (text) blocks.push({ type: 'paragraph', text });
    });

  return blocks;
}

async function parsePdf(buffer: Buffer): Promise<DocumentBlock[]> {
  const result = await pdfParse(buffer);
  return textToBlocks(result.text, true);
}

async function parseDoc(buffer: Buffer): Promise<DocumentBlock[]> {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  return textToBlocks(document.getBody(), true);
}

export async function parseDocument(
  buffer: Buffer,
  extension: SupportedExtension,
): Promise<DocumentBlock[]> {
  let blocks: DocumentBlock[];

  try {
    blocks =
      extension === 'docx'
        ? await parseDocx(buffer)
        : extension === 'pdf'
          ? await parsePdf(buffer)
          : await parseDoc(buffer);
  } catch (error) {
    if (extension === 'doc') {
      throw new Error('旧版 .doc 文档解析失败，请在 Word 中另存为 .docx 后重新上传。');
    }
    throw new Error(
      `${extension.toUpperCase()} 文档解析失败，请确认文件未加密、未损坏后重试。`,
      { cause: error },
    );
  }

  if (!blocks.some((block) => block.type !== 'table' || block.rows.length)) {
    throw new Error('未能提取到有效文字；如果这是扫描件，请先做 OCR 或转换为可编辑文档。');
  }

  return blocks;
}

export function blockToText(block: DocumentBlock): string {
  if (block.type === 'heading') return block.text;
  if (block.type === 'paragraph') return block.text;
  return block.rows.map((row) => row.join(' | ')).join('\n');
}

export function toStructuredText(blocks: DocumentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        return `${'#'.repeat(block.level)} ${block.text}`;
      }
      if (block.type === 'table') {
        return [
          '[表格]',
          ...block.rows.map((row) => `| ${row.join(' | ')} |`),
          '[/表格]',
        ].join('\n');
      }
      return block.text;
    })
    .join('\n\n');
}

export function buildDocumentOverview(
  fileName: string,
  fileType: SupportedExtension,
  fileSize: number,
  blocks: DocumentBlock[],
  chunkCount = 0,
): DocumentOverview {
  return {
    fileName,
    fileType,
    fileSize,
    characterCount: blocks.reduce(
      (total, block) => total + blockToText(block).replace(/\s/g, '').length,
      0,
    ),
    paragraphCount: blocks.filter((block) => block.type === 'paragraph').length,
    headingCount: blocks.filter((block) => block.type === 'heading').length,
    tableCount: blocks.filter((block) => block.type === 'table').length,
    chunkCount,
  };
}
