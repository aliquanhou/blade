/**
 * ⚔️ Blade Engine — Tool Executor
 *
 * 21 个内置工具的 TypeScript 实现（从 Python BladeTools 迁移）。
 * 并发安全工具可并行执行，写操作串行执行。
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { readFile, writeFile, unlink, readdir, stat, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, relative, sep, isAbsolute } from 'path';
import { execSync, spawnSync } from 'child_process';
import { cpus, totalmem, freemem, platform, release, hostname, arch, userInfo, uptime } from 'os';
import type { ToolDef, ToolResult } from './types.js';

const ROOT_DIR = resolve(import.meta.dirname || process.cwd(), '..', '..');

function fmtSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  for (const unit of units) {
    if (size < 1024) return `${size.toFixed(1)}${unit}`;
    size /= 1024;
  }
  return `${size.toFixed(1)}TB`;
}

function safePath(path: string): string {
  const p = isAbsolute(path) ? path : resolve(ROOT_DIR, path);
  return p;
}

function isWindows(): boolean {
  return platform() === 'win32';
}

function execCmd(cmd: string, cwd?: string, timeout = 30_000): string {
  try {
    const shell = isWindows() ? ['cmd', '/c'] : ['sh', '-c'];
    const result = spawnSync(shell[0], [shell[1], cmd], {
      cwd: cwd || ROOT_DIR,
      timeout,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = (result.stdout || result.stderr || '').trim();
    return output || `(exit code ${result.status})`;
  } catch (e: any) {
    if (e.code === 'ETIMEDOUT') return 'Error: Command timed out';
    return `Error: ${e.message}`;
  }
}

// ============================================================
// Tool Implementations
// ============================================================

async function readFileTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '');
  if (!path) return { tool_use_id: '', content: 'Error: No path provided', is_error: true };

  try {
    const full = safePath(path);
    if (!existsSync(full)) {
      return { tool_use_id: '', content: `Error: File not found: ${path}`, is_error: true };
    }
    const content = await readFile(full, 'utf-8');
    return { tool_use_id: '', content };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error reading file: ${e.message}`, is_error: true };
  }
}

async function writeFileTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '');
  const content = String(input.content || '');
  if (!path) return { tool_use_id: '', content: 'Error: No path provided', is_error: true };

  try {
    const full = safePath(path);
    await mkdir(resolve(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf-8');
    const st = await stat(full);
    return { tool_use_id: '', content: `Written: ${path} (${fmtSize(st.size)})` };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error writing file: ${e.message}`, is_error: true };
  }
}

async function editFileTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '');
  const oldText = String(input.old_text || '');
  const newText = String(input.new_text || '');
  if (!path || !oldText) {
    return { tool_use_id: '', content: 'Error: path and old_text required', is_error: true };
  }

  try {
    const full = safePath(path);
    if (!existsSync(full)) {
      return { tool_use_id: '', content: `Error: File not found: ${path}`, is_error: true };
    }
    const current = await readFile(full, 'utf-8');
    if (!current.includes(oldText)) {
      return { tool_use_id: '', content: `Error: text not found in ${path}`, is_error: true };
    }
    const updated = current.replace(oldText, newText);
    await writeFile(full, updated, 'utf-8');
    return { tool_use_id: '', content: `Edited: ${path} (1 replacement)` };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error editing file: ${e.message}`, is_error: true };
  }
}

async function deleteFileTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '');
  if (!path) return { tool_use_id: '', content: 'Error: No path provided', is_error: true };

  try {
    const full = safePath(path);
    if (!existsSync(full)) {
      return { tool_use_id: '', content: `Error: Not found: ${path}`, is_error: true };
    }
    await unlink(full);
    return { tool_use_id: '', content: `Deleted: ${path}` };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error deleting: ${e.message}`, is_error: true };
  }
}

async function listFilesTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  try {
    const full = safePath(path);
    const entries = await readdir(full, { withFileTypes: true });
    const lines: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const suffix = entry.isDirectory() ? '/' : '';
      let size = '';
      if (entry.isFile()) {
        try {
          const st = await stat(resolve(full, entry.name));
          size = ` (${fmtSize(st.size)})`;
        } catch { /* skip */ }
      }
      lines.push(`  ${entry.name}${suffix}${size}`);
    }
    const content = lines.length
      ? `Directory: ${path}\n${lines.join('\n')}`
      : `Directory: ${path}\n  (empty)`;
    return { tool_use_id: '', content };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error: ${e.message}`, is_error: true };
  }
}

/**
 * 搜索文件内容（纯 TypeScript 实现，不依赖 ripgrep）
 */
async function grepSearchTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  const pattern = String(input.pattern || '');
  if (!pattern) return { tool_use_id: '', content: 'Error: No pattern provided', is_error: true };

  try {
    const full = safePath(path);
    // Walk directory and search files
    const results: string[] = [];
    const dirs = [full];
    const visited = new Set<string>();

    while (dirs.length > 0 && results.length < 50) {
      const dir = dirs.pop()!;
      if (visited.has(dir)) continue;
      visited.add(dir);

      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }

      for (const entry of entries.sort()) {
        const entryPath = resolve(dir, entry);
        try {
          const st = await stat(entryPath);
          if (st.isDirectory()) {
            // Skip node_modules, .git, dist
            if (entry !== 'node_modules' && entry !== '.git' && entry !== 'dist' && !entry.startsWith('.')) {
              dirs.push(entryPath);
            }
          } else if (st.isFile() && st.size < 1_000_000) {
            const content = await readFile(entryPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(pattern)) {
                const rel = relative(ROOT_DIR, entryPath);
                const line = lines[i].trim().substring(0, 100);
                results.push(`  ${rel}:${i + 1}: ${line}`);
                if (results.length >= 50) break;
              }
            }
          }
        } catch {
          // Permission errors, skip
        }
      }
    }

    if (results.length === 0) {
      return { tool_use_id: '', content: `No matches for "${pattern}"` };
    }
    return { tool_use_id: '', content: `Search "${pattern}" (${results.length} matches):\n${results.join('\n')}` };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error: ${e.message}`, is_error: true };
  }
}

