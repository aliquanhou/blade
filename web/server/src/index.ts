#!/usr/bin/env bun
/**
 * ⚔️ Blade HTTP+SSE Server
 *
 * 纯 Node.js HTTP 服务器，进程中加载 QueryEngine。
 * 替代原有的 Python FastAPI 后端。
 *
 * API 端点：
 *   POST /api/chat/stream  — SSE 流式聊天（核心）
 *   GET  /api/health       — 健康检查
 *   GET  /api/tools        — 工具列表
 *   POST /api/tools/execute — 直接执行工具
 *   GET  /api/settings     — 获取配置
 *   POST /api/settings     — 更新配置
 *   GET  /api/files/*      — 文件读取
 *   PUT  /api/files/*      — 文件写入
 *   *  静态文件服务（前端 dist/）
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, extname, join, dirname, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { QueryEngine, BUILTIN_TOOLS } from '../../../src/engine/index.js';
import type { SSEEvent, EngineConfig } from '../../../src/engine/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const FRONTEND_DIST = resolve(ROOT, 'web', 'frontend', 'dist');

// ============================================================
// Config
// ============================================================

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Session store (in-memory engines)
const sessions = new Map<string, QueryEngine>();

// ============================================================
// Neural Log System — 记录 AI 每一个工作细节
// ============================================================

interface LogEntry {
  id: number;
  ts: string;
  type: 'system' | 'api' | 'tool' | 'sse' | 'error' | 'state';
  session: string;
  message: string;
  detail?: any;
  duration?: number;
}

const MAX_LOGS = 5000;
const logs: LogEntry[] = [];
let logId = 0;

function addLog(type: LogEntry['type'], session: string, message: string, detail?: any, duration?: number): void {
  logs.push({ id: ++logId, ts: new Date().toISOString(), type, session, message, detail, duration });
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
}

function handleGetLogs(req: Request): Response {
  const url = new URL(req.url);
  const tail = parseInt(url.searchParams.get('tail') || '200', 10);
  const typeFilter = url.searchParams.get('type') || '';
  let result = logs;
  if (typeFilter) result = logs.filter(l => l.type === typeFilter);
  result = result.slice(-tail);
  return new Response(JSON.stringify({ logs: result, total: logs.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
// ============================================================

interface SessionMeta {
  id: string;
  title: string;
  created: string;
  updated: string;
}

const DATA_DIR = resolve(ROOT, 'data', 'sessions');
const SESSIONS_FILE = resolve(DATA_DIR, 'sessions.json');

function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

function loadSessionList(): SessionMeta[] {
  ensureDataDir();
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch { return []; }
}

function saveSessionList(list: SessionMeta[]): void {
  ensureDataDir();
  writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function loadMessages(sessionId: string): any[] {
  ensureDataDir();
  try {
    return JSON.parse(readFileSync(resolve(DATA_DIR, `${sessionId}.json`), 'utf-8'));
  } catch { return []; }
}

function saveMessages(sessionId: string, msgs: any[]): void {
  ensureDataDir();
  writeFileSync(resolve(DATA_DIR, `${sessionId}.json`), JSON.stringify(msgs, null, 2), 'utf-8');
}

function getOrCreateSession(sessionId: string): QueryEngine {
  let engine = sessions.get(sessionId);
  if (!engine) {
    engine = new QueryEngine({
      provider: process.env.BLADE_PROVIDER,
      model: process.env.BLADE_MODEL,
      apiKey: process.env.BLADE_API_KEY,
      baseUrl: process.env.BLADE_BASE_URL,
    });
    // 恢复历史消息到引擎（先消毒，清除孤儿 tool 消息）
    const history = sanitizeMessages(loadMessages(sessionId));
    if (history.length > 0) {
      for (const msg of history) {
        (engine as any).messages?.push(msg);
      }
    }
    sessions.set(sessionId, engine);
  }
  return engine;
}

/**
 * 消毒消息列表：移除孤儿 tool 消息（没有前驱 assistant tool_calls 的 tool result）
 * DeepSeek API 严格要求每个 tool 消息前面必须有对应的 tool_calls
 */
function sanitizeMessages(msgs: any[]): any[] {
  const result: any[] = [];
  let pendingToolCalls = 0; // 当前期待的 tool result 数量
  for (const msg of msgs) {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      pendingToolCalls = msg.tool_calls.length;
      result.push(msg);
    } else if (msg.role === 'tool') {
      if (pendingToolCalls > 0) {
        pendingToolCalls--;
        result.push(msg);
      } else {
        addLog('error', 'sanitize', `Dropped orphaned tool message: ${msg.name || 'unknown'}`);
      }
    } else {
      result.push(msg);
    }
  }
  return result;
}

