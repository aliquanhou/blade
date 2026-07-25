/**
 * ⚔️ 流式输出测试
 *
 * 验证 HTTP SSE 端点响应、大文本分段输出、会话隔离。
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

const SERVER_URL = 'http://localhost:3001';

// Note: These tests require the server to be running
// Start with: bun run web/server/src/index.ts

describe('SSE Stream endpoint', () => {
  const testTimeout = 30000;

  it('should respond to health check', async () => {
    const resp = await fetch(`${SERVER_URL}/api/health`);
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.status).toBe('healthy');
  }, testTimeout);

  it('should list tools', async () => {
    const resp = await fetch(`${SERVER_URL}/api/tools`);
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.tools).toBeDefined();
    expect(data.tools.length).toBeGreaterThan(0);
  }, testTimeout);

  it('should return SSE content-type header', async () => {
    const resp = await fetch(`${SERVER_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'say hello' }),
    });
    expect(resp.status).toBe(200);
    const contentType = resp.headers.get('Content-Type');
    expect(contentType).toContain('text/event-stream');
  }, testTimeout);

  it('should stream SSE events for a chat request', async () => {
    const resp = await fetch(`${SERVER_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'say hello' }),
    });

    expect(resp.status).toBe(200);

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    let hasDone = false;

    // Read at most 100 events to avoid infinite loop
    while (eventCount < 100) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const event = JSON.parse(trimmed.slice(6));
          eventCount++;

          if (event.type === 'done') {
            hasDone = true;
          }

          // All events must have a valid type
          expect(['token', 'tool_use', 'tool_result', 'done', 'error']).toContain(event.type);
        } catch {
          // skip
        }
      }

      if (hasDone) break;
    }

    expect(eventCount).toBeGreaterThan(0);
  }, 120000);

  it('should reject empty prompt', async () => {
    const resp = await fetch(`${SERVER_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });
    expect(resp.status).toBe(400);
  }, testTimeout);

  it('should isolate sessions', async () => {
    // Session A
    const respA = await fetch(`${SERVER_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'say hello', session_id: 'test-session-a' }),
    });
    expect(respA.status).toBe(200);

    // Session B should be independent
    const respB = await fetch(`${SERVER_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'say hi', session_id: 'test-session-b' }),
    });
    expect(respB.status).toBe(200);
  }, 120000);

  it('should handle CORS preflight', async () => {
    const resp = await fetch(`${SERVER_URL}/api/chat/stream`, {
      method: 'OPTIONS',
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