async function analyzePythonTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  try {
    const full = safePath(path);
    const targetPath = existsSync(full) ? full : safePath('.');
    if (!existsSync(targetPath)) {
      return { tool_use_id: '', content: 'Error: File not found', is_error: true };
    }

    const content = await readFile(targetPath, 'utf-8');
    const lines = content.split('\n');
    const result: string[] = [];
    result.push(`File: ${path} (${lines.length} lines)`);

    const classes: string[] = [];
    const functions: string[] = [];
    const imports: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('class ') && trimmed.includes(':')) {
        const name = trimmed.substring(6, trimmed.indexOf(':')).split('(')[0].trim();
        if (name) classes.push(name);
      }
      if ((trimmed.startsWith('def ') || trimmed.startsWith('async def ')) && trimmed.includes(':')) {
        const name = trimmed.replace('async def ', '').replace('def ', '').split('(')[0].trim();
        if (name) functions.push(name);
      }
      if (trimmed.startsWith('import ')) {
        const parts = trimmed.substring(7).split(',');
        for (const p of parts) {
          const name = p.trim().split(' ')[0];
          if (name) imports.push(name);
        }
      }
      if (trimmed.startsWith('from ')) {
        const match = trimmed.match(/^from\s+(\S+)\s+import\s+(\S+)/);
        if (match) imports.push(`${match[1]}.${match[2]}`);
      }
    }

    if (classes.length) result.push(`Classes: ${classes.join(', ')}`);
    if (functions.length) result.push(`Functions: ${functions.join(', ')}`);
    if (imports.length) result.push(`Imports: ${imports.join(', ')}`);

    return { tool_use_id: '', content: result.join('\n') };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error: ${e.message}`, is_error: true };
  }
}

async function countLinesTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  try {
    const full = safePath(path);
    const st = await stat(full);

    if (st.isFile()) {
      const content = await readFile(full, 'utf-8');
      const count = content.split('\n').length;
      return { tool_use_id: '', content: `${path}: ${count} lines` };
    }

    // Directory: count by extension
    const byExt: Record<string, number> = {};
    let total = 0;
    const dirs = [full];

    while (dirs.length > 0) {
      const dir = dirs.pop()!;
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const entryPath = resolve(dir, entry);
        try {
          const es = await stat(entryPath);
          if (es.isDirectory()) {
            if (entry !== 'node_modules' && entry !== '.git' && entry !== 'dist' && !entry.startsWith('.')) {
              dirs.push(entryPath);
            }
          } else if (es.isFile() && es.size < 500_000) {
            const content = await readFile(entryPath, 'utf-8');
            const count = content.split('\n').length;
            const ext = entry.includes('.') ? entry.substring(entry.lastIndexOf('.')) : '(no ext)';
            byExt[ext] = (byExt[ext] || 0) + count;
            total += count;
          }
        } catch { /* skip */ }
      }
    }

    let result = `Total: ${total} lines in ${path}\n`;
    const sorted = Object.entries(byExt).sort((a, b) => b[1] - a[1]);
    for (const [ext, count] of sorted) {
      result += `  ${ext}: ${count} lines\n`;
    }
    return { tool_use_id: '', content: result.trim() };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error: ${e.message}`, is_error: true };
  }
}

