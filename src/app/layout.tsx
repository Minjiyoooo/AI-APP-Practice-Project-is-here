import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '析文 · AI 智能文档分析',
  description:
    '上传 DOCX、PDF 或 DOC 文档，生成可下载的 Word 分析报告，并基于原文进行带引用的智能问答。',
  keywords: ['文档分析', 'AI 报告', 'Word 报告', '文档问答', 'RAG'],
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
