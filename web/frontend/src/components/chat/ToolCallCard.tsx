/**
 * ⚔️ ToolCallCard — 工具调用可视化组件
 *
 * 展示 tool_use → tool_result 完整生命周期。
 * 工具名、输入参数、执行状态、结果展示。
 */

import type { ToolCallInfo } from '../../types';

interface ToolCallCardProps {
  toolCall: ToolCallInfo;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { name, input, status, result } = toolCall;

  const statusIcon = {
    pending: '⏳',
    running: '◉',
    completed: '✅',
    failed: '❌',
  }[status];

  const statusColor = {
    pending: 'text-gray-400',
    running: 'text-blue-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  }[status];

  return (
    <div className={`my-2 rounded-lg border ${
      status === 'running'
        ? 'border-blue-700 bg-blue-950/30'
        : status === 'completed'
          ? 'border-green-700/50 bg-green-950/20'
          : status === 'failed'
            ? 'border-red-700/50 bg-red-950/20'
            : 'border-gray-700 bg-gray-800/50'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit">
        <span className={statusColor}>{statusIcon}</span>
        <span className="text-sm font-medium text-gray-200">{name}</span>
        <span className={`text-xs ml-auto ${statusColor}`}>
          {status === 'running' ? '执行中...' : status === 'completed' ? '完成' : status === 'failed' ? '失败' : '等待中'}
        </span>
      </div>

      {/* Input params */}
      {input && Object.keys(input).length > 0 && (
        <div className="px-3 py-2 border-b border-inherit">
          <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="px-3 py-2">
          <pre className={`text-xs overflow-x-auto whitespace-pre-wrap font-mono ${
            status === 'failed' ? 'text-red-300' : 'text-gray-300'
          }`}>
            {result.length > 500 ? result.slice(0, 500) + '...' : result}
          </pre>
        </div>
      )}

      {/* Running indicator */}
      {status === 'running' && (
        <div className="px-3 py-2">
          <span className="typing-cursor text-xs text-blue-400">⏳ 工具执行中...</span>
        </div>
      )}
    </div>
  );
}
