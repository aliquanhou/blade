/**
 * ⚔️ 多轮工具链测试
 *
 * 验证 ToolExecutor 的并行/串行执行、链式调用。
 */

import { describe, it, expect } from 'bun:test';
import { ToolExecutor } from '../../src/engine/tool-executor.js';
import type { ToolDef } from '../../src/engine/types.js';

describe('ToolExecutor', () => {
  it('should register built-in tools', () => {
    const executor = new ToolExecutor();
    const defs = executor.getToolDefinitions();
    expect(defs.length).toBe(20); // 20 built-in tools
    expect(defs.some(t => t.name === 'read_file')).toBe(true);
    expect(defs.some(t => t.name === 'run_bash')).toBe(true);
  });

  it('should find registered tools', () => {
    const executor = new ToolExecutor();
    const tool = executor.findTool('read_file');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('read_file');
  });

  it('should return error for unknown tools', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('nonexistent_tool', {});
    expect(result.is_error).toBe(true);
  });

  it('should register custom tools', () => {
    const executor = new ToolExecutor();
    const customTool: ToolDef = {
      name: 'custom_echo',
      description: 'Echo input',
      category: 'shell',
      isConcurrencySafe: true,
      execute: async (input) => ({
        tool_use_id: '',
        content: `Echo: ${JSON.stringify(input)}`,
      }),
    };

    executor.register(customTool);
    const found = executor.findTool('custom_echo');
    expect(found).toBeDefined();
    expect(found!.name).toBe('custom_echo');
  });

  it('should execute read_file with error for bad path', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('read_file', { path: '/nonexistent/path/file.txt' });
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('Error');
  });

  it('should execute system_info successfully', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('system_info', {});
    expect(result.is_error).toBeFalsy();
    expect(result.content).toContain('OS:');
    expect(result.content).toContain('CPUs:');
  });

  it('should execute chain with concurrent-safe tools in parallel', async () => {
    const executor = new ToolExecutor();
    const calls = [
      { name: 'system_info', input: {}, id: '1' },
      { name: 'cpu_info', input: {}, id: '2' },
      { name: 'memory_usage', input: {}, id: '3' },
    ];

    const results = await executor.executeChain(calls);
    expect(results.size).toBe(3);

    for (const [id, result] of results) {
      expect(result.is_error).toBeFalsy();
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  it('should execute chain with mixed concurrency', async () => {
    const executor = new ToolExecutor();
    const calls = [
      { name: 'list_files', input: { path: '.' }, id: '1' },
      { name: 'system_info', input: {}, id: '2' },
      { name: 'memory_usage', input: {}, id: '3' },
    ];

    const results = await executor.executeChain(calls);
    expect(results.size).toBe(3);
  });
});
