import { NextRequest, NextResponse } from 'next/server';
import type { AnalysisCompletePayload } from '@/lib/document-types';
import {
  analyzeChartData,
  analyzeDocumentContent,
  analyzeSummaryAndKeywords,
} from '@/server/ai-analysis';
import { chunkDocument } from '@/server/document-chunker';
import { getDocumentSession, saveDocumentSession } from '@/server/document-store';
import { embedDocumentChunks } from '@/server/rag';
import { encodeSseEvent, getErrorMessage, SSE_HEADERS } from '@/server/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const session = getDocumentSession(id);

  if (!session) {
    return NextResponse.json(
      { error: '文档会话不存在或已过期，请重新上传文档。' },
      { status: 404 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encodeSseEvent(event, data));
      };

      try {
        if (!session.chunks.length) {
          send('progress', {
            stage: 'embedding',
            progress: 28,
            message: '正在切分原文并建立语义索引',
          });
          const chunkTexts = chunkDocument(session.blocks);
          if (!chunkTexts.length) throw new Error('文档内容过短，无法建立语义索引。');
          const embeddings = await embedDocumentChunks(chunkTexts, customHeaders);
          session.chunks = chunkTexts.map((text, index) => ({
            id: index + 1,
            text,
            embedding: embeddings[index],
          }));
          session.overview.chunkCount = session.chunks.length;
          saveDocumentSession(session);
        }

        send('progress', {
          stage: 'summary',
          progress: 46,
          message: '正在提炼摘要与关键词',
        });
        const { summary, keywords } = await analyzeSummaryAndKeywords(
          session.structuredText,
          customHeaders,
        );

        send('progress', {
          stage: 'chart',
          progress: 64,
          message: '正在核验量化数据与图表依据',
        });
        const chart = await analyzeChartData(session.structuredText, customHeaders);

        send('progress', {
          stage: 'content',
          progress: 82,
          message: '正在解析章节、结论与风险',
        });
        const content = await analyzeDocumentContent(
          session.structuredText,
          customHeaders,
        );

        session.analysis = { summary, keywords, chart, content };
        saveDocumentSession(session);

        const payload: AnalysisCompletePayload = {
          analysis: session.analysis,
          overview: session.overview,
        };
        send('result', payload);
        send('progress', {
          stage: 'complete',
          progress: 100,
          message: '分析完成，报告已就绪',
        });
      } catch (error) {
        console.error(`[document-analyze:${id}]`, error);
        send('error', {
          message: getErrorMessage(error, 'AI 分析暂时失败，请稍后重试。'),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
