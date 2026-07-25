/**
 * ⚔️ Blade QueryEngine — 核心推理引擎
 *
 * QueryEngine 管理一次对话的完整生命周期。
 * 核心入口 chat() 是 async generator，产出 llmagent 标准 SSE 事件。
 * CLI 和 WebUI 共用同一套引擎，行为 100% 对齐。
 *
 * 核心流程：
 *   1. 构建系统提示词 + 用户消息
 *   2. 调用 Provider 获取流式响应
 *   3. 流式读取文本 → yield token 事件
 *   4. 检测 tool_use → yield tool_use 事件
 *   5. 执行工具 → yield tool_result 事件
 *   6. 将结果送回模型继续（最多 maxToolRounds 轮）
 *   7. 全部完成 → yield done 事件
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { ProviderFactory } from '../providers/factory.js';
import type { ProviderAdapter, BladeMessage, BladeStreamEvent, BladeToolCall, BladeToolDefinition } from '../providers/index.js';
import { ContextManager } from './context-manager.js';
import { ToolExecutor } from './tool-executor.js';
import { classifyError, formatErrorMessage, shouldRetry, getRetryDelay, getRetryConfig } from './error-handler.js';
import type {
  SSEEvent,
  EngineConfig,
  EngineMessage,
  EngineResult,
  ToolDef,
  ToolCall,
  ToolResult,
} from './types.js';

/**
 * 默认系统提示词
 */
const DEFAULT_SYSTEM_PROMPT = `You are Blade, a thin-shell AI engineering agent.

## Core Principles
- Plan first, then act — use natural language to outline steps
- Verify each step — test assumptions, check results
- Report outcomes faithfully — never claim success without verification

## Tool Usage
You have access to tools for file operations, code analysis, shell commands, web search, git operations, and system monitoring.
When you need to perform an action, use the appropriate tool.
After receiving tool results, analyze them and continue your response.

## Communication
- Be concise and technical
- Reference code as \`file_path:line_number\`
- Use Chinese or English based on user's language`;

/**
 * Blade QueryEngine
 *
 * 用法：
 *   const engine = new QueryEngine({ provider: 'deepseek' });
 *   for await (const event of engine.chat('hello')) {
 *     if (event.type === 'token') process.stdout.write(event.content);
 *   }
 */
export class QueryEngine {
  private config: EngineConfig;
  private provider: ProviderAdapter | null = null;
  private contextManager: ContextManager;
  private toolExecutor: ToolExecutor;
  private messages: EngineMessage[] = [];
  private result: EngineResult = { content: '' };

  constructor(config: EngineConfig = {}) {
    this.config = {
      maxToolRounds: 10,
      maxContextTokens: 128000,
      cwd: process.cwd(),
      ...config,
    };
    this.contextManager = new ContextManager(this.config.maxContextTokens);
    this.toolExecutor = new ToolExecutor();
  }

  /**
   * 注册自定义工具
   */
  registerTool(tool: ToolDef): void {
    this.toolExecutor.register(tool);
  }

  /**
   * 获取当前 Provider 实例
   */
  async getProvider(): Promise<ProviderAdapter> {
    if (!this.provider) {
      if (this.config.apiKey || this.config.model || this.config.baseUrl || this.config.provider) {
        this.provider = ProviderFactory.create({
          provider: this.config.provider,
          apiKey: this.config.apiKey,
          model: this.config.model,
          baseUrl: this.config.baseUrl,
        });
      } else {
        this.provider = ProviderFactory.fromEnv();
      }
    }
    return this.provider;
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    const parts: string[] = [];
    parts.push(this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT);
    if (this.config.appendSystemPrompt) {
      parts.push(this.config.appendSystemPrompt);
    }
    return parts.join('\n\n');
  }

  /**
   * 将内部 EngineMessage 转为 provider BladeMessage
   */
  private toBladeMessages(): BladeMessage[] {
    return this.messages.map(m => {
      const blade: BladeMessage = { role: m.role, content: m.content };
      if (m.tool_calls) {
        blade.tool_calls = m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }
      if (m.tool_call_id) {
        blade.tool_call_id = m.tool_call_id;
        blade.name = m.name;
      }
      return blade;
    });
  }

