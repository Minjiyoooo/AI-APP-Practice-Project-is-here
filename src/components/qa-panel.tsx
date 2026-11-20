'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpenText,
  Bot,
  ChevronDown,
  Quote,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessage, Citation } from '@/lib/document-types';
import { streamDocumentAnswer } from '@/lib/client-api';

interface QaPanelProps {
  documentId: string;
}

const SUGGESTED_QUESTIONS = ['这份文档的核心结论是什么？', '有哪些需要关注的风险？', '请概括文档中的关键数据。'];

function Citations({ items }: { items: Citation[] }) {
  if (!items.length) return null;
  return (
    <details className="group mt-3 border-t border-[#E8E5E0] pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-[#74716B] hover:text-[#C44732]">
        <Quote className="size-3.5" />
        引用原文 · {items.length} 个片段
        <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-2">
        {items.map((citation) => (
          <div key={citation.id} className="rounded-md bg-[#F7F6F3] p-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#8A867F]">
              <span>原文片段 {citation.id}</span>
              <span>相关度 {Math.max(0, Math.round(citation.score * 100))}%</span>
            </div>
            <p className="max-h-36 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[#625F59]">
              {citation.text}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export function QaPanel({ documentId }: QaPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  const askQuestion = async (suggestedQuestion?: string) => {
    const question = (suggestedQuestion ?? input).trim();
    if (!question || isAnswering) return;

    const assistantId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    };
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      pending: true,
      citations: [],
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
    setIsAnswering(true);

    const updateAssistant = (update: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? update(message) : message)),
      );
    };

    try {
      await streamDocumentAnswer(documentId, question, {
        onDelta: (content) => {
          updateAssistant((message) => ({
            ...message,
            content: message.content + content,
          }));
        },
        onDone: (citations) => {
          updateAssistant((message) => ({ ...message, citations, pending: false }));
        },
      });
      updateAssistant((message) => ({ ...message, pending: false }));
    } catch (error) {
      updateAssistant((message) => ({
        ...message,
        pending: false,
        error: true,
        content:
          message.content ||
          (error instanceof Error ? error.message : '问答服务暂时不可用，请稍后重试。'),
      }));
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <section className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-[#E8E5E0] bg-white lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:min-h-0">
      <div className="flex items-center gap-3 border-b border-[#E8E5E0] px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-[#F8ECE8] text-[#C44732]">
          <BookOpenText className="size-4.5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#20201E]">基于原文提问</h2>
          <p className="mt-0.5 text-xs text-[#8A867F]">检索相关片段，回答附有引用</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[#74716B]">
          <span className="size-1.5 rounded-full bg-[#C44732]" />
          原文可溯
        </span>
      </div>

      <div ref={scrollRef} className="chat-scroll flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
        {!messages.length && (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-[#E8E5E0] text-[#C44732]">
              <Bot className="size-5" />
            </div>
            <h3 className="font-display text-xl font-semibold text-[#20201E]">还有什么想深入了解？</h3>
            <p className="mt-2 max-w-[270px] text-xs leading-5 text-[#74716B]">
              答案仅来自当前文档。没有依据时，会明确告知未找到。
            </p>
            <div className="mt-6 flex w-full flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void askQuestion(question)}
                  className="rounded-lg border border-[#E8E5E0] px-3 py-2.5 text-left text-xs text-[#5F5C56] transition-colors hover:border-[#C44732] hover:bg-[#F8ECE8] hover:text-[#C44732]"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
            <div className={message.role === 'user' ? 'max-w-[88%]' : 'w-full'}>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] text-[#8A867F]">
                {message.role === 'assistant' ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                {message.role === 'assistant' ? '析文助手' : '你'}
              </div>
              <div
                className={
                  message.role === 'user'
                    ? 'rounded-xl rounded-tr-sm bg-[#F1EFEB] px-4 py-3 text-sm leading-6 text-[#35332F]'
                    : 'text-sm leading-7 text-[#35332F]'
                }
              >
                {message.pending && !message.content ? (
                  <span className="inline-flex items-center gap-1.5 text-[#8A867F]">
                    <span className="typing-dot size-1.5 rounded-full bg-[#C44732]" />
                    <span className="typing-dot size-1.5 rounded-full bg-[#C44732] [animation-delay:150ms]" />
                    <span className="typing-dot size-1.5 rounded-full bg-[#C44732] [animation-delay:300ms]" />
                    <span className="ml-1 text-xs">正在检索原文</span>
                  </span>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
              {message.role === 'assistant' && <Citations items={message.citations ?? []} />}
            </div>
          </div>
        ))}
      </div>

      <form
        className="border-t border-[#E8E5E0] bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void askQuestion();
        }}
      >
        <div className="rounded-xl border border-[#DCD8D2] transition-colors focus-within:border-[#C44732] focus-within:ring-2 focus-within:ring-[#C44732]/10">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void askQuestion();
              }
            }}
            placeholder="针对这份文档提问…"
            maxLength={1000}
            rows={2}
            disabled={isAnswering}
            className="min-h-[62px] resize-none border-0 px-3.5 py-3 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="text-[10px] text-[#9A958D]">Enter 发送 · Shift + Enter 换行</span>
            <Button
              type="submit"
              size="icon-sm"
              disabled={!input.trim() || isAnswering}
              className="rounded-lg bg-[#C44732] text-white hover:bg-[#AD3C29]"
              aria-label="发送问题"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
