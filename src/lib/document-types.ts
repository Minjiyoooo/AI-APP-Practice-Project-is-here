export const SUPPORTED_EXTENSIONS = ['docx', 'pdf', 'doc'] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export type DocumentBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; rows: string[][] };

export interface DocumentOverview {
  fileName: string;
  fileType: SupportedExtension;
  fileSize: number;
  characterCount: number;
  paragraphCount: number;
  headingCount: number;
  tableCount: number;
  chunkCount: number;
}

export interface DocumentSessionPayload {
  documentId: string;
  overview: DocumentOverview;
  outline: string[];
}

export interface ChartSeries {
  name: string;
  data: Array<number | string | null>;
}

export interface ChartData {
  title: string;
  type: 'line' | 'bar' | 'table';
  categories: string[];
  series: ChartSeries[];
  unit?: string;
}

export interface ChartAnalysis {
  hasChart: boolean;
  reason: string;
  data: ChartData | null;
}

export interface ContentSection {
  title: string;
  summary: string;
}

export interface ContentAnalysis {
  sections: ContentSection[];
  coreConclusions: string[];
  keyFindings: string[];
  risks: string[];
  suggestions: string[];
}

export interface AnalysisResult {
  summary: string;
  keywords: string[];
  chart: ChartAnalysis;
  content: ContentAnalysis;
}

export interface AnalysisCompletePayload {
  analysis: AnalysisResult;
  overview: DocumentOverview;
}

export interface Citation {
  id: number;
  text: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  pending?: boolean;
  error?: boolean;
}

export type AnalysisStage =
  | 'upload'
  | 'parse'
  | 'embedding'
  | 'summary'
  | 'chart'
  | 'content'
  | 'complete';
