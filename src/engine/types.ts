/**
 * ⚔️ Blade Engine — Core Types
 *
 * llmagent 统一 SSE 规范 + 引擎内部类型。
 * 所有模块（CLI、WebUI）共用同一套类型定义。
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

// ============================================================
// SSE 事件格式（llmagent 统一规范）
// 前端、CLI 解析同一套 JSON，不各自定制格式。
// ============================================================

/**
 * 文本片断 — 流式输出的文本块
 */
export interface TokenEvent {
  type: 'token';
  content: string;
}

/**
 * 工具调用 — 模型请求执行工具
 */
export interface ToolUseEvent {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
  id?: string;
}

/**
 * 工具结果 — 工具执行完成
 */
export interface ToolResultEvent {
  type: 'tool_result';
  content: string;
  name?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

/**
 * 完成 — 推理全部结束
 */
export interface DoneEvent {
  type: 'done';
  completeMessage?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * 错误事件
 */
export interface ErrorEvent {
  type: 'error';
  error: string;
  recoverable?: boolean;
}

/**
 * llmagent 标准 SSE 事件联合类型
 */
export type SSEEvent = TokenEvent | ToolUseEvent | ToolResultEvent | DoneEvent | ErrorEvent;

// ============================================================
// 引擎内部消息类型
// ============================================================

export interface EngineMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
  name?: string;
}

// ============================================================
// 引擎配置
// ============================================================

export interface EngineConfig {
  /** Provider 名称 */
  provider?: string;
  /** 模型名称 */
  model?: string;
  /** API Key */
  apiKey?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 系统提示词（覆盖默认） */
  systemPrompt?: string;
  /** 追加系统提示词 */
  appendSystemPrompt?: string;
  /** 最多工具调用轮次 */
  maxToolRounds?: number;
  /** 上下文窗口最大 token 数 */
  maxContextTokens?: number;
  /** 是否启用流式输出 */
  stream?: boolean;
  /** 工作目录 */
  cwd?: string;
  /** 会话 ID（用于隔离多会话） */
  sessionId?: string;
  /** 是否输出调试日志 */
  debug?: boolean;
}

// ============================================================
// 工具定义
// ============================================================

export interface ToolDef {
  name: string;
  description: string;
  category: ToolCategory;
  /** 是否并发安全（只读工具可以并行执行） */
  isConcurrencySafe?: boolean;
  /** 执行函数 */
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
  /** 参数 schema */
  inputSchema?: Record<string, unknown>;
}

export type ToolCategory = 'file' | 'code' | 'shell' | 'web' | 'git' | 'system';

// ============================================================
// 引擎结果
// ============================================================

export interface EngineResult {
  content: string;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  tool_calls?: ToolCall[];
}
