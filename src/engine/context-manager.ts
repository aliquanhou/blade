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
   * 压缩上下文：只保留最近 N 轮对话，丢弃历史 tool_result 细节
   */
  compact(messages: EngineMessage[]): EngineMessage[] {
    if (messages.length <= 4) return messages;

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    if (nonSystemMessages.length <= 6) return messages;

    // 只保留最近 6 条非系统消息（约 2-3 轮工具调用）
    const recentMessages = nonSystemMessages.slice(-6).map(m => {
      // 对 tool_result 消息：截断内容，只保留摘要
      if (m.role === 'tool' && m.content && m.content.length > 200) {
        return { ...m, content: m.content.slice(0, 200) + '...[truncated]' };
      }
      return m;
    });

    const firstUser = nonSystemMessages.find(m => m.role === 'user');

    const compacted: EngineMessage[] = [...systemMessages];

    compacted.push({
      role: 'system',
      content: `[上下文已压缩：保留最近 ${recentMessages.length} 条消息，历史 tool_result 已截断。]`,
    });

    // 保留第一条用户消息作为上下文锚点
    if (firstUser && !recentMessages.includes(firstUser)) {
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
