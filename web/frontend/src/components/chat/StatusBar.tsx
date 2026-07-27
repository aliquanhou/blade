/**
 * ⚔️ StatusBar — 工作状态指示器
 *
 * 根据 stopReason 区分：
 *   stop         → ✅ 响应完成
 *   max_turns    → ⚠️ 已达工具轮次上限，任务可能未完成
 *   tool_use     → ⏳ 工作中
 *   error/null   → ❌ 出错 / 未知
 *   streaming 中 → 脉冲动画
 *   卡住         → 黄色警告
 */

import type { Message } from '../../types';

interface StatusBarProps {
  isStreaming: boolean;
  streamStuck: boolean;
  stopReason: string | null;
  messages: Message[];
}

export function StatusBar({ isStreaming, streamStuck, stopReason, messages }: StatusBarProps) {
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

  // 已完成（根据 stopReason 区分）
  if (!isStreaming && hasResponse) {
    if (stopReason === 'max_turns') {
      return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-950/40 border border-yellow-700/50">
          <span className="text-yellow-400">⚠️</span>
          <span className="text-xs text-yellow-300">已达工具调用上限，任务可能未完成 — 可继续发送消息</span>
        </div>
      );
    }
    if (stopReason === 'error') {
      return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-950/40 border border-red-700/50">
          <span className="text-red-400">❌</span>
          <span className="text-xs text-red-300">响应出错，任务已中断</span>
        </div>
      );
    }
    // stop / 正常完成
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-950/30 border border-green-800/30">
        <span className="text-green-400">✅</span>
        <span className="text-xs text-green-400/70">响应完成</span>
      </div>
    );
  }

  return null;
}
