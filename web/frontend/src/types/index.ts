/**
 * ⚔️ Blade Frontend Types
 *
 * llmagent 统一 SSE 规范 — 与引擎层输出完全一致。
 * 前端、CLI 解析同一套 JSON 结构。
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  toolResults?: ToolResultInfo[];
}

export interface ToolCallInfo {
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export interface ToolResultInfo {
  name: string;
  content: string;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  category: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  provider: string;
  model: string;
}

export interface ChatRequest {
  prompt: string;
  system_prompt?: string;
  session_id?: string;
}

// llmagent 统一 SSE 规范 — 4 种标准事件 + error
export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown>; id?: string }
  | { type: 'tool_result'; content: string; name?: string; tool_use_id?: string; is_error?: boolean }
  | { type: 'done'; completeMessage?: string; stop_reason?: string }
  | { type: 'error'; error: string; recoverable?: boolean };