async function runBashTool(input: Record<string, unknown>): Promise<ToolResult> {
  const command = String(input.command || '');
  if (!command) return { tool_use_id: '', content: 'Error: No command', is_error: true };

  return { tool_use_id: '', content: execCmd(command) };
}

async function systemInfoTool(_input: Record<string, unknown>): Promise<ToolResult> {
  const info = [
    `OS: ${platform()} ${release()}`,
    `Hostname: ${hostname()}`,
    `Arch: ${arch()}`,
    `CPUs: ${cpus().length} cores`,
    `Memory: ${fmtSize(totalmem())} total, ${fmtSize(freemem())} free`,
    `Uptime: ${Math.floor(uptime() / 3600)}h ${Math.floor((uptime() % 3600) / 60)}m`,
    `User: ${userInfo().username}`,
    `CWD: ${ROOT_DIR}`,
    `Node: ${process.version}`,
    `Platform: ${isWindows() ? 'Windows' : 'Unix'}`,
  ];
  return { tool_use_id: '', content: info.join('\n') };
}

async function webGetTool(input: Record<string, unknown>): Promise<ToolResult> {
  const url = String(input.url || '');
  if (!url) return { tool_use_id: '', content: 'Error: No URL provided', is_error: true };

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15_000),
    });
    let text = await resp.text();
    // Strip HTML tags
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 2000) text = text.substring(0, 2000) + '...';
    return {
      tool_use_id: '',
      content: `URL: ${url}\nStatus: ${resp.status}\nContent:\n${text || '(empty)'}`,
    };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error fetching URL: ${e.message}`, is_error: true };
  }
}

async function webSearchTool(input: Record<string, unknown>): Promise<ToolResult> {
  const query = String(input.query || '');
  if (!query) return { tool_use_id: '', content: 'Error: No query provided', is_error: true };

  try {
    // DuckDuckGo HTML search (no API key needed)
    const resp = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ q: query }),
      signal: AbortSignal.timeout(15_000),
    });

    const html = await resp.text();

    // Extract results using regex
    const resultBlocks: string[] = [];
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: Array<{ href: string; title: string }> = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push({
        href: match[1].replace(/&amp;/g, '&'),
        title: match[2].replace(/<[^>]+>/g, '').trim(),
      });
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    for (let i = 0; i < Math.min(links.length, 5); i++) {
      const snippet = i < snippets.length ? `\n   ${snippets[i]}` : '';
      resultBlocks.push(`${i + 1}. [${links[i].title}](${links[i].href})${snippet}`);
    }

    if (resultBlocks.length === 0) {
      return { tool_use_id: '', content: `No results found for "${query}".` };
    }

    return {
      tool_use_id: '',
      content: `## Search: ${query}\n\n${resultBlocks.join('\n\n')}`,
    };
  } catch (e: any) {
    return { tool_use_id: '', content: `Search failed: ${e.message}`, is_error: true };
  }
}

async function gitStatusTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  return { tool_use_id: '', content: execCmd('git status --short', safePath(path)) || '(clean working tree)' };
}

async function gitLogTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  const count = Number(input.count) || 10;
  return { tool_use_id: '', content: execCmd(`git log --max-count=${count} --oneline --graph`, safePath(path)) || '(no commits)' };
}

