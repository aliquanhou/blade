/**
 * ⚔️ Build Verification Test
 *
 * Verifies that the build output is correct:
 * - All expected files exist
 * - Imports resolve correctly
 * - Provider layer works after compilation
 *
 * Run: bun test tests/build.test.ts
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { describe, it, expect } from 'bun:test';
import { existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');

describe('Build Output', () => {
  it('should have dist directory', () => {
    expect(existsSync(DIST)).toBe(true);
  });

  it('should have all provider files', () => {
    const files = readdirSync(DIST, { recursive: true }).map(f => String(f).replace(/\\/g, '/'));
    const expected = [
      'index.js',
      'providers/index.js',
      'providers/deepseek.js',
      'providers/openai.js',
      'providers/anthropic.js',
      'providers/ollama.js',
      'providers/factory.js',
      'providers/proxy-server.js',
    ];

    for (const file of expected) {
      expect(files).toContain(file);
    }
  });

  it('should have 8 JS output files', () => {
    const files = readdirSync(DIST, { recursive: true }).filter(f => String(f).endsWith('.js'));
    expect(files.length).toBe(8);
  });
});

describe('Compiled Code', () => {
  it('should import and use Blade class', async () => {
    const { Blade } = await import('../dist/index.js');
    const blade = new Blade({ provider: 'deepseek', apiKey: 'test' });
    const name = await blade.getProviderName();
    expect(name).toBe('deepseek');
    const adapter = await blade.getAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('deepseek');
  });

  it('should import individual providers', async () => {
    const { DeepSeekProvider } = await import('../dist/providers/deepseek.js');
    const p = new DeepSeekProvider('test-key');
    expect(p.name).toBe('deepseek');
  });

  it('should import factory', async () => {
    const { ProviderFactory } = await import('../dist/providers/factory.js');
    const p = ProviderFactory.create({ provider: 'ollama' });
    expect(p.name).toBe('ollama');
  });

  it('should have correct exports from index', async () => {
    const mod = await import('../dist/index.js');
    expect(mod.VERSION).toBe('1.0.0');
    expect(mod.Blade).toBeDefined();
    expect(mod.ProviderAdapter).toBeDefined();
  });
});
