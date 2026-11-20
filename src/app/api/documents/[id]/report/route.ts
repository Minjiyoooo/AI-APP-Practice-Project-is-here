import { NextRequest, NextResponse } from 'next/server';
import { getDocumentSession } from '@/server/document-store';
import { generateWordReport } from '@/server/report-generator';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

function decodePng(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error('图表图片格式无效，请重新渲染图表后再下载。');
  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('图表图片过大，请重新生成报告。');
  }
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('图表图片不是有效的 PNG 文件，请重新渲染后再下载。');
  }
  return buffer;
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
  if (!session.analysis) {
    return NextResponse.json(
      { error: '文档分析尚未完成，请稍后再生成报告。' },
      { status: 409 },
    );
  }

  try {
    let chartImage: Buffer | undefined;
    const body: unknown = await request.json();
    if (typeof body === 'object' && body !== null && 'chartImage' in body) {
      if (typeof body.chartImage !== 'string') {
        throw new Error('图表图片格式无效，请重新渲染后再下载。');
      }
      if (body.chartImage) chartImage = decodePng(body.chartImage);
    }

    if (
      session.analysis.chart.hasChart &&
      session.analysis.chart.data?.type !== 'table' &&
      !chartImage
    ) {
      throw new Error('图表图片尚未就绪，请等待图表渲染完成后再下载。');
    }

    const report = await generateWordReport(
      session.overview,
      session.analysis,
      chartImage,
    );
    const baseName = session.fileName.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}-分析报告.docx`;

    return new Response(new Uint8Array(report), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="analysis-report.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': String(report.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(`[document-report:${id}]`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Word 报告生成失败，请稍后重试。',
      },
      { status: 400 },
    );
  }
}
