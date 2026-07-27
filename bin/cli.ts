#!/usr/bin/env node
/**
 * ⚔️ Blade CLI — 终端入口程序
 *
 * 直接实例化 QueryEngine，不经过任何子进程。
 * 与 WebUI 共用同一套引擎，SSE 事件格式完全一致。
 *
 * 用法：
 *   blade "你好"                    # 单次对话模式
 *   blade                          # 交互模式
 *   blade --model deepseek-v4-flash "你好"
 *   blade --provider deepseek --stream "你好"
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { createInterface } from 'readline';
import { QueryEngine } from '../src/engine/index.js';
import type { SSEEvent } from '../src/engine/types.js';

// ============================================================
// Config
// ============================================================

function loadConfig() {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};
  const positional: string[] = [];

  // Flags that take a value (vs boolean flags)
  const valueFlags = new Set(['provider', 'p', 'model', 'm', 'api-key', 'apiKey', 'base-url', 'baseUrl']);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (valueFlags.has(key) && i + 1 < args.length && !args[i + 1].startsWith('--')) {
        config[key] = args[++i];
      } else {
        config[key] = 'true';
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flags like -p
      const key = arg.slice(1);
      if (valueFlags.has(key) && i + 1 < args.length && !args[i + 1].startsWith('--')) {
        config[key] = args[++i];
      } else {
        config[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    provider: config.provider || process.env.BLADE_PROVIDER,
    model: config.model || process.env.BLADE_MODEL,
    apiKey: config.apiKey || process.env.BLADE_API_KEY,
    baseUrl: config.baseUrl || process.env.BLADE_BASE_URL,
    prompt: config.p || positional.join(' ') || null,
    stream: config.stream === 'true' || config.s === 'true',
    interactive: config.interactive === 'true' || config.i === 'true',
    version: config.version === 'true' || config.v === 'true',
    help: config.help === 'true' || config.h === 'true',
  };
}

function printHelp() {
  console.log(`
⚔️  Blade CLI — AI 工程智能体

用法:
  blade "prompt"                    单次对话模式
  blade                             交互模式（默认）

选项:
  --provider, -p   AI 提供商 (deepseek|openai|anthropic|ollama)
  --model, -m      模型名称
  --api-key         API Key
  --stream, -s      流式输出
  --version, -v     显示版本
  --help, -h        显示帮助

环境变量:
  BLADE_PROVIDER      AI 提供商
  BLADE_API_KEY       API Key
  BLADE_MODEL         模型名称
  BLADE_BASE_URL      API 基础 URL

示例:
  blade "你好"
  blade --provider deepseek --model deepseek-v4-flash "写一个 React 组件"
  blade --stream
`);
}

function printVersion() {
  console.log('Blade v1.0.0');
}

// ============================================================
// SSE 事件渲染
// ============================================================

function renderSSEStream(event: SSEEvent): void {
  switch (event.type) {
    case 'token':
      process.stdout.write(event.content);
      break;
    case 'tool_use':
      process.stdout.write(`\n\x1b[36m⚡ 使用工具: ${event.name}\x1b[0m\n`);
      if (event.input && Object.keys(event.input).length > 0) {
        process.stdout.write(`\x1b[2m  ${JSON.stringify(event.input, null, 2)}\x1b[0m\n`);
      }
      break;
    case 'tool_result':
      process.stdout.write(`\x1b[32m✓ 工具执行完成\x1b[0m\n`);
      break;
    case 'done':
      // 文本已通过 token 事件流式输出，done 不重复打印
      if (event.usage) {
        process.stderr.write(`\n\x1b[2m[Tokens: ↑${event.usage.input_tokens || '?'} ↓${event.usage.output_tokens || '?'}]\x1b[0m\n`);
      }
      break;
    case 'error':
      process.stdout.write(`\n\x1b[31m✗ 错误: ${event.error}\x1b[0m\n`);
      break;
  }
}

function renderSimpleOutput(event: SSEEvent): void {
  switch (event.type) {
    case 'token':
      process.stdout.write(event.content);
      break;
    case 'done':
      if (event.completeMessage) process.stdout.write(`\n\n${event.completeMessage}\n`);
      break;
    case 'error':
      process.stdout.write(`\nError: ${event.error}\n`);
      break;
  }
}

// ============================================================
// 主流程
// ============================================================

async function runSinglePrompt(engine: QueryEngine, prompt: string, streamMode: boolean): Promise<void> {
  for await (const event of engine.chat(prompt)) {
    if (streamMode) {
      renderSSEStream(event);
    } else {
      renderSimpleOutput(event);
    }
  }
}

async function runInteractive(engine: QueryEngine): Promise<void> {
  // Welcome message
  const provider = await engine.getProvider();
  console.log(`\n⚔️  Blade CLI 交互模式 (${provider.displayName} / ${provider.getModel()})`);
  console.log('  输入 /help 查看命令，/exit 退出\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[33m❯\x1b[0m ',
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      continue;
    }

    if (input === '/exit' || input === '/quit') {
      break;
    }

    if (input === '/help') {
      console.log('\n  /exit, /quit  退出\n  /clear         清空对话\n  /help          显示帮助\n');
      rl.prompt();
      continue;
    }

    if (input === '/clear') {
      engine.reset();
      console.log('\n  对话已清空\n');
      rl.prompt();
      continue;
    }

    if (input === '/stats') {
      const stats = engine.getContextStats();
      console.log(`\n  Messages: ${stats.messageCount}`);
      console.log(`  Tokens: ~${stats.totalTokens}`);
      console.log(`  Compacted: ${stats.isCompacted}\n`);
      rl.prompt();
      continue;
    }

    // Stream response
    for await (const event of engine.chat(input)) {
      renderSSEStream(event);
    }
    console.log(''); // newline after done
    rl.prompt();
  }

  console.log('\n再见！\n');
  process.exit(0);
}

// ============================================================
// Entry
// ============================================================

async function main() {
  const cfg = loadConfig();

  if (cfg.help) {
    printHelp();
    return;
  }

  if (cfg.version) {
    printVersion();
    return;
  }

  const engine = new QueryEngine({
    provider: cfg.provider,
    model: cfg.model,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
  });

  if (cfg.prompt) {
    await runSinglePrompt(engine, cfg.prompt, cfg.stream);
  } else if (cfg.interactive) {
    await runInteractive(engine);
  } else if (!cfg.prompt) {
    // No prompt and no interactive flag — check stdin
    if (!process.stdin.isTTY) {
      // Pipe mode: read from stdin
      const chunks: string[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(String(chunk));
      }
      const input = chunks.join('').trim();
      if (input) {
        await runSinglePrompt(engine, input, cfg.stream);
      }
    } else {
      // Default to interactive
      await runInteractive(engine);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
