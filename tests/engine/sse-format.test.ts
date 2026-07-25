/**
 * ⚔️ SSE 格式测试（llmagent 统一规范）
 *
 * 验证所有 SSE 事件类型符合标准格式。
 * 前端、CLI、引擎三方对同一套格式的一致性保证。
 */

import { describe, it, expect } from 'bun:test';
import type { SSEEvent, TokenEvent, ToolUseEvent, ToolResultEvent, DoneEvent, ErrorEvent } from '../../src/engine/types.js';

// 用于验证格式的辅助函数
function isValidTokenEvent(e: SSEEvent): e is TokenEvent {
  return e.type === 'token' && typeof e.content === 'string';
}

function isValidToolUseEvent(e: SSEEvent): e is ToolUseEvent {
  return e.type === 'tool_use' && typeof e.name === 'string' && typeof e.input === 'object';
}

function isValidToolResultEvent(e: SSEEvent): e is ToolResultEvent {
  return e.type === 'tool_result' && typeof e.content === 'string';
}

function isValidDoneEvent(e: SSEEvent): e is DoneEvent {
  return e.type === 'done';
}

function isValidErrorEvent(e: SSEEvent): e is ErrorEvent {
  return e.type === 'error' && typeof e.error === 'string';
}

describe('SSEEvent format (llmagent spec)', () => {
  it('token event must have type="token" and content string', () => {
    const event: SSEEvent = { type: 'token', content: 'Hello world' };
    expect(isValidTokenEvent(event)).toBe(true);
    expect(event.content.length).toBeGreaterThan(0);
  });

  it('token event can have empty content', () => {
    const event: SSEEvent = { type: 'token', content: '' };
    expect(isValidTokenEvent(event)).toBe(true);
  });

  it('tool_use event must have name and input', () => {
    const event: SSEEvent = {
      type: 'tool_use',
      name: 'readFile',
      input: { path: './index.ts' },
    };
    expect(isValidToolUseEvent(event)).toBe(true);
    expect(event.name).toBe('readFile');
    expect(event.input.path).toBe('./index.ts');
  });

  it('tool_use event can have optional id', () => {
    const event: SSEEvent = {
      type: 'tool_use',
      name: 'readFile',
      input: {},
      id: 'toolu_abc123',
    };
    expect(isValidToolUseEvent(event)).toBe(true);
    expect(event.id).toBe('toolu_abc123');
  });

  it('tool_use event must parse from JSON correctly', () => {
    const json = JSON.stringify({
      type: 'tool_use',
      name: 'grep_search',
      input: { pattern: 'test', path: '.' },
    });
    const parsed: SSEEvent = JSON.parse(json);
    expect(isValidToolUseEvent(parsed)).toBe(true);
    expect(parsed.name).toBe('grep_search');
    expect(parsed.input.pattern).toBe('test');
  });

  it('tool_result event must have content string', () => {
    const event: SSEEvent = {
      type: 'tool_result',
      content: 'File contents here',
    };
    expect(isValidToolResultEvent(event)).toBe(true);
  });

  it('tool_result event can have name, tool_use_id, is_error', () => {
    const event: SSEEvent = {
      type: 'tool_result',
      content: 'Error: file not found',
      name: 'readFile',
      tool_use_id: 'toolu_abc123',
      is_error: true,
    };
    expect(isValidToolResultEvent(event)).toBe(true);
    expect(event.name).toBe('readFile');
    expect(event.is_error).toBe(true);
  });

  it('done event must have type="done"', () => {
    const event: SSEEvent = { type: 'done' };
    expect(isValidDoneEvent(event)).toBe(true);
  });

  it('done event can have completeMessage', () => {
    const event: SSEEvent = {
      type: 'done',
      completeMessage: 'Here is the final answer...',
    };
    expect(isValidDoneEvent(event)).toBe(true);
    expect(event.completeMessage!.length).toBeGreaterThan(0);
  });

  it('done event can have stop_reason and usage', () => {
    const event: SSEEvent = {
      type: 'done',
      completeMessage: 'Done',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    expect(isValidDoneEvent(event)).toBe(true);
    expect(event.stop_reason).toBe('end_turn');
    expect(event.usage?.input_tokens).toBe(100);
  });

  it('error event must have type="error" and error string', () => {
    const event: SSEEvent = { type: 'error', error: 'API connection failed' };
    expect(isValidErrorEvent(event)).toBe(true);
  });

  it('error event can have recoverable flag', () => {
    const event: SSEEvent = {
      type: 'error',
      error: 'Rate limited',
      recoverable: true,
    };
    expect(isValidErrorEvent(event)).toBe(true);
    expect(event.recoverable).toBe(true);
  });

  it('all event types must be JSON-serializable', () => {
    const events: SSEEvent[] = [
      { type: 'token', content: 'hello' },
      { type: 'tool_use', name: 'readFile', input: { path: '/test' } },
      { type: 'tool_result', content: 'result', name: 'readFile' },
      { type: 'done', completeMessage: 'done' },
      { type: 'error', error: 'error' },
    ];

    for (const event of events) {
      const json = JSON.stringify(event);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe(event.type);
    }
  });

  it('SSE wire format should be data: <json>\\n\\n', () => {
    const event: SSEEvent = { type: 'token', content: 'test' };
    const sseLine = `data: ${JSON.stringify(event)}\n\n`;
    expect(sseLine).toContain('data: {');
    expect(sseLine).toContain('"type":"token"');
    expect(sseLine).toContain('"content":"test"');
    expect(sseLine.endsWith('\n\n')).toBe(true);
  });

  it('frontend can parse SSE line', () => {
    const sseLine = 'data: {"type":"token","content":"hello world"}\n\n';
    const match = sseLine.trim().match(/^data: (.+)$/);
    expect(match).not.toBeNull();
    const parsed: SSEEvent = JSON.parse(match![1]);
    expect(isValidTokenEvent(parsed)).toBe(true);
    expect(parsed.content).toBe('hello world');
  });
});
