"""Blade Web — FastAPI backend server."""

import asyncio
import json
import os
import re
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

import sys
sys.path.insert(0, str(Path(__file__).parent))

from core import config
from core.agent import chat, chat_stream, get_available_tools, web_search, web_fetch
from core.direct_stream import chat_stream_direct

app = FastAPI(title="Blade Web", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    prompt: str
    system_prompt: str | None = None
    model: str | None = None
    session_id: str | None = None

class FileWriteRequest(BaseModel):
    path: str
    content: str

class ToolExecuteRequest(BaseModel):
    name: str
    params: dict[str, Any] = {}

class SettingsUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    apiKey: str | None = None


def _check_path(path: str) -> Path:
    target = (config.BLADE_ROOT / path).resolve()
    if not any(str(target).startswith(d) for d in config.WORK_DIRS):
        raise HTTPException(403, "Path not allowed")
    return target


# ── Health ────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "provider": config.PROVIDER,
        "model": config.MODEL or "auto",
    }


# ── Chat ──────────────────────────────────────────────────────
# In-memory conversation history per session
chat_history: dict[str, list[dict]] = {}

BLADE_SYSPROMPT = """You are Blade, a thin-shell AI engineering agent.
You are not associated with Anthropic or Claude.
State your name as Blade when asked. Keep responses concise.

You have web search capability! When the user asks you to search for something,
you will receive the search results from the backend automatically in your context.
Read them and provide a helpful summary to the user based on those results."""


def build_prompt_with_history(session_id: str, new_prompt: str) -> str:
    """Build a prompt that includes conversation history."""
    history = chat_history.get(session_id, [])
    if not history:
        return new_prompt

    # Build context from history
    context_parts = ["## 对话历史\n"]
    for msg in history[-10:]:  # Last 10 messages for context
        role = "用户" if msg["role"] == "user" else "Blade"
        context_parts.append(f"{role}: {msg['content']}")
    context_parts.append(f"\n## 当前消息\n用户: {new_prompt}")
    context_parts.append("\n请基于以上对话历史回复。")
    return "\n".join(context_parts)


@app.post("/api/chat")
async def chat_sync(req: ChatRequest):
    system = req.system_prompt or BLADE_SYSPROMPT
    session_id = req.session_id or "default"
    try:
        prompt = build_prompt_with_history(session_id, req.prompt)
        result = await chat(prompt, system)
        # Save to history
        if session_id not in chat_history:
            chat_history[session_id] = []
        chat_history[session_id].append({"role": "user", "content": req.prompt})
        chat_history[session_id].append({"role": "assistant", "content": result})
        return {"response": result}
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))


@app.post("/api/chat/stream")
async def chat_sse(req: ChatRequest):
    """Stream chat response — with conversation history and auto web search."""
    base_system = req.system_prompt or BLADE_SYSPROMPT
    session_id = req.session_id or "default"

    async def event_stream():
        yield f"data: {json.dumps({'type': 'start'}, ensure_ascii=False)}\n\n"
        try:
            prompt = req.prompt
            system_prompt = base_system

            # Build prompt with history
            prompt = build_prompt_with_history(session_id, prompt)

            # Auto web search
            prompt_lower = prompt.lower()
            search_keywords = ['搜索', '搜一下', '查一下', '查找', 'search', 'find', '新闻', '热点', 'news', 'trending']
            if any(kw in prompt_lower for kw in search_keywords):
                from core.agent import web_search
                query = re.sub(r'^(搜索|搜一下|查一下|查找|search|find)\s*', '', req.prompt, flags=re.IGNORECASE)
                query = re.sub(r'[？?。！!，,]', '', query).strip() or req.prompt
                search_result = await web_search(query)
                yield f"data: {json.dumps({'type': 'token', 'text': '## 搜索结果\n\n'}, ensure_ascii=False)}\n\n"
                for i in range(0, len(search_result), 4):
                    yield f"data: {json.dumps({'type': 'token', 'text': search_result[i:i+4]}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
                # Save search to history
                if session_id not in chat_history:
                    chat_history[session_id] = []
                chat_history[session_id].append({"role": "user", "content": req.prompt})
                chat_history[session_id].append({"role": "assistant", "content": f"[搜索: {query}]"})
                return

            # Normal chat
            full_response = ""
            async for chunk in chat_stream(prompt, system_prompt):
                full_response += chunk
                for i in range(0, len(chunk), 3):
                    yield f"data: {json.dumps({'type': 'token', 'text': chunk[i:i+3]}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

            # Save to history
            if session_id not in chat_history:
                chat_history[session_id] = []
            chat_history[session_id].append({"role": "user", "content": req.prompt})
            chat_history[session_id].append({"role": "assistant", "content": full_response})

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── Tools ─────────────────────────────────────────────────────

