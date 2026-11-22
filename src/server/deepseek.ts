import { createProviderError, getDeepSeekConfig } from '@/server/model-config';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamPayload {
  done: boolean;
  content: string;
}

function parseStreamPayload(data: string): StreamPayload {
  const trimmed = data.trim();
  if (!trimmed) return { done: false, content: '' };
  if (trimmed === '[DONE]') return { done: true, content: '' };

  const body: unknown = JSON.parse(trimmed);
  if (!body || typeof body !== 'object') return { done: false, content: '' };
  if ('error' in body && body.error) {
    const error = body.error;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      throw new Error(`DeepSeek 流式响应失败：${error.message}`);
    }
    throw new Error('DeepSeek 流式响应失败。');
  }
  if (!('choices' in body) || !Array.isArray(body.choices)) {
    return { done: false, content: '' };
  }

  let content = '';
  for (const choice of body.choices) {
    if (!choice || typeof choice !== 'object' || !('delta' in choice)) continue;
    const delta = choice.delta;
    if (delta && typeof delta === 'object' && 'content' in delta && typeof delta.content === 'string') {
      content += delta.content;
    }
  }
  return { done: false, content };
}

export async function* streamDeepSeek(messages: DeepSeekMessage[]): AsyncGenerator<string> {
  const config = getDeepSeekConfig();
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.1,
      stream: true,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) throw await createProviderError(response, 'DeepSeek');
  if (!response.body) throw new Error('DeepSeek 未返回可读取的流式响应。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const consumeLine = function* (line: string): Generator<string> {
    if (!line.startsWith('data:')) return;
    const payload = parseStreamPayload(line.slice(5));
    if (payload.done) {
      finished = true;
      return;
    }
    if (payload.content) yield payload.content;
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? '' : (lines.pop() ?? '');

      for (const line of lines) yield* consumeLine(line);
      if (done) {
        if (buffer) yield* consumeLine(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
