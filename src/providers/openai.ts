/**
 * ⚔️ OpenAI Provider Adapter
 *
 * Translates Blade's internal format to OpenAI's Chat Completions API.
 * Uses the same format as DeepSeek (both are OpenAI-compatible).
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
  type BladeToolCall,
} from './index.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | OpenAIContentBlock[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    finish_reason: 'stop' | 'tool_calls' | 'length';
    message: OpenAIMessage;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAIProvider extends ProviderAdapter {
  readonly name = 'openai' as const;
  readonly displayName = 'OpenAI';
  readonly defaultModel = 'gpt-4o';

  constructor(
    apiKey: string,
    model = 'gpt-4o',
    baseUrl = 'https://api.openai.com/v1',
  ) {
    super(apiKey, model, baseUrl);
  }

  async chat(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): Promise<BladeResponse> {
    const apiMessages: OpenAIMessage[] = [
      { role: 'system', content: system },
      ...messages.map(m => this.toOpenAIMsg(m)),
    ];

    const body: Record<string, unknown> = {
      model: this.getModel(),
      messages: apiMessages,
      max_tokens: 8192,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OpenAIResponse;
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

  async *chatStream(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): AsyncGenerator<BladeStreamEvent, void, unknown> {
    const apiMessages: OpenAIMessage[] = [
      { role: 'system', content: system },
      ...messages.map(m => this.toOpenAIMsg(m)),
    ];

    const body: Record<string, unknown> = {
      model: this.getModel(),
      messages: apiMessages,
      max_tokens: 8192,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      yield { type: 'error', error: `OpenAI API error (${res.status}): ${text}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
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
          const t = line.trim();
          if (!t || !t.startsWith('data: ')) continue;
          const json = t.slice(6);
          if (json === '[DONE]') continue;

          try {
            const chunk = JSON.parse(json);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              fullContent += delta.content;
              yield { type: 'text', text: delta.content };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const i = tc.index;
                if (!toolCalls.has(i)) {
                  toolCalls.set(i, { id: tc.id || `call_${i}`, name: '', args: '' });
                }
                const c = toolCalls.get(i)!;
                if (tc.id) c.id = tc.id;
                if (tc.function?.name) c.name += tc.function.name;
                if (tc.function?.arguments) c.args += tc.function.arguments;
              }
            }

            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) {
              const calls: BladeToolCall[] = [];
              for (const [, c] of toolCalls) {
                calls.push({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } });
              }
              yield {
                type: 'done',
                response: {
                  content: fullContent,
                  tool_calls: calls.length > 0 ? calls : undefined,
                  stop_reason: finish === 'tool_calls' ? 'tool_use' : 'stop',
                },
              };
            }
          } catch { /* skip parse errors */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async validate(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok
        ? { ok: true }
        : { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  private toOpenAIMsg(msg: BladeMessage): OpenAIMessage {
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
        content: typeof msg.content === 'string' ? (msg.content || null) : null,
        tool_calls: msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: tc.function,
        })),
      };
    }
    return {
      role: msg.role as 'user' | 'assistant' | 'system',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    };
  }
}
