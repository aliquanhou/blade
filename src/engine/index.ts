/**
 * ⚔️ Blade Engine — 统一导出
 *
 * 所有引擎模块从这里导出。
 * CLI 和 WebUI 均通过此入口使用引擎。
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

export { QueryEngine } from './QueryEngine.js';
export { ContextManager } from './context-manager.js';
export { ToolExecutor, BUILTIN_TOOLS } from './tool-executor.js';
export { classifyError, shouldRetry, formatErrorMessage } from './error-handler.js';

export type {
  SSEEvent,
  TokenEvent,
  ToolUseEvent,
  ToolResultEvent,
  DoneEvent,
  ErrorEvent,
  EngineMessage,
  EngineConfig,
  ToolDef,
  ToolCategory,
  ToolCall,
  ToolResult,
  EngineResult,
} from './types.js';
