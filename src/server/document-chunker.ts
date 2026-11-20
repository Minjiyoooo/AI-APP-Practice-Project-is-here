import type { DocumentBlock } from '@/lib/document-types';
import { blockToText } from '@/server/document-parser';

const MIN_CHUNK_LENGTH = 500;
const TARGET_CHUNK_LENGTH = 680;
const MAX_CHUNK_LENGTH = 800;
const OVERLAP_LENGTH = 100;

function splitLongText(text: string): string[] {
  if (text.length <= TARGET_CHUNK_LENGTH) return [text];

  const sentences = text
    .split(/(?<=[。！？!?；;])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const units: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > TARGET_CHUNK_LENGTH) {
      if (current) {
        units.push(current);
        current = '';
      }
      for (let index = 0; index < sentence.length; index += TARGET_CHUNK_LENGTH) {
        units.push(sentence.slice(index, index + TARGET_CHUNK_LENGTH));
      }
      continue;
    }
    if (current && current.length + sentence.length > TARGET_CHUNK_LENGTH) {
      units.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) units.push(current);
  return units;
}

export function chunkDocument(blocks: DocumentBlock[]): string[] {
  const units = blocks
    .flatMap((block) => {
      const prefix = block.type === 'heading' ? `【${block.text}】` : '';
      return splitLongText(blockToText(block)).map(
        (part, index) => `${index === 0 ? prefix : ''}${part}`,
      );
    })
    .map((unit) => unit.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  let hasNewContent = false;

  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = value ? value.slice(-OVERLAP_LENGTH) : '';
    hasNewContent = false;
  };

  for (const unit of units) {
    const candidate = current ? `${current}\n${unit}` : unit;
    if (current.length >= MIN_CHUNK_LENGTH && candidate.length > MAX_CHUNK_LENGTH) {
      flush();
    }
    current = current ? `${current}\n${unit}` : unit;
    hasNewContent = true;
    if (current.length >= TARGET_CHUNK_LENGTH) {
      flush();
    }
  }

  if (hasNewContent && current.replace(/\s/g, '').length > OVERLAP_LENGTH / 2) {
    const value = current.trim();
    if (!chunks.length || value !== chunks[chunks.length - 1]) {
      chunks.push(value);
    }
  }

  return chunks.filter((chunk, index) => {
    return index === chunks.length - 1 || chunk.length >= MIN_CHUNK_LENGTH;
  });
}
