/**
 * ⚔️ Blade API Translation Proxy
 *
 * A lightweight HTTP proxy that translates Anthropic Messages API calls
 * to other provider formats (DeepSeek, OpenAI, Ollama).
 *
 * This allows the Blade engine (which speaks Anthropic's API natively)
 * to work with any provider just by setting ANTHROPIC_BASE_URL to this proxy.
 *
 * Usage:
 *   BLADE_PROVIDER=deepseek node src/providers/proxy-server.ts
 *   # In another terminal:
 *   ANTHROPIC_BASE_URL=http://localhost:8099 blade "hello"
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { ProviderFactory } from './factory.js';
import { PROVIDER_REGISTRY, detectProvider } from './index.js';

const PORT = parseInt(process.env.BLADE_PROXY_PORT || '8099', 10);
const TARGET_PROVIDER = process.env.BLADE_PROVIDER || detectProvider();

interface AnthropicRequest {
  model?: string;
  system?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: string; [key: string]: unknown }>;
  }>;
  max_tokens?: number;
  stream?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Health check
  if (url.pathname === '/health' || url.pathname === '/v1/models') {
    return new Response(
      JSON.stringify({
        object: 'list',
        data: [{ id: `blade-proxy-${TARGET_PROVIDER}`, object: 'model' }],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Only handle /v1/messages (Anthropic's main endpoint)
  if (url.pathname !== '/v1/messages') {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse the Anthropic-format request
  const body: AnthropicRequest = await req.json();
  const provider = ProviderFactory.fromEnv();

  // Convert Anthropic messages to Blade internal format
  const system = body.system || '';
  const messages = body.messages.map((m: any) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    // Handle content blocks
    const text = m.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
    return { role: m.role, content: text || '' };
  });

  // Convert Anthropic tools to Blade format
  const tools = body.tools?.map((t: any) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  // Stream or non-stream
  if (body.stream) {
    return handleStreaming(provider, system, messages, tools);
  } else {
    return handleNonStreaming(provider, system, messages, tools);
  }
}

async function handleNonStreaming(
  provider: ReturnType<typeof ProviderFactory.fromEnv>,
  system: string,
  messages: any[],
  tools?: any[],
): Promise<Response> {
  try {
    const result = await provider.chat(system, messages, tools);

    // Convert Blade response back to Anthropic format
    const anthropicResponse: Record<string, unknown> = {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: provider.getModel(),
      stop_reason: result.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: result.usage || { input_tokens: 0, output_tokens: 0 },
    };

    // Text content
    if (result.content) {
      (anthropicResponse.content as any[]).push({
        type: 'text',
        text: typeof result.content === 'string' ? result.content : result.content,
      });
    }

    // Tool calls
    if (result.tool_calls) {
      for (const tc of result.tool_calls) {
        (anthropicResponse.content as any[]).push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
    }

    return new Response(JSON.stringify(anthropicResponse), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        type: 'error',
        error: { type: 'api_error', message: String(err) },
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function handleStreaming(
  provider: ReturnType<typeof ProviderFactory.fromEnv>,
  system: string,
  messages: any[],
  tools?: any[],
): Promise<Response> {
  const stream = provider.chatStream(system, messages, tools);
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async pull(controller) {
      for await (const event of stream) {
        switch (event.type) {
          case 'text':
            controller.enqueue(
              encoder.encode(
                `event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'text_delta', text: event.text },
                })}\n\n`,
              ),
            );
            break;

          case 'done':
            if (event.response?.stop_reason) {
              controller.enqueue(
                encoder.encode(
                  `event: message_delta\ndata: ${JSON.stringify({
                    type: 'message_delta',
                    delta: {
                      stop_reason: event.response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
                      stop_sequence: null,
                    },
                    usage: event.response.usage || { input_tokens: 0, output_tokens: 0 },
                  })}\n\n`,
                ),
              );
            }
            controller.enqueue(
              encoder.encode(
                `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
              ),
            );
            controller.close();
            return;

          case 'error':
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  type: 'error',
                  error: { type: 'api_error', message: event.error },
                })}\n\n`,
              ),
            );
            controller.close();
            return;
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ============================================================
// Server startup
// ============================================================

function startServer() {
  const cfg = PROVIDER_REGISTRY[TARGET_PROVIDER as keyof typeof PROVIDER_REGISTRY] || PROVIDER_REGISTRY.anthropic;

  console.log('');
  console.log('  ⚔️  Blade API Proxy');
  console.log(`  ─${'─'.repeat(40)}`);
  console.log(`  Provider:  ${cfg.displayName}`);
  console.log(`  Model:     ${process.env.BLADE_MODEL || cfg.defaultModel}`);
  console.log(`  Endpoint:  ${cfg.baseUrl}`);
  console.log(`  Proxy:     http://localhost:${PORT}`);
  console.log('');
  console.log(`  Set ANTHROPIC_BASE_URL=http://localhost:${PORT} and run Blade`);
  console.log(`  Ctrl+C to stop`);
  console.log('');

  Bun.serve({
    port: PORT,
    async fetch(req) {
      return handleRequest(req);
    },
  });
}

// Auto-start if run directly
const isMain = process.argv[1]?.includes('proxy-server');
if (isMain) {
  startServer();
}

export { startServer };

