/**
 * ⚔️ DeepSeek Provider Adapter
 *
 * Translates Blade's internal message format to DeepSeek's
 * OpenAI-compatible Chat Completions API.
 *
 * API docs: https://api-docs.deepseek.com/
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import {
  ProviderAdapter,
  type BladeMessage,
  type BladeToolDefinition,
  type BladeResponse,
  type BladeStreamEvent,
  type BladeContentBlock,
  type BladeToolCall,
} from './index.js';

type DeepSeekRole = 'system' | 'user' | 'assistant' | 'tool';

interface DeepSeekMessage {
  role: DeepSeekRole;
  content: string | null;
  tool_calls?: DeepSeekToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface DeepSeekToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface DeepSeekTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface DeepSeekResponse {
  id: string;
  choices: Array<{
    finish_reason: 'stop' | 'tool_calls' | 'length';
    message: DeepSeekMessage;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

interface DeepSeekStreamChunk {
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: 'stop' | 'tool_calls' | 'length';
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class DeepSeekProvider extends ProviderAdapter {
  readonly name = 'deepseek' as const;
  readonly displayName = 'DeepSeek';
  readonly defaultModel = 'deepseek-v4-flash';

  constructor(
    apiKey: string,
    model = 'deepseek-v4-flash',
    baseUrl = 'https://api.deepseek.com/v1',
  ) {
    super(apiKey, model, baseUrl);
  }

  async chat(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): Promise<BladeResponse> {
    const apiMessages: DeepSeekMessage[] = [
      { role: 'system', content: system },
      ...messages.map(m => this.toDeepSeekMsg(m)),
    ];

    const body: Record<string, unknown> = {
      model: this.getModel(),
      messages: apiMessages,
      max_tokens: 8192,
    };

    if (tools && tools.length > 0) {
      body.tools = this.toDeepSeekTools(tools);
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as DeepSeekResponse;
    return this.toBladeResponse(data);
  }

  async *chatStream(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): AsyncGenerator<BladeStreamEvent, void, unknown> {
    const apiMessages: DeepSeekMessage[] = [
      { role: 'system', content: system },
      ...messages.map(m => this.toDeepSeekMsg(m)),
    ];

    const body: Record<string, unknown> = {
      model: this.getModel(),
      messages: apiMessages,
      max_tokens: 8192,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = this.toDeepSeekTools(tools);
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text();
      yield { type: 'error', error: `DeepSeek API error (${res.status}): ${text}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr) as DeepSeekStreamChunk;
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            // Text content
            if (delta.content) {
              fullContent += delta.content;
              yield { type: 'text', text: delta.content };
            }

            // Tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCalls.has(idx)) {
                  toolCalls.set(idx, {
                    id: tc.id || `call_${idx}`,
                    name: tc.function?.name || '',
                    args: '',
                  });
                }
                const existing = toolCalls.get(idx)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;  // = not +=: name comes complete, never split
                if (tc.function?.arguments) existing.args += tc.function.arguments;
              }
            }

            // Done
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) {
              const bladeToolCalls: BladeToolCall[] = [];
              for (const [, tc] of toolCalls) {
                bladeToolCalls.push({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: tc.args },
                });
              }

              yield {
                type: 'done',
                response: {
                  content: fullContent,
                  tool_calls: bladeToolCalls.length > 0 ? bladeToolCalls : undefined,
                  stop_reason: finish === 'tool_calls' ? 'tool_use' : 'stop',
                  usage: chunk.usage
                    ? {
                        input_tokens: chunk.usage.prompt_tokens,
                        output_tokens: chunk.usage.completion_tokens,
                      }
                    : undefined,
                },
              };
            }
          } catch {
            // skip parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async validate(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok
        ? { ok: true }
        : { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // ============================================================
  // Format converters
  // ============================================================

  private toDeepSeekMsg(msg: BladeMessage): DeepSeekMessage {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        tool_call_id: msg.tool_call_id,
      };
    }
    if (msg.role === 'assistant' && msg.tool_calls) {
      return {
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content || null : null,
        tool_calls: msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: tc.function,
        })),
      };
    }
    return {
      role: msg.role as DeepSeekRole,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    };
  }

  private toDeepSeekTools(tools: BladeToolDefinition[]): DeepSeekTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  private toBladeResponse(data: DeepSeekResponse): BladeResponse {
    const choice = data.choices?.[0];
    const msg = choice?.message;

    const toolCalls: BladeToolCall[] | undefined = msg?.tool_calls?.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: tc.function,
    }));

    return {
      content: msg?.content || '',
      tool_calls: toolCalls?.length ? toolCalls : undefined,
      stop_reason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'stop',
      usage: data.usage
        ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens }
        : undefined,
    };
  }
}
