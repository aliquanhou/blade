import axios from 'axios';
import type { HealthStatus, Tool, FileEntry, SSEEvent, ChatRequest } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const bladeApi = {
  health: async (): Promise<HealthStatus> => {
    const { data } = await api.get('/health');
    return data;
  },

  tools: async (): Promise<Tool[]> => {
    const { data } = await api.get('/tools');
    return data.tools;
  },

  files: async (path?: string): Promise<{ path: string; entries: FileEntry[] }> => {
    const { data } = await api.get('/files', { params: { path } });
    return data;
  },

  readFile: async (path: string): Promise<{ path: string; content: string; size: number }> => {
    const { data } = await api.get(`/files/${encodeURIComponent(path)}`);
    return data;
  },

  saveFile: async (path: string, content: string): Promise<void> => {
    await api.put(`/files/${encodeURIComponent(path)}`, { path, content });
  },

  executeTool: async (name: string, params: Record<string, any>) => {
    const { data } = await api.post('/tools/execute', { name, params });
    return data;
  },

  saveSettings: async (settings: { provider?: string; model?: string; apiKey?: string }) => {
    await api.post('/settings', settings);
  },

  sessions: async () => {
    const { data } = await api.get('/sessions');
    return data.sessions;
  },

  createSession: async () => {
    const { data } = await api.post('/sessions');
    return data;
  },

  deleteSession: async (id: string) => {
    await api.delete(`/sessions/${id}`);
  },

  chatStream: async (
    req: ChatRequest,
    onToken: (text: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ): Promise<void> => {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!response.ok) { onError(`HTTP ${response.status}`); return; }
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
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        try {
          const event: SSEEvent = JSON.parse(t.slice(6));
          switch (event.type) {
            case 'token': onToken(event.text || ''); break;
            case 'done': onDone(); break;
            case 'error': onError(event.error || 'Unknown error'); break;
          }
        } catch { /* skip */ }
      }
    }
  },
};
