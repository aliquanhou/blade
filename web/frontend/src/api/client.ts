/**
 * ⚔️ Blade API Client
 *
 * 纯 fetch 实现，无外部依赖。
 * SSE 解析 llmagent 统一规范。
 */

import type { HealthStatus, Tool, FileEntry, ChatRequest, SSEEvent } from '../types';

const BASE_URL = '/api';

export const bladeApi = {
  health: async (): Promise<HealthStatus> => {
    const resp = await fetch(`${BASE_URL}/health`);
    return resp.json();
  },

  tools: async (): Promise<Tool[]> => {
    const resp = await fetch(`${BASE_URL}/tools`);
    const data = await resp.json();
    return data.tools || [];
  },

  files: async (path?: string): Promise<{ path: string; entries: FileEntry[] }> => {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    const resp = await fetch(`${BASE_URL}/files${params}`);
    return resp.json();
  },

  readFile: async (path: string): Promise<{ path: string; content: string; size: number }> => {
    const resp = await fetch(`${BASE_URL}/files/${encodeURIComponent(path)}`);
    return resp.json();
  },

  saveFile: async (path: string, content: string): Promise<void> => {
    await fetch(`${BASE_URL}/files/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
  },

  executeTool: async (name: string, params: Record<string, any>) => {
    const resp = await fetch(`${BASE_URL}/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, params }),
    });
    return resp.json();
  },

  saveSettings: async (settings: { provider?: string; model?: string; apiKey?: string }) => {
    await fetch(`${BASE_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },

  sessions: async () => {
    const resp = await fetch(`${BASE_URL}/sessions`);
    const data = await resp.json();
    return data.sessions || [];
  },

  createSession: async () => {
    const resp = await fetch(`${BASE_URL}/sessions`, { method: 'POST' });
    return resp.json();
  },

  deleteSession: async (id: string) => {
    await fetch(`${BASE_URL}/sessions/${id}`, { method: 'DELETE' });
  },

  getSessionMessages: async (id: string): Promise<{ messages: any[]; sessionId: string }> => {
    const resp = await fetch(`${BASE_URL}/sessions/${id}/messages`);
    return resp.json();
  },

  /**
   * SSE 流式聊天 — 解析 llmagent 统一格式
   *
   * 事件类型：
   *   token       → onToken(content)
   *   tool_use    → onToolUse(name, input)
   *   tool_result → onToolResult(content, name, isError)
   *   done        → onDone(completeMessage)
   *   error       → onError(message)
   */
  chatStream: async (
    req: ChatRequest,
    callbacks: {
      onToken: (text: string) => void;
      onToolUse: (name: string, input: Record<string, unknown>) => void;
      onToolResult: (content: string, name?: string, isError?: boolean) => void;
      onDone: (message?: string) => void;
      onError: (err: string) => void;
    },
  ): Promise<void> => {
    const { onToken, onToolUse, onToolResult, onDone, onError } = callbacks;

    const response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      onError(`HTTP ${response.status}`);
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const event: SSEEvent = JSON.parse(trimmed.slice(6));

          switch (event.type) {
            case 'token':
              onToken(event.content || '');
              break;
            case 'tool_use':
              onToolUse(event.name, event.input || {});
              break;
            case 'tool_result':
              onToolResult(event.content, event.name, event.is_error);
              break;
            case 'done':
              onDone(event.completeMessage);
              break;
            case 'error':
              onError(event.error || 'Unknown error');
              break;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  },
};
