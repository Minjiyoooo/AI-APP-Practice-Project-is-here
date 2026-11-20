import { NextRequest, NextResponse } from 'next/server';
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';
import { getDocumentSession } from '@/server/document-store';
import { retrieveRelevantChunks } from '@/server/rag';
import { encodeSseEvent, getErrorMessage, SSE_HEADERS } from '@/server/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MODEL = 'doubao-seed-2-0-lite-260215';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const session = getDocumentSession(id);
  if (!session) {
    return NextResponse.json(
      { error: '文档会话不存在或已过期，请重新上传文档。' },
      { status: 404 },
    );
  }

  let question = '';
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('question' in body) ||
      typeof body.question !== 'string'
    ) {
      throw new Error('invalid question');
    }
    question = body.question.trim();
  } catch {
    return NextResponse.json({ error: '请输入需要提问的内容。' }, { status: 400 });
  }

  if (!question || question.length > 1000) {
    return NextResponse.json(
      { error: '问题不能为空，且不能超过 1000 字。' },
      { status: 400 },
    );
  }
  if (!session.chunks.length) {
    return NextResponse.json(
      { error: '语义索引尚未就绪，请先完成文档分析。' },
      { status: 409 },
    );
  }

  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encodeSseEvent(event, data));
      };
      let answer = '';

      try {
        const citations = await retrieveRelevantChunks(
          session.chunks,
          question,
          customHeaders,
          4,
        );
        const context = citations
          .map((citation) => `【原文片段 ${citation.id}】\n${citation.text}`)
          .join('\n\n');
        const client = new LLMClient(new Config(), customHeaders);
        const answerStream = client.stream(
          [
            {
              role: 'system',
              content:
                '你是严格的文档问答助手。只能依据用户提供的原文片段回答，不得使用外部知识或推测。如果片段不足以回答，必须只回答“未在当前文档中找到相关信息。”，不得编造。回答使用简洁中文。',
            },
            {
              role: 'user',
              content: `问题：${question}\n\n检索到的原文片段：\n${context}\n\n请仅依据上述片段回答。`,
            },
          ],
          { model: MODEL, temperature: 0.1, thinking: 'disabled' },
        );

        for await (const chunk of answerStream) {
          if (!chunk.content) continue;
          const delta = chunk.content.toString();
          answer += delta;
          send('delta', { content: delta });
        }

        const notFound = /未找到|没有相关信息|不足以回答|无法依据/.test(answer);
        send('done', { citations: notFound ? [] : citations });
      } catch (error) {
        console.error(`[document-qa:${id}]`, error);
        send('error', {
          message: getErrorMessage(error, '问答服务暂时不可用，请稍后重试。'),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
