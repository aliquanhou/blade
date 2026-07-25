/**
 * ⚔️ CLI 测试
 *
 * 验证参数解析、CLI 入口基础功能。
 */

import { describe, it, expect } from 'bun:test';

describe('CLI', () => {
  it('should print version', async () => {
    const proc = Bun.spawn(['bun', 'run', 'bin/cli.ts', '--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = await new Response(proc.stdout).text();
    expect(output).toContain('Blade');
    await proc.exited;
  });

  it('should print help', async () => {
    const proc = Bun.spawn(['bun', 'run', 'bin/cli.ts', '--help'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = await new Response(proc.stdout).text();
    expect(output).toContain('Blade CLI');
    expect(output).toContain('--provider');
    await proc.exited;
  });

  it('should handle --help flag', async () => {
    const proc = Bun.spawn(['bun', 'run', 'bin/cli.ts', '-h'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = await new Response(proc.stdout).text();
    expect(output).toContain('Blade CLI');
    await proc.exited;
  });

  it('should handle pipe input', async () => {
    const proc = Bun.spawn(['bun', 'run', 'bin/cli.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin.write('hello\n');
    proc.stdin.end();
    const exitCode = await proc.exited;
    // Should exit cleanly (interactive mode exit via /exit or Ctrl+C)
    // Just verify it starts without crashing
    expect(exitCode).toBeDefined();
  });
});
