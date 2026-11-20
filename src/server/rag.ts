import { Config, EmbeddingClient } from 'coze-coding-dev-sdk';
import type { Citation } from '@/lib/document-types';
import type { DocumentChunk } from '@/server/document-store';

export async function embedDocumentChunks(
  texts: string[],
  customHeaders: Record<string, string>,
): Promise<number[][]> {
  const client = new EmbeddingClient(new Config(), customHeaders);
  const vectors: number[][] = [];

  for (let index = 0; index < texts.length; index += 6) {
    const batch = texts.slice(index, index + 6);
    const embeddings = await Promise.all(
      batch.map((text) =>
        client.embedText(text, {
          instructions: '为中文文档片段生成用于语义检索的向量。',
        }),
      ),
    );
    vectors.push(...embeddings);
  }

  return vectors;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }

  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export async function retrieveRelevantChunks(
  chunks: DocumentChunk[],
  question: string,
  customHeaders: Record<string, string>,
  topK = 4,
): Promise<Citation[]> {
  if (!chunks.length) return [];

  const client = new EmbeddingClient(new Config(), customHeaders);
  const questionEmbedding = await client.embedText(question, {
    instructions: '为中文文档问答生成用于语义检索的查询向量。',
  });

  return chunks
    .map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      score: cosineSimilarity(questionEmbedding, chunk.embedding),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(3, Math.min(5, topK)));
}
