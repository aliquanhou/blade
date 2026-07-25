/**
 * ⚔️ 上下文压缩测试
 *
 * 验证 ContextManager 的 token 追踪和自动压缩逻辑。
 */

import { describe, it, expect } from 'bun:test';
import { ContextManager } from '../../src/engine/context-manager.js';
import type { EngineMessage } from '../../src/engine/types.js';

describe('ContextManager', () => {
  it('should estimate tokens correctly', () => {
    const cm = new ContextManager();
    expect(cm.estimateTokens('hello world')).toBeGreaterThan(0);
    expect(cm.estimateTokens('')).toBe(0);
    expect(cm.estimateTokens('你好世界')).toBeGreaterThan(0);
  });

  it('should estimate messages tokens', () => {
    const cm = new ContextManager();
    const messages: EngineMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const stats = cm.getStats(messages);
    expect(stats.messageCount).toBe(2);
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it('should not compact short conversations', () => {
    const cm = new ContextManager();
    const messages: EngineMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    const compacted = cm.compact(messages);
    expect(compacted.length).toBe(3);
  });

  it('should compact long conversations', () => {
    const cm = new ContextManager(100); // Very small limit

    // Build a conversation that exceeds the limit
    const messages: EngineMessage[] = [
      { role: 'system', content: 'System prompt' },
    ];

    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'user', content: `User message ${i} `.repeat(20) });
      messages.push({ role: 'assistant', content: `Assistant response ${i} `.repeat(20) });
    }

    expect(cm.needsCompaction(messages)).toBe(true);
    const compacted = cm.compact(messages);
    expect(compacted.length).toBeLessThan(messages.length);
    expect(cm.isCompacted).toBe(true);
  });

  it('should keep system messages during compaction', () => {
    const cm = new ContextManager(50);
    const messages: EngineMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    // Add many messages to trigger compaction
    for (let i = 0; i < 15; i++) {
      messages.push({ role: 'user', content: `Message ${i} `.repeat(30) });
      messages.push({ role: 'assistant', content: `Response ${i} `.repeat(30) });
    }

    const compacted = cm.compact(messages);
    const hasSystem = compacted.some(m => m.role === 'system');
    expect(hasSystem).toBe(true);
  });

  it('should track token usage history', () => {
    const cm = new ContextManager();
    cm.trackTokens(100, 50);
    cm.trackTokens(200, 80);

    expect(cm.getAverageTokenUsage()).toBeGreaterThan(0);
  });

  it('should reset compaction state', () => {
    const cm = new ContextManager(100);
    const messages: EngineMessage[] = [
      { role: 'system', content: 'sys' },
    ];
    for (let i = 0; i < 12; i++) {
      messages.push({ role: 'user', content: 'message '.repeat(20) });
      messages.push({ role: 'assistant', content: 'response '.repeat(20) });
    }

    cm.compact(messages);
    expect(cm.isCompacted).toBe(true);

    cm.reset();
    expect(cm.isCompacted).toBe(false);
  });
});
