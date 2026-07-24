/**
 * ⚔️ Blade Provider Abstraction
 *
 * Core types and abstract base class for all providers.
 * Each provider adapter translates between Blade's internal format
 * and the provider's native API format.
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

// ============================================================
// Core Types
// ============================================================

export type ProviderName = 'anthropic' | 'deepseek' | 'openai' | 'ollama';

export interface ProviderConfig {
  name: ProviderName;
  displayName: string;
  apiKeyEnv: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

export interface BladeMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | BladeContentBlock[];
  tool_calls?: BladeToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface BladeContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  image_url?: { url: string };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
}

export interface BladeToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface BladeToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface BladeResponse {
  content: string | BladeContentBlock[];
  tool_calls?: BladeToolCall[];
  stop_reason: 'stop' | 'tool_use' | 'max_tokens' | 'error';
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface BladeStreamEvent {
  type: 'text' | 'tool_use' | 'done' | 'error';
  text?: string;
  tool_call?: BladeToolCall;
  response?: BladeResponse;
  error?: string;
}

// ============================================================
// Abstract Base Class
// ============================================================

export abstract class ProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly displayName: string;
  abstract readonly defaultModel: string;

  constructor(
    protected apiKey: string,
    protected model: string,
    protected baseUrl: string,
  ) {}

  /**
   * Send a chat completion request and return the full response.
   */
  abstract chat(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): Promise<BladeResponse>;

  /**
   * Send a chat completion request with streaming.
   * Yields BladeStreamEvent as chunks arrive, then yields { type: 'done', response }.
   */
  abstract chatStream(
    system: string,
    messages: BladeMessage[],
    tools?: BladeToolDefinition[],
  ): AsyncGenerator<BladeStreamEvent, void, unknown>;

  /**
   * Validate that the API key/connection works.
   */
  abstract validate(): Promise<{ ok: boolean; error?: string }>;

  /**
   * Get the effective model ID being used.
   */
  getModel(): string {
    return this.model || this.defaultModel;
  }
}

// ============================================================
// Configuration helpers (env-var-based)
// ============================================================

export const PROVIDER_REGISTRY: Record<ProviderName, ProviderConfig> = {
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'sonnet-4',
    models: [
      'sonnet-4',
      'opus-4',
      'haiku-3.5',
    ],
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama (Local)',
    apiKeyEnv: '',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    models: [],
  },
};

export function resolveProviderConfig(name: string): ProviderConfig {
  const p = name.toLowerCase() as ProviderName;
  return PROVIDER_REGISTRY[p] || PROVIDER_REGISTRY.anthropic;
}

export function detectProvider(): ProviderName {
  if (process.env.BLADE_PROVIDER) {
    const p = process.env.BLADE_PROVIDER.toLowerCase() as ProviderName;
    if (PROVIDER_REGISTRY[p]) return p;
  }
  if (process.env.BLADE_API_KEY || process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
}

export function applyBladeEnv() {
  const provider = detectProvider();
  const cfg = PROVIDER_REGISTRY[provider];
  const apiKey = process.env.BLADE_API_KEY || process.env[cfg.apiKeyEnv] || '';
  const model = process.env.BLADE_MODEL || cfg.defaultModel;
  const baseUrl = process.env.BLADE_BASE_URL || cfg.baseUrl;

  if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
  if (baseUrl) process.env.ANTHROPIC_BASE_URL = baseUrl;
  if (model) process.env.CLAUDE_CODE_MODEL = model;
  process.env.BLADE_ACTIVE_PROVIDER = provider;
}

