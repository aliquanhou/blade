#!/usr/bin/env node
/**
 * ⚔️ Blade CLI — 兼容性入口
 *
 * 此文件仅用于向后兼容，重定向到 cli.ts。
 * 新代码请直接使用 `bun run bin/cli.ts`。
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, 'cli.ts');

const result = spawnSync(
  process.execPath,
  [cliPath, ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
);

process.exit(result.status ?? 0);
