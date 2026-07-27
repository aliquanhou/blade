/**
 * ⚔️ LogPanel — 神经单元日志查看器
 *
 * 实时显示 AI 工作日志，支持按类型过滤、复制导出。
 * 记录每一条 SSE 事件、工具调用、错误和状态变化。
 */

import { useEffect, useRef, useState } from 'react';
import { useLogStore, type LogEvent } from '../../stores/logStore';

type LogFilter = 'all' | 'sse' | 'tool' | 'error' | 'api' | 'state';

const FILTER_LABELS: Record<LogFilter, string> = {
  all: '全部',
  sse: 'SSE',
  tool: '工具',
  error: '错误',
  api: 'API',
  state: '状态',
};

const TYPE_COLORS: Record<string, string> = {
  sse: 'text-blue-300',
  tool: 'text-purple-300',
  error: 'text-red-300',
  api: 'text-green-300',
  state: 'text-yellow-300',
  ui: 'text-gray-300',
};

export function LogPanel() {
  const { events, clearLogs, getLogsText } = useLogStore();
  const [filter, setFilter] = useState<LogFilter>('error');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const handleCopy = async () => {
    const text = getLogsText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full text-xs font-mono">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-700 bg-gray-900/50 shrink-0 flex-wrap">
        {(Object.entries(FILTER_LABELS) as [LogFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-2 py-0.5 rounded text-[10px] ${filter === key ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[10px] text-gray-600 mr-1">{filtered.length}</span>
        <button onClick={handleCopy} className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-white hover:bg-gray-700" title="复制日志">
          {copied ? '✅' : '📋'}
        </button>
        <button onClick={clearLogs} className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-white hover:bg-gray-700" title="清空">🗑️</button>
        <button onClick={() => setAutoScroll(!autoScroll)} className={`px-1.5 py-0.5 rounded text-[10px] ${autoScroll ? 'text-blue-400' : 'text-gray-500'} hover:bg-gray-700`} title="自动滚动">
          {autoScroll ? '🔽' : '⏸️'}
        </button>
      </div>

      {/* Log list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-1 space-y-0.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <span className="text-lg mb-1">📡</span>
            <span className="text-[10px]">等待日志...</span>
          </div>
        ) : (
          filtered.map(e => (
            <LogRow key={e.id} event={e} />
          ))
        )}
      </div>
    </div>
  );
}

function LogRow({ event }: { event: LogEvent }) {
  const [expanded, setExpanded] = useState(false);
  const time = event.ts.slice(11, 23);
  const dur = event.duration ? `[+${event.duration}ms]` : '';

  return (
    <div
      className={`rounded px-1.5 py-0.5 cursor-pointer hover:bg-gray-800/50 ${event.type === 'error' ? 'bg-red-950/20' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-gray-600 shrink-0">{time}</span>
        <span className={`text-[9px] uppercase font-bold shrink-0 ${TYPE_COLORS[event.type] || 'text-gray-400'}`}>
          [{event.type}]
        </span>
        {dur && <span className="text-[9px] text-yellow-600 shrink-0">{dur}</span>}
        <span className="text-gray-200 truncate">{event.message}</span>
      </div>
      {expanded && event.detail && (
        <pre className="mt-0.5 pl-2 text-[9px] text-gray-500 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto border-l border-gray-700">
          {event.detail}
        </pre>
      )}
    </div>
  );
}
