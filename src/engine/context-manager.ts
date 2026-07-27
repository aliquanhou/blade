/**
 * ⚔️ Blade Engine — Context Manager
 *
 * Token 追踪、上下文窗口管理、自动压缩。
 * 防止对话无限膨胀。
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import type { EngineMessage } from './types.js';

// Rough token estimation: ~4 chars per token for CJK, ~1 token per 4 chars for English
// This is a simplified approximation
const CHARS_PER_TOKEN = 4;

export interface ContextStats {
  totalTokens: number;
  messageCount: number;
  isCompacted: boolean;
}

export class ContextManager {
  private maxTokens: number;
  private _isCompacted = false;
  private tokenHistory: number[] = [];

  constructor(maxTokens = 128000) {
    this.maxTokens = maxTokens;
  }

  /**
   * 估算文本的 token 数量（简化版）
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * 估算消息列表的总 token 数
   */
  estimateMessagesTokens(messages: EngineMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateTokens(msg.content);
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += this.estimateTokens(JSON.stringify(tc.arguments));
        }
      }
    }
    return total;
  }

  /**
   * 追踪 token 用量
   */
  trackTokens(inputTokens: number, outputTokens: number): void {
    this.tokenHistory.push(inputTokens + outputTokens);
    // Keep only last 100 entries
    if (this.tokenHistory.length > 100) {
      this.tokenHistory.shift();
    }
  }

  /**
   * 判断是否需要压缩上下文
   * 阈值设低（25%），在多轮工具调用中尽早压缩，防止 API 变慢
   */
  needsCompaction(messages: EngineMessage[]): boolean {
    const total = this.estimateMessagesTokens(messages);
    return total > this.maxTokens * 0.25; // 25% threshold — 尽早压缩，保持 API 响应速度
  }

  /**
   * 压缩上下文：只保留最近几轮完整对话，保证 tool 消息不 orphan
   *
   * DeepSeek API 严格要求：每个 tool 角色消息前面必须有
   * 对应的 assistant 消息且带有 tool_calls。压缩时不能拆散
   * tool_calls ↔ tool_result 配对。
   */
  compact(messages: EngineMessage[]): EngineMessage[] {
    if (messages.length <= 4) return messages;

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    if (nonSystemMessages.length <= 6) return messages;

    // 从后往前扫描，收集完整的对话轮次
    // 一轮 = [user, assistant(可能含 tool_calls), tool*]
    const recentMessages: EngineMessage[] = [];
    const maxRounds = 2; // 保留最近 2 轮
    let roundCount = 0;
    let i = nonSystemMessages.length - 1;

    while (i >= 0 && roundCount < maxRounds) {
      // 收集 tool 结果（从后往前）
      const batch: EngineMessage[] = [];
      while (i >= 0 && nonSystemMessages[i].role === 'tool') {
        if (nonSystemMessages[i].content && nonSystemMessages[i].content.length > 200) {
          batch.unshift({ ...nonSystemMessages[i], content: nonSystemMessages[i].content.slice(0, 200) + '...[truncated]' });
        } else {
          batch.unshift(nonSystemMessages[i]);
        }
        i--;
      }

      // 收集 assistant（含 tool_calls）
      if (i >= 0 && nonSystemMessages[i].role === 'assistant') {
        batch.unshift({ ...nonSystemMessages[i] });
        i--;
      }

      // 收集 user
      if (i >= 0 && nonSystemMessages[i].role === 'user') {
        batch.unshift({ ...nonSystemMessages[i] });
        i--;
      }

      // 只有完整的轮次（有 user 消息）才保留
      if (batch.length > 0 && batch[0]?.role === 'user') {
        recentMessages.unshift(...batch);
        roundCount++;
      } else {
        // 不完整的轮次（如只有 tool 结果没有 assistant）— 丢弃
        break;
      }
    }

    const firstUser = nonSystemMessages.find(m => m.role === 'user');

    const compacted: EngineMessage[] = [...systemMessages];

    compacted.push({
      role: 'system',
      content: `[上下文已压缩：保留最近 ${recentMessages.length} 条消息，共 ${nonSystemMessages.length - recentMessages.length} 条已移除。]`,
    });

    // 保留第一条用户消息作为上下文锚点
    let hasFirstUser = false;
    for (const m of recentMessages) {
      if (m === firstUser || m.role === 'user') { hasFirstUser = true; break; }
    }
    if (firstUser && !hasFirstUser) {
      compacted.push(firstUser);
    }

    compacted.push(...recentMessages);
    this._isCompacted = true;

    return compacted;
  }

  /**
   * 获取上下文统计信息
   */
  getStats(messages: EngineMessage[]): ContextStats {
    return {
      totalTokens: this.estimateMessagesTokens(messages),
      messageCount: messages.length,
      isCompacted: this._isCompacted,
    };
  }

  /**
   * 上下文是否已被压缩
   */
  get isCompacted(): boolean {
    return this._isCompacted;
  }

  /**
   * 重置压缩状态
   */
  reset(): void {
    this._isCompacted = false;
  }

  /**
   * 获取平均 token 消耗
   */
  getAverageTokenUsage(): number {
    if (this.tokenHistory.length === 0) return 0;
    const sum = this.tokenHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.tokenHistory.length);
  }
}
