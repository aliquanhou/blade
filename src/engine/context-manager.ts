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
   */
  needsCompaction(messages: EngineMessage[]): boolean {
    const total = this.estimateMessagesTokens(messages);
    return total > this.maxTokens * 0.8; // 80% threshold
  }

  /**
   * 压缩上下文字：移除早期非关键消息，保留最近的对话
   */
  compact(messages: EngineMessage[]): EngineMessage[] {
    if (messages.length <= 4) return messages; // Too short to compact

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    if (nonSystemMessages.length <= 4) return messages;

    // Keep system messages + first user message (for context) + last N messages
    const keepRatio = 0.6;
    const keepCount = Math.max(
      4,
      Math.floor(nonSystemMessages.length * keepRatio),
    );

    const firstUser = nonSystemMessages.find(m => m.role === 'user');

    const recentMessages = nonSystemMessages.slice(-keepCount);

    const compacted: EngineMessage[] = [
      ...systemMessages,
    ];

    // Keep first user message if it's not already in recent
    if (firstUser && !recentMessages.includes(firstUser)) {
      compacted.push({
        role: 'system',
        content: `[早期对话已压缩，共 ${nonSystemMessages.length - keepCount} 条消息被摘要。当前保留最近 ${keepCount} 条消息。]`,
      });
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
