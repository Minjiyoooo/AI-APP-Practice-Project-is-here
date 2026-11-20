import { randomUUID } from 'node:crypto';
import type {
  AnalysisResult,
  DocumentBlock,
  DocumentOverview,
  SupportedExtension,
} from '@/lib/document-types';

export interface DocumentChunk {
  id: number;
  text: string;
  embedding: number[];
}

export interface DocumentSession {
  id: string;
  fileName: string;
  extension: SupportedExtension;
  blocks: DocumentBlock[];
  structuredText: string;
  overview: DocumentOverview;
  chunks: DocumentChunk[];
  analysis: AnalysisResult | null;
  createdAt: number;
  lastAccessedAt: number;
}

interface NewSession {
  fileName: string;
  extension: SupportedExtension;
  blocks: DocumentBlock[];
  structuredText: string;
  overview: DocumentOverview;
}

const globalStore = globalThis as typeof globalThis & {
  __documentAnalysisSessions?: Map<string, DocumentSession>;
};

const sessions =
  globalStore.__documentAnalysisSessions ??
  (globalStore.__documentAnalysisSessions = new Map<string, DocumentSession>());

const SESSION_TTL = 2 * 60 * 60 * 1000;

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

export function createDocumentSession(payload: NewSession): DocumentSession {
  pruneSessions();
  const now = Date.now();
  const session: DocumentSession = {
    ...payload,
    id: randomUUID(),
    chunks: [],
    analysis: null,
    createdAt: now,
    lastAccessedAt: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function getDocumentSession(id: string): DocumentSession | undefined {
  pruneSessions();
  const session = sessions.get(id);
  if (session) {
    session.lastAccessedAt = Date.now();
  }
  return session;
}

export function saveDocumentSession(session: DocumentSession): void {
  session.lastAccessedAt = Date.now();
  sessions.set(session.id, session);
}
