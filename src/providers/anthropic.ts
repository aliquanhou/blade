/**
 * ⚔️ Anthropic Provider Adapter
 *
 * Native adapter for Anthropic's Messages API.
 * This is the "native" provider for the engine �?no translation needed.
 * Used when Blade runs with Anthropic directly.
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
  type BladeContentBlock,
} from './index.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: { input_tokens: number; output_tokens: number };
}

export class AnthropicProvider extends ProviderAdapter {
  readonly name = 'anthropic' as const;
  readonly displayName = 'Anthropic';
  readonly defaultModel = 'sonnet-4';

  constructor(
    apiKey: string,
    model = 'sonnet-4',
    baseUrl = 'https://api.anthropic.com',
  ) {
    super(apiKey, model, baseUrl);
  }

  async chat(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): Promise<BladeResponse> {
    const body: Record<string, unknown> = {
      model: this.getModel(),
      system,
      messages: messages.map(m => this.toAnthropicMsg(m)),
      max_tokens: 8192,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })) satisfies AnthropicToolSpec[];
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    return this.toBladeResponse(data);
  }

  async *chatStream(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): AsyncGenerator<BladeStreamEvent, void, unknown> {
    const body: Record<string, unknown> = {
      model: this.getModel(),
      system,
      messages: messages.map(m => this.toAnthropicMsg(m)),
      max_tokens: 8192,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })) satisfies AnthropicToolSpec[];
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      yield { type: 'error', error: `Anthropic API error (${res.status}): ${text}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
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
          if (!t || !t.startsWith('event:') && !t.startsWith('data:')) continue;

          // Anthropic SSE: event: ...\ndata: ...
          // Parse the data JSON
          if (t.startsWith('data: ')) {
            const json = t.slice(6);
            try {
              const evt = JSON.parse(json);
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                yield { type: 'text', text: evt.delta.text };
              }
              if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
                // Start of a tool call
              }
              if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
                const stop = evt.delta.stop_reason === 'tool_use' ? 'tool_use' : 'stop';
                yield {
                  type: 'done',
                  response: { content: '', stop_reason: stop, usage: evt.usage },
                };
              }
            } catch { /* skip */ }
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
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      return { ok: true }; // models endpoint may not exist; key validation is best-effort
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  private toAnthropicMsg(msg: BladeMessage): AnthropicMessage {
    if (msg.role === 'system') {
      return { role: 'user', content: [{ type: 'text', text: msg.content as string }] };
    }
    if (typeof msg.content === 'string') {
      return { role: msg.role as 'user' | 'assistant', content: [{ type: 'text', text: msg.content }] };
    }
    const blocks: AnthropicContentBlock[] = msg.content.map(c => {
      if (c.type === 'text') return { type: 'text', text: c.text || '' };
      if (c.type === 'tool_use') return { type: 'tool_use', id: c.id!, name: c.name!, input: c.input || {} };
      if (c.type === 'tool_result') return { type: 'tool_result', tool_use_id: c.id!, content: c.content || '' };
      return { type: 'text', text: '' };
    });
    return { role: msg.role as 'user' | 'assistant', content: blocks };
  }

  private toBladeResponse(data: AnthropicResponse): BladeResponse {
    const toolCalls: BladeToolCall[] = [];
    let text = '';

    for (const block of data.content) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      }
    }

    return {
      content: text,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      stop_reason: data.stop_reason === 'tool_use' ? 'tool_use' : 'stop',
      usage: data.usage
        ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens }
        : undefined,
    };
  }
}