@app.get("/api/tools")
async def list_tools():
    return {"tools": get_available_tools()}


@app.post("/api/tools/execute")
async def execute_tool(req: ToolExecuteRequest):
    """Execute a tool (via subprocess for shell, or mock for demo)."""
    params = req.params or {}
    if req.name == "run_bash":
        cmd = params.get("command", "")
        if not cmd:
            return {"result": "No command provided", "exit_code": 1}
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: subprocess.run(
                ["cmd", "/c", cmd],
                capture_output=True, text=True, timeout=30,
                cwd=str(config.BLADE_ROOT),
            ))
            return {
                "result": (result.stdout.strip() or result.stderr.strip()) or "(empty output)",
                "exit_code": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {"result": "Command timed out", "exit_code": -1}
        except Exception as e:
            return {"result": f"Error: {e}", "exit_code": -1}
    elif req.name == "web_search":
        query = params.get("query", params.get("command", ""))
        if not query:
            return {"result": "No search query", "exit_code": 1}
        result = await web_search(query)
        return {"result": result, "exit_code": 0}
    elif req.name == "web_fetch":
        url = params.get("url", params.get("command", ""))
        if not url:
            return {"result": "No URL", "exit_code": 1}
        result = await web_fetch(url)
        return {"result": result, "exit_code": 0}
    else:
        return {"result": f"Tool '{req.name}' executed (mock)", "exit_code": 0}


# ── Files ─────────────────────────────────────────────────────

@app.get("/api/files")
async def list_files(path: str = "."):
    target = _check_path(path)
    if not target.is_dir():
        raise HTTPException(400, "Not a directory")
    entries = []
    for entry in sorted(target.iterdir()):
        try:
            st = entry.stat()
            entries.append({
                "name": entry.name,
                "path": str(entry.relative_to(config.BLADE_ROOT)),
                "is_dir": entry.is_dir(),
                "size": st.st_size,
                "modified": datetime.fromtimestamp(st.st_mtime).isoformat(),
            })
        except OSError:
            continue
    return {"path": str(target), "entries": entries}


@app.get("/api/files/{path:path}")
async def read_file(path: str):
    target = _check_path(path)
    if not target.is_file():
        raise HTTPException(404, "File not found")
    content = target.read_text(encoding="utf-8", errors="replace")
    return {"path": path, "name": target.name, "size": target.stat().st_size, "content": content}


@app.put("/api/files/{path:path}")
async def write_file(path: str, req: FileWriteRequest):
    target = _check_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(req.content, encoding="utf-8")
    return {"status": "saved", "path": path}


# ── Settings ──────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings():
    return {
        "provider": config.PROVIDER,
        "model": config.MODEL or "auto",
        "hasApiKey": bool(config.API_KEY),
        "workDir": str(config.BLADE_ROOT),
    }


@app.post("/api/settings")
async def save_settings(req: SettingsUpdate):
    if req.provider:
        os.environ["BLADE_PROVIDER"] = req.provider
    if req.model:
        os.environ["CLAUDE_CODE_MODEL"] = req.model
    if req.apiKey:
        os.environ["DEEPSEEK_API_KEY"] = req.apiKey
        os.environ["ANTHROPIC_API_KEY"] = req.apiKey
    return {"status": "saved"}


# ── Sessions ──────────────────────────────────────────────────

SESSIONS: list[dict] = []

@app.get("/api/sessions")
async def list_sessions():
    return {"sessions": SESSIONS}


@app.post("/api/sessions")
async def create_session():
    session = {"id": str(len(SESSIONS) + 1), "title": f"Session {len(SESSIONS) + 1}", "created": datetime.now().isoformat()}
    SESSIONS.append(session)
    return session


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    global SESSIONS
    SESSIONS = [s for s in SESSIONS if s["id"] != session_id]
    return {"status": "deleted"}


# ── Frontend ──────────────────────────────────────────────────

@app.get("/")
async def index():
    idx = Path(__file__).parent / "static" / "index.html"
    if idx.exists():
        return FileResponse(str(idx))
    return {"message": "Blade Web API ready — build frontend with: cd web/frontend && npm run dev"}