async function gitDiffTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  return { tool_use_id: '', content: execCmd('git diff', safePath(path)) || '(no changes)' };
}

async function gitBranchesTool(input: Record<string, unknown>): Promise<ToolResult> {
  const path = String(input.path || '.');
  return { tool_use_id: '', content: execCmd('git branch -a', safePath(path)) || '(no branches)' };
}

async function listProcessesTool(_input: Record<string, unknown>): Promise<ToolResult> {
  try {
    const output = execCmd(
      isWindows()
        ? 'tasklist /FO CSV /NH /FI "STATUS eq RUNNING"'
        : 'ps aux --sort=-%cpu | head -30',
    );
    const lines = output.split('\n').slice(0, 30);
    return { tool_use_id: '', content: `Processes (${lines.length}):\n${lines.join('\n')}` };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error: ${e.message}`, is_error: true };
  }
}

async function diskUsageTool(_input: Record<string, unknown>): Promise<ToolResult> {
  try {
    if (isWindows()) {
      const output = execCmd('wmic logicaldisk get size,freespace,caption');
      return { tool_use_id: '', content: output };
    }
    const output = execCmd('df -h /');
    return { tool_use_id: '', content: output };
  } catch (e: any) {
    return { tool_use_id: '', content: `Error: ${e.message}`, is_error: true };
  }
}

async function memoryUsageTool(_input: Record<string, unknown>): Promise<ToolResult> {
  return {
    tool_use_id: '',
    content: [
      `Total: ${fmtSize(totalmem())}`,
      `Free:  ${fmtSize(freemem())}`,
      `Used:  ${fmtSize(totalmem() - freemem())} (${((1 - freemem() / totalmem()) * 100).toFixed(0)}%)`,
    ].join('\n'),
  };
}

async function cpuInfoTool(_input: Record<string, unknown>): Promise<ToolResult> {
  const cpu = cpus();
  return {
    tool_use_id: '',
    content: [
      `Cores: ${cpu.length}`,
      `Model: ${cpu[0]?.model || 'Unknown'}`,
      `Speed: ${cpu[0]?.speed || 0} MHz`,
      `Arch: ${arch()}`,
    ].join('\n'),
  };
}

// ============================================================
// Tool Registry
// ============================================================

export const BUILTIN_TOOLS: ToolDef[] = [
  // File operations (5)
  {
    name: 'read_file', description: '读取文件内容', category: 'file', isConcurrencySafe: true, execute: readFileTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '文件路径' } }, required: ['path'] },
  },
  {
    name: 'write_file', description: '创建或写入文件', category: 'file', isConcurrencySafe: false, execute: writeFileTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '文件路径' }, content: { type: 'string', description: '文件内容' } }, required: ['path', 'content'] },
  },
  {
    name: 'edit_file', description: '替换文件中的文本', category: 'file', isConcurrencySafe: false, execute: editFileTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '文件路径' }, old_text: { type: 'string', description: '被替换的文本' }, new_text: { type: 'string', description: '替换后的文本' } }, required: ['path', 'old_text', 'new_text'] },
  },
  {
    name: 'delete_file', description: '删除文件', category: 'file', isConcurrencySafe: false, execute: deleteFileTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '文件路径' } }, required: ['path'] },
  },
  {
    name: 'list_files', description: '列出目录内容', category: 'file', isConcurrencySafe: true, execute: listFilesTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '目录路径（默认当前目录）' } } },
  },

  // Code analysis (3)
  {
    name: 'grep_search', description: '搜索文件内容', category: 'code', isConcurrencySafe: true, execute: grepSearchTool,
    inputSchema: { type: 'object', properties: { pattern: { type: 'string', description: '搜索模式' }, path: { type: 'string', description: '搜索路径（默认当前目录）' } }, required: ['pattern'] },
  },
  {
    name: 'analyze_python', description: '分析 Python 代码结构（AST 解析）', category: 'code', isConcurrencySafe: true, execute: analyzePythonTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Python 文件路径' } }, required: ['path'] },
  },
  {
    name: 'count_lines', description: '统计代码行数', category: 'code', isConcurrencySafe: true, execute: countLinesTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '文件或目录路径' } } },
  },

  // Shell (2)
  {
    name: 'run_bash', description: '执行 Shell 命令', category: 'shell', isConcurrencySafe: false, execute: runBashTool,
    inputSchema: { type: 'object', properties: { command: { type: 'string', description: '要执行的 Shell 命令' } }, required: ['command'] },
  },
  {
    name: 'system_info', description: '查看系统信息（OS / CPU / 内存等）', category: 'shell', isConcurrencySafe: true, execute: systemInfoTool,
    inputSchema: { type: 'object', properties: {} },
  },

  // Web (2)
  {
    name: 'web_get', description: '获取网页内容', category: 'web', isConcurrencySafe: true, execute: webGetTool,
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: '网页 URL' } }, required: ['url'] },
  },
  {
    name: 'web_search', description: '搜索网络信息', category: 'web', isConcurrencySafe: true, execute: webSearchTool,
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] },
  },

  // Git (4)
  {
    name: 'git_status', description: '查看 Git 工作区状态', category: 'git', isConcurrencySafe: true, execute: gitStatusTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Git 仓库路径' } } },
  },
  {
    name: 'git_log', description: '查看 Git 提交历史', category: 'git', isConcurrencySafe: true, execute: gitLogTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Git 仓库路径' }, count: { type: 'number', description: '显示条数（默认 10）' } } },
  },
  {
    name: 'git_diff', description: '查看 Git 工作区差异', category: 'git', isConcurrencySafe: true, execute: gitDiffTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Git 仓库路径' } } },
  },
  {
    name: 'git_branches', description: '查看 Git 分支列表', category: 'git', isConcurrencySafe: true, execute: gitBranchesTool,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Git 仓库路径' } } },
  },

  // System (5)
  {
    name: 'list_processes', description: '列出当前运行的进程', category: 'system', isConcurrencySafe: true, execute: listProcessesTool,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'disk_usage', description: '查看磁盘使用情况', category: 'system', isConcurrencySafe: true, execute: diskUsageTool,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memory_usage', description: '查看内存使用情况', category: 'system', isConcurrencySafe: true, execute: memoryUsageTool,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cpu_info', description: '查看 CPU 信息', category: 'system', isConcurrencySafe: true, execute: cpuInfoTool,
    inputSchema: { type: 'object', properties: {} },
  },
];

// ============================================================
// Tool Executor
// ============================================================

export class ToolExecutor {
  private tools: Map<string, ToolDef> = new Map();

  constructor(extraTools: ToolDef[] = []) {
    for (const tool of [...BUILTIN_TOOLS, ...extraTools]) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * 注册/覆盖工具
   */
  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 获取所有工具定义（用于 provider tool_use）
   */
  getToolDefinitions(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    }));
  }

  /**
   * 查找工具
   */
  findTool(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  /**
   * 执行单个工具
   */
  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { tool_use_id: '', content: `Error: Unknown tool "${name}"`, is_error: true };
    }
    try {
      return await tool.execute(input);
    } catch (e: any) {
      return { tool_use_id: '', content: `Tool "${name}" execution error: ${e.message}`, is_error: true };
    }
  }

  /**
   * 链式执行工具列表
   * - 并发安全工具并行执行
   * - 写操作串行执行
   */
  async executeChain(calls: Array<{ name: string; input: Record<string, unknown>; id: string }>): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();

    // Partition: concurrent-safe vs sequential
    const safeBatch: typeof calls = [];
    const seqBatch: typeof calls = [];

    for (const call of calls) {
      const tool = this.tools.get(call.name);
      if (tool?.isConcurrencySafe) {
        safeBatch.push(call);
      } else {
        seqBatch.push(call);
      }
    }

    // Run concurrent batch in parallel
    if (safeBatch.length > 0) {
      const promises = safeBatch.map(call =>
        this.execute(call.name, call.input).then(result => {
          results.set(call.id, result);
        }),
      );
      await Promise.all(promises);
    }

    // Run sequential batch one at a time
    for (const call of seqBatch) {
      const result = await this.execute(call.name, call.input);
      results.set(call.id, result);
    }

    return results;
  }
}
