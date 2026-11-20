import type {
  AnalysisCompletePayload,
  AnalysisStage,
  Citation,
  DocumentSessionPayload,
} from '@/lib/document-types';

export interface AnalysisProgress {
  stage: AnalysisStage;
  progress: number;
  message: string;
}

interface SseEvent {
  event: string;
  data: string;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

async function readSse(
  response: Response,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error('当前浏览器无法读取流式响应，请更换浏览器重试。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) onEvent({ event, data: dataLines.join('\n') });
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      if (frame.trim()) processFrame(frame);
    }
    if (done) {
      if (buffer.trim()) processFrame(buffer);
      break;
    }
  }
}

export function uploadDocument(
  file: File,
  onProgress: (percentage: number) => void,
): Promise<DocumentSessionPayload> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    request.open('POST', '/api/documents/upload');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('网络连接失败，请检查网络后重试。'));
    request.onload = () => {
      try {
        const body: unknown = JSON.parse(request.responseText);
        if (request.status < 200 || request.status >= 300) {
          const message =
            typeof body === 'object' &&
            body !== null &&
            'error' in body &&
            typeof body.error === 'string'
              ? body.error
              : '文档上传失败，请重试。';
          reject(new Error(message));
          return;
        }
        resolve(body as DocumentSessionPayload);
      } catch {
        reject(new Error('上传响应格式异常，请重新上传。'));
      }
    };
    request.send(formData);
  });
}

export async function analyzeDocument(
  documentId: string,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<AnalysisCompletePayload> {
  const response = await fetch(`/api/documents/${documentId}/analyze`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(await readError(response, '无法启动文档分析。'));

  let result: AnalysisCompletePayload | null = null;
  let streamError: string | null = null;

  await readSse(response, ({ event, data }) => {
    const payload: unknown = JSON.parse(data);
    if (event === 'progress') {
      onProgress(payload as AnalysisProgress);
    } else if (event === 'result') {
      result = payload as AnalysisCompletePayload;
    } else if (event === 'error') {
      streamError =
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof payload.message === 'string'
          ? payload.message
          : 'AI 分析失败，请重试。';
    }
  });

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error('分析响应不完整，请重新分析。');
  return result;
}

export async function streamDocumentAnswer(
  documentId: string,
  question: string,
  handlers: {
    onDelta: (content: string) => void;
    onDone: (citations: Citation[]) => void;
  },
): Promise<void> {
  const response = await fetch(`/api/documents/${documentId}/qa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) throw new Error(await readError(response, '问答请求失败，请重试。'));

  let streamError: string | null = null;
  await readSse(response, ({ event, data }) => {
    const payload: unknown = JSON.parse(data);
    if (event === 'delta' && typeof payload === 'object' && payload !== null && 'content' in payload) {
      if (typeof payload.content === 'string') handlers.onDelta(payload.content);
    }
    if (event === 'done' && typeof payload === 'object' && payload !== null && 'citations' in payload) {
      handlers.onDone(Array.isArray(payload.citations) ? (payload.citations as Citation[]) : []);
    }
    if (event === 'error') {
      streamError =
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof payload.message === 'string'
          ? payload.message
          : '问答服务暂时不可用。';
    }
  });

  if (streamError) throw new Error(streamError);
}