// ============================================================
// MIME Types
// ============================================================

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ts': 'application/javascript; charset=utf-8', // for source maps
  '.map': 'application/json',
};

// ============================================================
// Static File Server
// ============================================================

function serveStatic(urlPath: string): Response | null {
  // Normalize path, prevent directory traversal
  let filePath = resolve(FRONTEND_DIST, '.' + urlPath);
  if (!filePath.startsWith(FRONTEND_DIST)) {
    return null;
  }

  // Try exact file
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath);
    const content = readFileSync(filePath);
    return new Response(content, {
      headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
    });
  }

  // For SPA: serve index.html for non-file paths
  const indexPath = resolve(FRONTEND_DIST, 'index.html');
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath, 'utf-8');
    return new Response(content, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return null;
}

// ============================================================
// SSE Handler
// ============================================================

async function handleChatStream(req: Request): Promise<Response> {
  const body: { prompt?: string; session_id?: string } = await req.json().catch(() => ({}));
  const prompt = body.prompt || '';
  const sessionId = body.session_id || 'default';

  if (!prompt) {
    addLog('state', sessionId, '空提示拒绝');
    return new Response(JSON.stringify({ error: 'empty prompt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  addLog('sse', sessionId, `Chat stream start: "${prompt.slice(0, 50)}..."`);
  const engine = getOrCreateSession(sessionId);
  const streamStart = Date.now();

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let eventCount = 0;

      try {
        for await (const event of engine.chat(prompt)) {
          eventCount++;
          if (event.type === 'tool_use') {
            addLog('tool', sessionId, `Tool call: ${event.name}`, event.input);
          } else if (event.type === 'tool_result') {
            const detail = event.content ? event.content.slice(0, 150) : '';
            addLog('tool', sessionId, `Tool result: ${event.name || ''}`, detail);
          } else if (event.type === 'token') {
            addLog('sse', sessionId, `Token: ${(event.content || '').length} chars`);
          } else if (event.type === 'error') {
            addLog('error', sessionId, `Stream error: ${event.error}`);
          } else if (event.type === 'done') {
            addLog('sse', sessionId, `Stream done (stop_reason: ${event.stop_reason || 'unknown'})`, null, Date.now() - streamStart);
          }
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        addLog('sse', sessionId, `Stream complete: ${eventCount} events`, null, Date.now() - streamStart);
      } catch (e: any) {
        addLog('error', sessionId, `Stream exception: ${e.message}`);
        const errorEvent: SSEEvent = { type: 'error', error: e.message };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
        // 持久化：保存引擎当前消息历史
        try {
          const msgs = (engine as any).messages;
          if (msgs) {
            saveMessages(sessionId, msgs);
            addLog('state', sessionId, `Messages persisted: ${msgs.length} msgs`);
          }
        } catch { addLog('error', sessionId, 'Failed to persist messages'); }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ============================================================
// API Handlers
// ============================================================

function handleHealth(): Response {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      version: '1.0.0',
      provider: process.env.BLADE_PROVIDER || 'auto',
      model: process.env.BLADE_MODEL || 'auto',
      sessions: sessions.size,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

function handleListTools(): Response {
  const tools = BUILTIN_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    isConcurrencySafe: t.isConcurrencySafe,
  }));
  return new Response(JSON.stringify({ tools }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleToolExecute(req: Request): Promise<Response> {
  const body: { name?: string; params?: Record<string, unknown>; session_id?: string } =
    await req.json().catch(() => ({}));
  const toolName = body.name || '';
  const params = body.params || {};

  if (!toolName) {
    return new Response(JSON.stringify({ error: 'No tool name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const engine = getOrCreateSession(body.session_id || 'default');

  // We'll use a fresh engine just for tool execution
  const toolExecutor = BUILTIN_TOOLS;
  const tool = toolExecutor.find(t => t.name === toolName);
  if (!tool) {
    return new Response(JSON.stringify({ error: `Unknown tool: ${toolName}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await tool.execute(params);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function handleGetSettings(): Response {
  return new Response(
    JSON.stringify({
      provider: process.env.BLADE_PROVIDER || 'auto',
      model: process.env.BLADE_MODEL || '',
      baseUrl: process.env.BLADE_BASE_URL || '',
      nodeVersion: process.version,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

async function handleUpdateSettings(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body.provider) process.env.BLADE_PROVIDER = body.provider;
  if (body.model) process.env.BLADE_MODEL = body.model;
  if (body.apiKey) process.env.BLADE_API_KEY = body.apiKey;
  if (body.baseUrl) process.env.BLADE_BASE_URL = body.baseUrl;

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleListSessions(): Response {
  const list = loadSessionList();
  return new Response(JSON.stringify({ sessions: list }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleCreateSession(req: Request): Promise<Response> {
  const body: { title?: string } = await req.json().catch(() => ({}));
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const session: SessionMeta = {
    id,
    title: body.title || '新会话',
    created: now,
    updated: now,
  };
  const list = loadSessionList();
  list.unshift(session);
  saveSessionList(list);
  addLog('state', id, `Session created: "${session.title}"`);
  return new Response(JSON.stringify(session), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleGetSessionMessages(sessionId: string): Response {
  const msgs = loadMessages(sessionId);
  return new Response(JSON.stringify({ messages: msgs, sessionId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleDeleteSession(sessionId: string): Response {
  sessions.delete(sessionId);
  // 删除文件
  const list = loadSessionList().filter(s => s.id !== sessionId);
  saveSessionList(list);
  try { writeFileSync(resolve(DATA_DIR, `${sessionId}.json`), '[]'); } catch {}
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleReadFile(path: string): Response {
  const safePath = resolve(ROOT, '.' + path);
  if (!safePath.startsWith(ROOT)) {
    return new Response(JSON.stringify({ error: 'Path not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!existsSync(safePath)) {
    return new Response(JSON.stringify({ error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const content = readFileSync(safePath, 'utf-8');
  const size = statSync(safePath).size;
  return new Response(
    JSON.stringify({ path, content, size }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

async function handleWriteFile(path: string, req: Request): Promise<Response> {
  const safePath = resolve(ROOT, '.' + path);
  if (!safePath.startsWith(ROOT)) {
    return new Response(JSON.stringify({ error: 'Path not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const body = await req.json().catch(() => ({}));
  const content = body.content || '';
  mkdirSync(dirname(safePath), { recursive: true });
  writeFileSync(safePath, content, 'utf-8');
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================
// Router
// ============================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname, searchParams } = url;
  const method = req.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // API Routes
  let response: Response | null = null;

  try {
    if (pathname === '/api/health' && method === 'GET') {
      response = handleHealth();
    } else if (pathname === '/api/chat/stream' && method === 'POST') {
      response = await handleChatStream(req);
    } else if (pathname === '/api/tools' && method === 'GET') {
      response = handleListTools();
    } else if (pathname === '/api/tools/execute' && method === 'POST') {
      response = await handleToolExecute(req);
    } else if (pathname === '/api/settings' && method === 'GET') {
      response = handleGetSettings();
    } else if (pathname === '/api/settings' && method === 'POST') {
      response = await handleUpdateSettings(req);
    } else if (pathname === '/api/sessions' && method === 'GET') {
      response = handleListSessions();
    } else if (pathname === '/api/sessions' && method === 'POST') {
      response = await handleCreateSession(req);
    } else if (pathname.startsWith('/api/sessions/') && pathname.endsWith('/messages') && method === 'GET') {
      const id = pathname.replace('/api/sessions/', '').replace('/messages', '');
      response = handleGetSessionMessages(id);
    } else if (pathname.startsWith('/api/sessions/') && method === 'DELETE') {
      const id = pathname.replace('/api/sessions/', '');
      response = handleDeleteSession(id);
    } else if (pathname.startsWith('/api/files/') && method === 'GET') {
      const filePath = pathname.replace('/api/files', '');
      response = handleReadFile(filePath);
    } else if (pathname.startsWith('/api/files/') && method === 'PUT') {
      const filePath = pathname.replace('/api/files', '');
      response = await handleWriteFile(filePath, req);
    } else if (pathname === '/api/logs' && method === 'GET') {
      response = handleGetLogs(req);
    } else if (pathname === '/api' || pathname === '/api/') {
      response = new Response(
        JSON.stringify({ name: 'Blade API', version: '1.0.0' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }
  } catch (e: any) {
    response = new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  if (response) {
    // Apply CORS headers
    const respHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
    return new Response(response.body, {
      status: response.status,
      headers: respHeaders,
    });
  }

  // Static files (SPA)
  const staticResponse = serveStatic(pathname);
  if (staticResponse) {
    return staticResponse;
  }

  // 404
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ============================================================
// Server Startup
// ============================================================

console.log('');
console.log('  ⚔️  Blade Server');
console.log(`  ─${'─'.repeat(40)}`);
console.log(`  Port:     ${PORT}`);
console.log(`  Provider: ${process.env.BLADE_PROVIDER || 'auto'}`);
console.log(`  Model:    ${process.env.BLADE_MODEL || 'auto'}`);
console.log(`  Frontend: ${existsSync(FRONTEND_DIST) ? FRONTEND_DIST : 'not built'}`);
console.log(`  CWD:      ${ROOT}`);
console.log('');
console.log(`  http://localhost:${PORT}`);
console.log(`  Ctrl+C to stop`);
console.log('');

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: handleRequest,
});
