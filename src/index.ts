/**
 * ⚔️ Blade — Entry Point
 *
 * The main entry point for the Blade library.
 * Exports all public API for programmatic use.
 *
 * Usage:
 *   import { Blade } from 'blade';
 *   const blade = new Blade({ provider: 'deepseek' });
 *   const result = await blade.chat('Hello');
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

export { ProviderAdapter } from './providers/index.js';
export type {
  ProviderName,
  ProviderConfig,
  BladeMessage,
  BladeContentBlock,
  BladeToolCall,
  BladeToolDefinition,
  BladeResponse,
  BladeStreamEvent,
} from './providers/index.js';
export { PROVIDER_REGISTRY, resolveProviderConfig, detectProvider, applyBladeEnv } from './providers/index.js';
// ProviderFactory is lazy-loaded to avoid cross-module name collisions during bundling
export type { ProviderInit } from './providers/factory.js';
export type { ProviderFactory as ProviderFactoryType } from './providers/factory.js';
export { DeepSeekProvider } from './providers/deepseek.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OllamaProvider } from './providers/ollama.js';
export { startServer } from './providers/proxy-server.js';

/**
 * Blade — the thin-shell AI engineering agent.
 *
 * High-level API for using Blade programmatically.
 * Auto-configures provider from environment variables or explicit config.
 * Uses lazy initialization to avoid cross-module resolution issues.
 */
export class Blade {
  private _provider: ProviderAdapter | null = null;

  constructor(private _config?: ProviderInit) {}

  private async getProvider(): Promise<ProviderAdapter> {
    if (!this._provider) {
      const { ProviderFactory } = await import('./providers/factory.js');
      if (this._config) {
        this._provider = ProviderFactory.create(this._config);
      } else {
        this._provider = ProviderFactory.fromEnv();
      }
    }
    return this._provider;
  }

  /**
   * Get the active provider adapter (async init).
   */
  async getAdapter(): Promise<ProviderAdapter> {
    return this.getProvider();
  }

  /** The provider name (deepseek, openai, anthropic, ollama) */
  async getProviderName(): Promise<string> {
    const p = await this.getProvider();
    return p.name;
  }

  /**
   * Send a chat message and get a response.
   */
  async chat(messages: string | { role: string; content: string }[], options?: {
    system?: string;
    tools?: BladeToolDefinition[];
  }) {
    const provider = await this.getProvider();
    const msgArray = typeof messages === 'string'
      ? [{ role: 'user' as const, content: messages }]
      : messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system' | 'tool', content: m.content }));

    return provider.chat(
      options?.system || '',
      msgArray,
      options?.tools,
    );
  }

  /**
   * Stream a chat response.
   */
  async *chatStream(messages: string | { role: string; content: string }[], options?: {
    system?: string;
    tools?: BladeToolDefinition[];
  }): AsyncGenerator<BladeStreamEvent, void, unknown> {
    const provider = await this.getProvider();
    const msgArray = typeof messages === 'string'
      ? [{ role: 'user' as const, content: messages }]
      : messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system' | 'tool', content: m.content }));

    yield* provider.chatStream(
      options?.system || '',
      msgArray,
      options?.tools,
    );
  }

  /**
   * Validate the provider connection.
   */
  async validate() {
    const provider = await this.getProvider();
    return provider.validate();
  }
}

// Auto-export version
export const VERSION = '1.0.0';
