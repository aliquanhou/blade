#!/usr/bin/env node
/**
 * Blade â€?thin-shell AI engineering agent.
 *
 * Model handles intelligence, shell handles communication.
 * Provider-agnostic â€?supports DeepSeek, OpenAI, Ollama, and more.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BLADE_ROOT = resolve(__dirname, '..');
const ENGINE_PATH = join(BLADE_ROOT, 'engine', 'blade-engine.js');

// ============================================================
// Blade config
// ============================================================

const BLADE_CONFIG_DIR = join(homedir(), '.blade');
const BLADE_CONFIG_FILE = join(BLADE_CONFIG_DIR, 'config.json');

function loadConfig() {
  const defaults = {
    provider: process.env.BLADE_PROVIDER || 'auto',
    model: process.env.BLADE_MODEL || '',
    apiKey: process.env.BLADE_API_KEY || '',
    baseUrl: process.env.BLADE_BASE_URL || '',
    configDir: BLADE_CONFIG_DIR,
  };

  try {
    if (existsSync(BLADE_CONFIG_FILE)) {
      const userConfig = JSON.parse(readFileSync(BLADE_CONFIG_FILE, 'utf-8'));
      return { ...defaults, ...userConfig };
    }
  } catch {
    // ignore config errors
  }

  return defaults;
}

// ============================================================
// Provider config mapping
// ============================================================

function resolveProvider(config) {
  const providers = {
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      envKey: 'ANTHROPIC_API_KEY',
    },
    deepseek: {
      baseUrl: 'https://api.deepseek.com/v1',
      envKey: 'DEEPSEEK_API_KEY',
      defaultModel: 'deepseek-v4-flash',
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      envKey: 'OPENAI_API_KEY',
    },
    ollama: {
      baseUrl: 'http://localhost:11434/v1',
      envKey: '',
    },
  };

  let provider = config.provider;

  if (provider === 'auto') {
    if (process.env.BLADE_API_KEY || process.env.ANTHROPIC_API_KEY) {
      provider = 'anthropic';
    } else if (process.env.DEEPSEEK_API_KEY) {
      provider = 'deepseek';
    } else if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
    } else {
      provider = 'anthropic';
    }
  }

  const providerConfig = providers[provider];
  if (!providerConfig) {
    console.error('Unknown provider: ' + provider + ', falling back to anthropic');
    return providers.anthropic;
  }

  return providerConfig;
}

// ============================================================
// Environment setup
// ============================================================

function setupEnvironment(config, providerConfig) {
  process.env.BLADE_CONFIG_DIR = BLADE_CONFIG_DIR;

  const apiKey = config.apiKey || process.env[providerConfig.envKey] || '';
  const baseUrl = config.baseUrl || providerConfig.baseUrl;
  const model = config.model || process.env.BLADE_MODEL || '';

  if (apiKey) {
    process.env.ANTHROPIC_API_KEY = apiKey;
    process.env.ANTHROPIC_BASE_URL = baseUrl;

    if (providerConfig.envKey && !process.env[providerConfig.envKey]) {
      process.env[providerConfig.envKey] = apiKey;
    }
  }

  if (model || providerConfig.defaultModel) {
    process.env.CLAUDE_CODE_MODEL = model || providerConfig.defaultModel;
  }

  if (process.env.BLADE_DEBUG) {
    console.error('[Blade] Config:', JSON.stringify({ provider: config.provider, ...providerConfig, apiKey: apiKey ? '***' : '' }, null, 2));
    console.error('[Blade] Environment:', {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***' : undefined,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      CLAUDE_CODE_MODEL: process.env.CLAUDE_CODE_MODEL,
    });
  }
}

// ============================================================
// Main entry
// ============================================================

async function main() {
  const config = loadConfig();
  const providerConfig = resolveProvider(config);
  setupEnvironment(config, providerConfig);

  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v' || args[0] === '-V')) {
    const pkg = JSON.parse(readFileSync(join(BLADE_ROOT, 'package.json'), 'utf-8'));
    console.log(pkg.version + ' (Blade)');
    return;
  }

  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log([
      'Blade â€?thin-shell AI engineering agent',
      '',
      'Usage:',
      '  blade [options] [prompt]',
      '',
      'Options:',
      '  --version, -v    Show version',
      '  --help, -h       Show this help',
      '',
      'Environment:',
      '  BLADE_PROVIDER   AI provider (deepseek|openai|anthropic|ollama|auto)',
      '  BLADE_API_KEY    API key',
      '  BLADE_MODEL      Model name',
      '  BLADE_BASE_URL   API base URL',
      '  BLADE_DEBUG      Debug mode',
      '',
      'Config:',
      '  ~/.blade/config.json',
      '',
      'Examples:',
      '  blade "write a React component"',
      '  BLADE_PROVIDER=deepseek blade "analyze this code"',
    ].join('\n'));
    return;
  }

  if (!existsSync(BLADE_CONFIG_DIR)) {
    mkdirSync(BLADE_CONFIG_DIR, { recursive: true });
  }

  if (args.includes('--proxy')) {
    console.error('[Blade] Starting API translation proxy...');
    try {
      await import('../src/providers/proxy-server.js');
    } catch {
      console.error('[Blade] Proxy module not found');
    }
    return;
  }

  try {
    const { spawn } = await import('child_process');
    let engineArgs = process.argv.slice(2);

    const model = process.env.CLAUDE_CODE_MODEL;
    if (model && !engineArgs.includes('--model')) {
      engineArgs = ['--model', model, ...engineArgs];
    }

    if (process.env.BLADE_DEBUG) {
      console.error('[Blade] Starting engine:', ENGINE_PATH);
      console.error('[Blade] Engine args:', engineArgs);
    }

    const child = spawn(process.execPath, [ENGINE_PATH, ...engineArgs], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });

    child.on('error', (err) => {
      console.error('Blade engine error:', err.message);
      process.exit(1);
    });

  } catch (err) {
    console.error('Failed to start Blade:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Blade error:', err);
  process.exit(1);
});


