/**
 * ⚔️ LogStore — 神经单元日志系统
 *
 * 记录前端每一个 SSE 事件、状态变化、工具调用、错误。
 * 可与服务端日志合并，完整还原 AI 工作过程。
 */

import { create } from 'zustand';

export interface LogEvent {
  id: number;
  ts: string;
  type: 'sse' | 'state' | 'tool' | 'error' | 'ui' | 'api';
  message: string;
  detail?: string;
  duration?: number;
}

interface LogState {
  events: LogEvent[];
  maxLogs: number;
  addLog: (type: LogEvent['type'], message: string, detail?: string, duration?: number) => void;
  clearLogs: () => void;
  getLogsText: () => string;
}

let logCounter = 0;

export const useLogStore = create<LogState>((set, get) => ({
  events: [],
  maxLogs: 2000,

  addLog: (type, message, detail, duration) => {
    const event: LogEvent = {
      id: ++logCounter,
      ts: new Date().toISOString(),
      type,
      message,
      detail: detail ? detail.slice(0, 500) : undefined,
      duration,
    };
    set(state => {
      const events = [...state.events, event];
      if (events.length > state.maxLogs) events.splice(0, events.length - state.maxLogs);
      return { events };
    });
  },

  clearLogs: () => set({ events: [] }),

  getLogsText: () => {
    return get().events.map(e => {
      const time = e.ts.slice(11, 23);
      const dur = e.duration ? ` [+${e.duration}ms]` : '';
      const det = e.detail ? ` | ${e.detail}` : '';
      return `[${time}][${e.type.toUpperCase()}]${dur} ${e.message}${det}`;
    }).join('\n');
  },
}));