  /**
   * 将 BladeToolCall 转为内部 ToolCall
   */
  private toToolCall(tc: BladeToolCall): ToolCall {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      args = { _raw: tc.function.arguments };
    }
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: args,
    };
  }

  /**
   * 将系统提示词转为消息列表中的 system 角色
   */
  private getSystemMessage(): EngineMessage | null {
    const sysPrompt = this.buildSystemPrompt();
    if (!sysPrompt) return null;
    return { role: 'system', content: sysPrompt };
  }

  /**
   * 核心入口：发送消息并获取 SSE 事件流
   *
   * 返回 llmagent 统一格式事件：
   *   {type:"token",content:"..."}       — 文本片断
   *   {type:"tool_use",name, input}      — 工具调用
   *   {type:"tool_result",content,...}    — 工具执行结果
   *   {type:"done",completeMessage,...}   — 推理完成
   *   {type:"error",error,...}            — 错误
   */
  async *chat(prompt: string): AsyncGenerator<SSEEvent, EngineResult, unknown> {
    // Add user message to history
    this.messages.push({ role: 'user', content: prompt });
    this.result = { content: '' };

    try {
      yield* this.queryLoop();
    } catch (e: any) {
      yield { type: 'error', error: formatErrorMessage(e) } as SSEEvent;
      this.result = { content: `Error: ${e.message}`, stop_reason: 'error' };
    }

    return this.result;
  }

  /**
   * 核心查询循环（支持多轮工具调用）
   */
  private async *queryLoop(): AsyncGenerator<SSEEvent> {
    const provider = await this.getProvider();
    const maxRounds = this.config.maxToolRounds!;
    let round = 0;
    let accumulatedText = '';

    while (round < maxRounds) {
      round++;

      // Compress context if needed
      if (this.contextManager.needsCompaction(this.messages)) {
        this.messages = this.contextManager.compact(this.messages);
      }

      // Build messages for provider
      const bladeMessages = this.buildQueryMessages();

      // Get tool definitions
      const tools = this.toolExecutor.getToolDefinitions();
      const systemPrompt = this.buildSystemPrompt();

      // Stream response from provider
      let toolCalls: BladeToolCall[] | undefined;
      let textContent = '';
      let stopReason: string | undefined;

      try {
        const stream = provider.chatStream(systemPrompt, bladeMessages, tools.length > 0 ? tools : undefined);

        for await (const event of stream) {
          switch (event.type) {
            case 'text':
              textContent += event.text || '';
              accumulatedText += event.text || '';
              yield { type: 'token', content: event.text || '' } as SSEEvent;
              break;

            case 'tool_use':
              if (event.tool_call) {
                toolCalls = [event.tool_call];
              }
              break;

            case 'done':
              stopReason = event.response?.stop_reason;
              break;

            case 'error':
              yield { type: 'error', error: event.error || 'Unknown error', recoverable: false } as SSEEvent;
              break;
          }
        }
      } catch (e: any) {
        // Error handling with retry
        const handled = await this.handleError(e, round);
        if (handled) {
          // Retry this round
          round--; // Don't count retry as a round
          continue;
        }
        throw e;
      }

      // Add assistant message to history
      const assistantMsg: EngineMessage = { role: 'assistant', content: textContent };

      if (toolCalls && toolCalls.length > 0) {
        const calls = toolCalls.map(tc => this.toToolCall(tc));
        assistantMsg.tool_calls = calls;
        this.messages.push(assistantMsg);

        // Yield tool_use events
        for (const call of calls) {
          yield { type: 'tool_use', name: call.name, input: call.arguments, id: call.id } as SSEEvent;
        }

        // Execute tools
        const toolInputs = calls.map(c => ({ name: c.name, input: c.arguments, id: c.id }));
        const toolResults = await this.toolExecutor.executeChain(toolInputs);

        // Add tool results to messages and yield events
        for (const call of calls) {
          const result = toolResults.get(call.id);
          if (result) {
            this.messages.push({
              role: 'tool',
              content: result.content,
              tool_call_id: call.id,
              name: call.name,
            });
            yield {
              type: 'tool_result',
              content: result.content,
              name: call.name,
              tool_use_id: call.id,
              is_error: result.is_error,
            } as SSEEvent;
          }
        }
      } else {
        // No tool calls — done
        this.messages.push(assistantMsg);
        this.result = { content: accumulatedText, stop_reason: stopReason };
        console.log('full answer:', accumulatedText);

        yield { type: 'done', completeMessage: accumulatedText, stop_reason: stopReason } as SSEEvent;
        return;
      }
    }

    // Max rounds reached
    this.result = { content: accumulatedText, stop_reason: 'max_turns' };
    yield { type: 'done', completeMessage: accumulatedText, stop_reason: 'max_turns' } as SSEEvent;
  }

  /**
   * 构建查询消息列表（带系统消息）
   */
  private buildQueryMessages(): BladeMessage[] {
    const result: BladeMessage[] = [];

    // Only add system message if it's not already in messages
    const hasSystem = this.messages.some(m => m.role === 'system');
    if (!hasSystem) {
      const sysMsg = this.getSystemMessage();
      if (sysMsg) {
        result.push({ role: 'system', content: sysMsg.content });
      }
    }

    result.push(...this.toBladeMessages());
    return result;
  }

  /**
   * 错误处理与重试
   */
  private async handleError(error: unknown, attempt: number): Promise<boolean> {
    if (!shouldRetry(error)) return false;

    const category = classifyError(error);
    const config = getRetryConfig(category);

    if (attempt >= config.maxRetries) return false;

    const delay = getRetryDelay(attempt, config);
    await new Promise(resolve => setTimeout(resolve, delay));

    return true;
  }

  /**
   * 获取对话历史
   */
  getMessages(): readonly EngineMessage[] {
    return this.messages;
  }

  /**
   * 获取引擎结果
   */
  getResult(): EngineResult {
    return this.result;
  }

  /**
   * 获取上下文统计
   */
  getContextStats() {
    return this.contextManager.getStats(this.messages);
  }

  /**
   * 重置会话
   */
  reset(): void {
    this.messages = [];
    this.contextManager.reset();
    this.result = { content: '' };
  }
}
