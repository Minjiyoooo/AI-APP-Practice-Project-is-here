import { NextRequest, NextResponse } from 'next/server';
import { validateFileMetadata, validateFileSignature } from '@/lib/file-validation';
import type { DocumentSessionPayload } from '@/lib/document-types';
import {
  buildDocumentOverview,
  parseDocument,
  toStructuredText,
} from '@/server/document-parser';
import { createDocumentSession } from '@/server/document-store';
import { getErrorMessage } from '@/server/sse';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择需要分析的文档。' }, { status: 400 });
    }

    const fileName = file.name.split(/[\\/]/).pop() ?? file.name;
    const extension = validateFileMetadata(fileName, file.size);
    const buffer = Buffer.from(await file.arrayBuffer());
    validateFileSignature(buffer, extension);

    const blocks = await parseDocument(buffer, extension);
    const structuredText = toStructuredText(blocks);
    const overview = buildDocumentOverview(fileName, extension, file.size, blocks);
    const session = createDocumentSession({
      fileName,
      extension,
      blocks,
      structuredText,
      overview,
    });

    const payload: DocumentSessionPayload = {
      documentId: session.id,
      overview,
      outline: blocks
        .filter((block) => block.type === 'heading')
        .map((block) => block.text)
        .slice(0, 8),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[document-upload]', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '文档上传或解析失败，请重试。') },
      { status: 400 },
    );
  }
}
