/**
 * ⚔️ Provider Adapter Tests
 *
 * Tests each provider adapter's format conversion, message handling,
 * and error handling. Uses mock HTTP responses.
 *
 * Run: bun test tests/providers.test.ts
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { describe, it, expect, mock, afterAll } from 'bun:test';
import { DeepSeekProvider } from '../src/providers/deepseek.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { OllamaProvider } from '../src/providers/ollama.js';
import { ProviderFactory } from '../src/providers/factory.js';

// ============================================================
// Mock fetch
// ============================================================

const mockFetch = mock();
const originalFetch = globalThis.fetch;
globalThis.fetch = mockFetch;

function resetMock() {
  mockFetch.mockClear();
}

function setupMockResponse(status: number, body: unknown) {
  resetMock();
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function setupMockStream(chunks: string[]) {
  resetMock();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  mockFetch.mockResolvedValue(
    new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
}

// ============================================================
// Tests
// ============================================================

describe('DeepSeek Provider', () => {
  it('should create instance with defaults', () => {
    const p = new DeepSeekProvider('test-key');
    expect(p.name).toBe('deepseek');
    expect(p.displayName).toBe('DeepSeek');
    expect(p.getModel()).toBe('deepseek-v4-flash');
  });

  it('should send chat request with correct format', async () => {
    setupMockResponse(200, {
      id: 'chat-1',
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Hello from DeepSeek!' },
      }],
      usage: { prompt_tokens: 10, output_tokens: 5 },
    });

    const p = new DeepSeekProvider('test-key');
    const result = await p.chat('Be helpful', [{ role: 'user', content: 'Hi' }]);

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const callArgs = lastCall[1] as RequestInit;
    const body = JSON.parse(callArgs.body as string);

    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('Be helpful');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('Hi');
    expect(body.stream).toBeUndefined();
    expect(result.content).toBe('Hello from DeepSeek!');
    expect(result.stop_reason).toBe('stop');
    expect(result.usage?.input_tokens).toBe(10);
  });

  it('should handle tool calls', async () => {
    setupMockResponse(200, {
      id: 'chat-2',
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"test.txt"}' },
          }],
        },
      }],
      usage: { prompt_tokens: 20, output_tokens: 15 },
    });

    const p = new DeepSeekProvider('test-key');
    const result = await p.chat('Be helpful', [{ role: 'user', content: 'Read file' }], [
      { name: 'read_file', description: 'Read a file', input_schema: { type: 'object', properties: { path: { type: 'string' } } } },
    ]);

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls!.length).toBe(1);
    expect(result.tool_calls![0].function.name).toBe('read_file');
    expect(result.stop_reason).toBe('tool_use');
  });

  it('should stream responses', async () => {
    setupMockStream([
      JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { content: ' world' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ]);

    const p = new DeepSeekProvider('test-key');
    const chunks: string[] = [];

    for await (const event of p.chatStream('system', [{ role: 'user', content: 'Hi' }])) {
      if (event.type === 'text') chunks.push(event.text!);
      if (event.type === 'done') {
        expect(event.response?.content).toBe('Hello world');
      }
    }

    expect(chunks.join('')).toBe('Hello world');
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const p = new DeepSeekProvider('bad-key');
    await expect(p.chat('sys', [{ role: 'user', content: 'Hi' }])).rejects.toThrow('401');
  });
});

describe('OpenAI Provider', () => {
  it('should create instance with defaults', () => {
    const p = new OpenAIProvider('test-key');
    expect(p.name).toBe('openai');
    expect(p.getModel()).toBe('gpt-4o');
  });

  it('should send chat request', async () => {
    setupMockResponse(200, {
      id: 'chat-1',
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Hello from GPT!' },
      }],
      usage: { prompt_tokens: 10, output_tokens: 5 },
    });

    const p = new OpenAIProvider('test-key');
    const result = await p.chat('Be concise', [{ role: 'user', content: 'Hi' }]);

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const callArgs = lastCall[1] as RequestInit;
    const body = JSON.parse(callArgs.body as string);
    expect(body.model).toBe('gpt-4o');
    expect(result.content).toBe('Hello from GPT!');
  });
});

describe('Anthropic Provider', () => {
  it('should create instance with defaults', () => {
    const p = new AnthropicProvider('test-key');
    expect(p.name).toBe('anthropic');
    expect(p.getModel()).toBe('sonnet-4');
  });

  it('should send native Anthropic format', async () => {
    setupMockResponse(200, {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello from API!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const p = new AnthropicProvider('test-key');
    const result = await p.chat('Be kind', [{ role: 'user', content: 'Hi' }]);

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const callArgs = lastCall[1] as RequestInit;
    const body = JSON.parse(callArgs.body as string);
    expect(body.model).toBe('sonnet-4');
    expect(body.system).toBe('Be kind');
    expect(result.content).toBe('Hello from API!');
  });
});

describe('Ollama Provider', () => {
  it('should create instance with defaults', () => {
    const p = new OllamaProvider();
    expect(p.name).toBe('ollama');
    expect(p.getModel()).toBe('llama3.2');
  });

  it('should use OpenAI-compatible endpoint', async () => {
    setupMockResponse(200, {
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Hello from local LLM!' },
      }],
    });

    const p = new OllamaProvider('', 'llama3.2', 'http://localhost:11434');
    const result = await p.chat('Be brief', [{ role: 'user', content: 'Hi' }]);
    expect(result.content).toBe('Hello from local LLM!');
  });
});

describe('Provider Factory', () => {
  it('should create DeepSeek from config', () => {
    const p = ProviderFactory.create({ provider: 'deepseek', apiKey: 'key' });
    expect(p.name).toBe('deepseek');
  });

  it('should create OpenAI from config', () => {
    const p = ProviderFactory.create({ provider: 'openai', apiKey: 'key' });
    expect(p.name).toBe('openai');
  });

  it('should create Anthropic from config', () => {
    const p = ProviderFactory.create({ provider: 'anthropic', apiKey: 'key' });
    expect(p.name).toBe('anthropic');
  });

  it('should create Ollama from config', () => {
    const p = ProviderFactory.create({ provider: 'ollama' });
    expect(p.name).toBe('ollama');
  });

  it('should throw for unknown provider', () => {
    expect(() => ProviderFactory.create({ provider: 'unknown' as any })).toThrow('Unknown provider');
  });

  it('should detect from environment', () => {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevBlade = process.env.BLADE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.BLADE_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test-ds-key';
    const p = ProviderFactory.fromEnv();
    expect(p.name).toBe('deepseek');
    delete process.env.DEEPSEEK_API_KEY;
    if (prevAnthropic) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevBlade) process.env.BLADE_API_KEY = prevBlade;
  });
});

// Cleanup
afterAll(() => {
  globalThis.fetch = originalFetch;
});


