/**
 * ⚔️ MessageItem — 消息渲染组件
 *
 * 支持文本、Markdown、工具调用卡片。
 * 解析 llmagent 统一 SSE 格式生成的消息。
 */

import { CodeBlock } from './CodeBlock';
import { ToolCallCard } from './ToolCallCard';
import type { Message } from '../../types';

interface Props {
  message: Message;
  isStreaming?: boolean;
}

function renderMarkdown(text: string) {
  if (!text) return null;
  const parts: JSX.Element[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Code block
    const codeMatch = remaining.match(/```(\w*)\n([\s\S]*?)```/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(renderInline(remaining.slice(0, codeMatch.index), parts.length));
      }
      parts.push(<CodeBlock key={parts.length} code={codeMatch[2]} language={codeMatch[1]} />);
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
      continue;
    }
    // Inline code, bold, etc.
    parts.push(renderInline(remaining, parts.length));
    break;
  }
  return parts;
}

function renderInline(text: string, key: number): JSX.Element {
  const segments: JSX.Element[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // **bold**
    const bMatch = remaining.match(/\*\*(.*?)\*\*/);
    if (bMatch && bMatch.index !== undefined) {
      if (bMatch.index > 0) segments.push(<span key={segments.length}>{remaining.slice(0, bMatch.index)}</span>);
      segments.push(<strong key={segments.length}>{bMatch[1]}</strong>);
      remaining = remaining.slice(bMatch.index + bMatch[0].length);
      continue;
    }
    // `inline code`
    const cMatch = remaining.match(/`([^`]+)`/);
    if (cMatch && cMatch.index !== undefined) {
      if (cMatch.index > 0) segments.push(<span key={segments.length}>{remaining.slice(0, cMatch.index)}</span>);
      segments.push(<code key={segments.length} className="bg-gray-800 px-1.5 py-0.5 rounded text-sm text-pink-300">{cMatch[1]}</code>);
      remaining = remaining.slice(cMatch.index + cMatch[0].length);
      continue;
    }
    // bullet list
    const bulletMatch = remaining.match(/^- (.+)$/m);
    if (bulletMatch && bulletMatch.index !== undefined) {
      if (bulletMatch.index > 0) segments.push(<span key={segments.length}>{remaining.slice(0, bulletMatch.index)}</span>);
      segments.push(<div key={segments.length} className="flex gap-2"><span className="text-gray-500">•</span><span>{bulletMatch[1]}</span></div>);
      remaining = remaining.slice(bulletMatch.index + bulletMatch[0].length);
      continue;
    }
    // newline
    const nMatch = remaining.match(/^\n/);
    if (nMatch && nMatch.index !== undefined) {
      segments.push(<br key={segments.length} />);
      remaining = remaining.slice(1);
      continue;
    }
    // Regular text
    segments.push(<span key={segments.length}>{remaining}</span>);
    break;
  }
  return <div key={key} className="space-y-1">{segments}</div>;
}

export function MessageItem({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Tool messages are rendered inline via ToolCallCard in the assistant message
  if (isTool) return null;

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm shrink-0 mt-1">
          B
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'bg-blue-600 rounded-2xl rounded-br-sm px-4 py-2.5' : 'py-1'}`}>
        {/* Text content */}
        <div className={`text-sm leading-relaxed ${isUser ? 'text-white' : 'text-gray-100'}`}>
          {isUser ? (
            message.content
          ) : (
            <>
              {renderMarkdown(message.content || '')}
              {isStreaming && !message.content && <span className="typing-cursor" />}
            </>
          )}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={`${tc.name}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Timestamp / status */}
        <div className={`text-xs mt-1 ${isUser ? 'text-blue-200' : 'text-gray-500'}`}>
          {time}
          {isStreaming ? ' · 输入中...' : ''}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-sm shrink-0 mt-1">
          U
        </div>
      )}
    </div>
  );
}
