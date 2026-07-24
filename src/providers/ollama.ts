/**
 * ⚔️ Ollama Provider Adapter
 *
 * Local LLM support via Ollama's OpenAI-compatible API endpoint.
 * Ollama v0.3.0+ serves an OpenAI-compatible /v1/chat/completions endpoint.
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

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  done_reason: string;
}

export class OllamaProvider extends ProviderAdapter {
  readonly name = 'ollama' as const;
  readonly displayName = 'Ollama (Local)';
  readonly defaultModel = 'llama3.2';

  constructor(
    apiKey = 'ollama',
    model = 'llama3.2',
    baseUrl = 'http://localhost:11434',
  ) {
    super(apiKey, model, baseUrl);
  }

  async chat(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): Promise<BladeResponse> {
    const apiMessages: OllamaMessage[] = [
      { role: 'system', content: system },
      ...messages.map(m => this.toOllamaMsg(m)),
    ];

    const body: Record<string, unknown> = {
      model: this.getModel(),
      messages: apiMessages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      body.tools = this.toOllamaTools(tools);
    }

    const res = await fetch(`${this.baseUrl}/v1/chat/completions` || `${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Fallback to Ollama's native API if v1 endpoint not found
      if (res.status === 404) {
        return this.chatNative(system, messages, tools);
      }
      const text = await res.text();
      throw new Error(`Ollama API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: OllamaMessage; finish_reason: string }> };
    const choice = data.choices?.[0];
    const msg = choice?.message;

    // Ollama may return tool_calls in a different format
    const toolCalls: BladeToolCall[] | undefined = (msg as any)?.tool_calls?.map(
      (tc: any, i: number) => ({
        id: `call_${i}`,
        type: 'function' as const,
        function: {
          name: tc.function?.name || '',
          arguments: typeof tc.function?.arguments === 'object'
            ? JSON.stringify(tc.function.arguments)
            : tc.function?.arguments || '',
        },
      }),
    );

    return {
      content: msg?.content || '',
      tool_calls: toolCalls?.length ? toolCalls : undefined,
      stop_reason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'stop',
    };
  }

  async *chatStream(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): AsyncGenerator<BladeStreamEvent, void, unknown> {
    const apiMessages: OllamaMessage[] = [
      { role: 'system', content: system },
      ...messages.map(m => this.toOllamaMsg(m)),
    ];

    const body: Record<string, unknown> = {
      model: this.getModel(),
      messages: apiMessages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = this.toOllamaTools(tools);
    }

    const url = `${this.baseUrl}/v1/chat/completions` || `${this.baseUrl}/api/chat`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 404) {
        yield { type: 'error', error: 'Ollama streaming not supported via proxy endpoint. Ensure Ollama v0.3.0+.' };
        return;
      }
      const text = await res.text();
      yield { type: 'error', error: `Ollama error (${res.status}): ${text}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

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
          if (json === '[DONE]') {
            yield { type: 'done', response: { content: fullContent, stop_reason: 'stop' } };
            continue;
          }

          try {
            const chunk = JSON.parse(json);
            const text = chunk.choices?.[0]?.delta?.content || '';
            if (text) {
              fullContent += text;
              yield { type: 'text', text };
            }
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) {
              yield { type: 'done', response: { content: fullContent, stop_reason: 'stop' } };
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async validate(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok
        ? { ok: true }
        : { ok: false, error: `Ollama not reachable at ${this.baseUrl}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /**
   * Fallback: use Ollama's native /api/chat endpoint (pre-v0.3.0)
   */
  private async chatNative(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): Promise<BladeResponse> {
    const ollamaMessages = [
      { role: 'system', content: system },
      ...messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' })),
    ];

    const body: Record<string, unknown> = {
      model: this.getModel(),
      messages: ollamaMessages,
      stream: false,
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama native API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OllamaResponse;
    return {
      content: data.message?.content || '',
      stop_reason: 'stop',
    };
  }

  private toOllamaMsg(msg: BladeMessage): OllamaMessage {
    return {
      role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    };
  }

  private toOllamaTools(tools: BladeToolDefinition[]): OllamaTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }
}
