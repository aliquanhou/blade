"""Blade engine wrapper — translates HTTP requests to Blade CLI calls."""

import asyncio
import json
import os
import re
import subprocess
from typing import AsyncGenerator
import httpx

from . import config


def _build_env() -> dict:
    """Build environment variables for the Blade engine."""
    env = os.environ.copy()
    # Ensure Node.js is in PATH
    node_paths = [
        r"c:\Program Files\nodejs",
    ]
    path = env.get("PATH", "")
    for np in node_paths:
        if np not in path:
            path = np + os.pathsep + path
    env["PATH"] = path
    env.setdefault("BLADE_PROVIDER", config.PROVIDER)
    env.setdefault("CLAUDE_CODE_GIT_BASH_PATH", "C:\\Program Files\\Git\\bin\\bash.exe")
    env.setdefault("CLAUDE_CODE_DISABLE_UPDATES", "1")
    env.setdefault("CLAUDE_CODE_SIMPLE", "1")
    if config.API_KEY:
        env.setdefault("DEEPSEEK_API_KEY", config.API_KEY)
        env.setdefault("ANTHROPIC_API_KEY", config.API_KEY)
        env.setdefault("ANTHROPIC_BASE_URL", "https://api.deepseek.com/v1")
    if config.MODEL:
        env.setdefault("CLAUDE_CODE_MODEL", config.MODEL)
    return env


async def chat(prompt: str, system_prompt: str | None = None) -> str:
    """Send a prompt to Blade engine and get the complete response."""
    cmd = [
        "node",
        str(config.BLADE_SCRIPT),
        "-p", prompt,
    ]
    if system_prompt:
        cmd.extend(["--append-system-prompt", system_prompt])
    if config.MODEL:
        cmd.extend(["--model", config.MODEL])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_build_env(),
        cwd=str(config.BLADE_ROOT),
    )

    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

    if proc.returncode != 0:
        error_msg = stderr.decode().strip() or f"Exit code {proc.returncode}"
        raise RuntimeError(f"Blade error: {error_msg}")

    return stdout.decode().strip()


async def chat_stream(prompt: str, system_prompt: str | None = None) -> AsyncGenerator[str, None]:
    """Stream response from Blade engine token by token."""
    cmd = [
        "node",
        str(config.BLADE_SCRIPT),
        "-p", prompt,
    ]
    if system_prompt:
        cmd.extend(["--append-system-prompt", system_prompt])
    if config.MODEL:
        cmd.extend(["--model", config.MODEL])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_build_env(),
        cwd=str(config.BLADE_ROOT),
    )

    # Read STDOUT in chunks — handle UTF-8 safely by reading larger buffers
    assert proc.stdout
    while True:
        chunk = await proc.stdout.read(4096)
        if not chunk:
            break
        yield chunk.decode('utf-8', errors='replace')
    await proc.wait()

    # Check for errors
    await proc.wait()
    if proc.returncode != 0:
        stderr = (await proc.stderr.read()).decode().strip() if proc.stderr else ""
        if stderr:
            yield f"\n\n[Error: {stderr}]"


async def web_search(query: str) -> str:
    """Search the web using DuckDuckGo (no API key needed)."""
    url = "https://html.duckduckgo.com/html/"
    params = {"q": query}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.post(url, data=params, headers=headers)
            resp.encoding = "utf-8"
            html = resp.text

            # Extract search results from HTML (simple regex-based)
            results = []
            # Find result blocks
            blocks = re.findall(
                r'<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>',
                html,
                re.DOTALL,
            )
            snippets = re.findall(
                r'<a[^>]*class="result__snippet"[^>]*>(.*?)</a>',
                html,
                re.DOTALL,
            )

            for i, (href, title) in enumerate(blocks[:5]):
                title_text = re.sub(r"<[^>]+>", "", title).strip()
                snippet_text = ""
                if i < len(snippets):
                    snippet_text = re.sub(r"<[^>]+>", "", snippets[i]).strip()
                results.append(f"{i+1}. [{title_text}]({href})\n   {snippet_text}")

            if not results:
                return f"从 DuckDuckGo 搜索「{query}」未找到结果。"

            return f"## 搜索结果：{query}\n\n" + "\n\n".join(results)

    except Exception as e:
        return f"搜索失败：{e}"


async def web_fetch(url: str) -> str:
    """Fetch and extract text content from a URL."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.encoding = "utf-8"
            text = resp.text
            # Strip HTML tags for a clean view
            text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
            text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            # Truncate to 2000 chars
            if len(text) > 2000:
                text = text[:2000] + "..."
            return text or "(empty content)"
    except Exception as e:
        return f"获取失败：{e}"


def get_available_tools() -> list[dict]:
    """Return list of available tools."""
    return [
        {"name": "read_file", "description": "读取文件内容", "category": "file"},
        {"name": "write_file", "description": "写入文件", "category": "file"},
        {"name": "glob_search", "description": "搜索文件", "category": "file"},
        {"name": "grep_search", "description": "搜索文件内容", "category": "file"},
        {"name": "run_bash", "description": "执行命令", "category": "shell"},
        {"name": "web_fetch", "description": "获取网页内容", "category": "web"},
        {"name": "web_search", "description": "搜索网络", "category": "web"},
        {"name": "ask_user_question", "description": "询问用户", "category": "system"},
    ]
