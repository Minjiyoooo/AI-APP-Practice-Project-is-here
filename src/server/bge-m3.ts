import { createProviderError, getBgeM3Config } from '@/server/model-config';

function parseEmbeddingData(body: unknown, expectedCount: number): number[][] {
  if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
    throw new Error('BGE-M3 服务返回的数据格式无效：缺少 data 数组。');
  }

  const items = body.data.map((item, fallbackIndex) => {
    if (!item || typeof item !== 'object' || !('embedding' in item) || !Array.isArray(item.embedding)) {
      throw new Error('BGE-M3 服务返回的数据格式无效：缺少向量。');
    }
    const embedding = item.embedding;
    if (!embedding.length || embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('BGE-M3 服务返回了空向量或非有限数值。');
    }
    const index = 'index' in item && typeof item.index === 'number' ? item.index : fallbackIndex;
    return { index, embedding: embedding as number[] };
  });

  if (items.length !== expectedCount) {
    throw new Error(`BGE-M3 返回向量数量不一致：请求 ${expectedCount} 条，实际 ${items.length} 条。`);
  }

  return items.sort((left, right) => left.index - right.index).map((item) => item.embedding);
}

export async function embedBgeM3(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const config = getBgeM3Config();
  const vectors: number[][] = [];
  let dimensions: number | undefined;

  for (let offset = 0; offset < texts.length; offset += 6) {
    const input = texts.slice(offset, offset + 6);
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ model: config.model, input }),
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) throw await createProviderError(response, 'BGE-M3');
    const body: unknown = await response.json();
    const batch = parseEmbeddingData(body, input.length);

    for (const vector of batch) {
      if (dimensions === undefined) dimensions = vector.length;
      if (vector.length !== dimensions) throw new Error('BGE-M3 返回的向量维度不一致。');
      vectors.push(vector);
    }
  }

  return vectors;
}
