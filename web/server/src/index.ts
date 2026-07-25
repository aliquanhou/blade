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

// Session store (in-memory)
const sessions = new Map<string, QueryEngine>();

function getOrCreateSession(sessionId: string): QueryEngine {
  let engine = sessions.get(sessionId);
  if (!engine) {
    engine = new QueryEngine({
      provider: process.env.BLADE_PROVIDER,
      model: process.env.BLADE_MODEL,
      apiKey: process.env.BLADE_API_KEY,
      baseUrl: process.env.BLADE_BASE_URL,
    });
    sessions.set(sessionId, engine);
  }
  return engine;
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
    return new Response(JSON.stringify({ error: 'empty prompt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const engine = getOrCreateSession(sessionId);

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of engine.chat(prompt)) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (e: any) {
        const errorEvent: SSEEvent = { type: 'error', error: e.message };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
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

function handleListSessions(): Response {
  const sessionList = Array.from(sessions.keys()).map(id => ({
    id,
    created: 'recent',
  }));
  return new Response(JSON.stringify({ sessions: sessionList }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleDeleteSession(sessionId: string): Response {
  sessions.delete(sessionId);
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
    } else if (pathname.startsWith('/api/sessions/') && method === 'DELETE') {
      const id = pathname.replace('/api/sessions/', '');
      response = handleDeleteSession(id);
    } else if (pathname.startsWith('/api/files/') && method === 'GET') {
      const filePath = pathname.replace('/api/files', '');
      response = handleReadFile(filePath);
    } else if (pathname.startsWith('/api/files/') && method === 'PUT') {
      const filePath = pathname.replace('/api/files', '');
      response = await handleWriteFile(filePath, req);
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
