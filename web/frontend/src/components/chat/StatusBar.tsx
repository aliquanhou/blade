/**
 * ⚔️ StatusBar — 工作状态指示器
 *
 * 三种状态：
 *   1. 工作中 — 脉冲动画 + "AI 正在处理..."
 *   2. 卡住   — 黄色警告 + "可能已卡住，请刷新或重新发送"
 *   3. 已完成 — 绿色对勾 + "响应完成"
 */

import type { Message } from '../../types';

interface StatusBarProps {
  isStreaming: boolean;
  streamStuck: boolean;
  messages: Message[];
}

export function StatusBar({ isStreaming, streamStuck, messages }: StatusBarProps) {
  const lastMsg = messages[messages.length - 1];
  const hasResponse = messages.length > 0 && lastMsg?.role === 'assistant' && lastMsg?.content?.length > 0;

  // 工作中
  if (isStreaming && !streamStuck) {
    const hasToolRunning = lastMsg?.toolCalls?.some(tc => tc.status === 'running');
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-950/40 border border-blue-800/50">
        <span className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
        <span className="text-sm text-blue-300">
          {hasToolRunning ? '🛠️ AI 正在执行工具...' : '💭 AI 正在思考...'}
        </span>
      </div>
    );
  }

  // 卡住了
  if (isStreaming && streamStuck) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-yellow-950/40 border border-yellow-700/50">
        <span className="text-yellow-400 text-lg">⚠️</span>
        <div>
          <p className="text-sm text-yellow-300 font-medium">AI 可能已卡住</p>
          <p className="text-xs text-yellow-500 mt-0.5">尝试刷新页面或重新发送消息</p>
        </div>
      </div>
    );
  }

  // 已完成
  if (!isStreaming && hasResponse) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-950/30 border border-green-800/30">
        <span className="text-green-400">✅</span>
        <span className="text-xs text-green-400/70">响应完成</span>
      </div>
    );
  }

  return null;
}
