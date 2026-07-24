/**
 * ⚔️ Provider Factory
 *
 * Creates provider adapters from config.
 * Supports environment variable and programmatic configuration.
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import {
  type ProviderAdapter,
  type ProviderName,
  PROVIDER_REGISTRY,
  detectProvider,
} from './index.js';
import { AnthropicProvider } from './anthropic.js';
import { DeepSeekProvider } from './deepseek.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

export interface ProviderInit {
  provider?: ProviderName | string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class ProviderFactory {
  /**
   * Create a provider adapter from explicit config.
   */
  static create(config: ProviderInit): ProviderAdapter {
    const name = (config.provider || 'anthropic').toLowerCase() as ProviderName;
    const apiKey = config.apiKey || '';
    const model = config.model;
    const baseUrl = config.baseUrl;

    switch (name) {
      case 'deepseek':
        return new DeepSeekProvider(apiKey, model, baseUrl);
      case 'openai':
        return new OpenAIProvider(apiKey, model, baseUrl);
      case 'anthropic':
        return new AnthropicProvider(apiKey, model, baseUrl);
      case 'ollama':
        return new OllamaProvider(apiKey, model, baseUrl);
      default:
        throw new Error(`Unknown provider: ${name}. Valid options: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`);
    }
  }

  /**
   * Create a provider adapter from environment variables.
   * Uses: BLADE_PROVIDER, BLADE_API_KEY, BLADE_MODEL, BLADE_BASE_URL
   */
  static fromEnv(): ProviderAdapter {
    const provider = detectProvider();
    const cfg = PROVIDER_REGISTRY[provider];
    const apiKey = process.env.BLADE_API_KEY || process.env[cfg.apiKeyEnv] || '';
    const model = process.env.BLADE_MODEL || cfg.defaultModel;
    const baseUrl = process.env.BLADE_BASE_URL || cfg.baseUrl;

    return ProviderFactory.create({ provider, apiKey, model, baseUrl });
  }

  /**
   * Detect available providers from environment.
   * Returns a list of provider names that have API keys configured.
   */
  static detectAvailable(): ProviderName[] {
    const available: ProviderName[] = [];
    if (process.env.ANTHROPIC_API_KEY || process.env.BLADE_API_KEY) available.push('anthropic');
    if (process.env.DEEPSEEK_API_KEY) available.push('deepseek');
    if (process.env.OPENAI_API_KEY) available.push('openai');
    available.push('ollama'); // always available (local)
    return available;
  }
}
