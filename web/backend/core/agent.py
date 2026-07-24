"""Blade engine wrapper — translates HTTP requests to Blade CLI calls."""

import asyncio
import json
import os
import subprocess
from typing import AsyncGenerator

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
    try:
        while True:
            chunk = await proc.stdout.read(4096)
            if not chunk:
                break
            yield chunk.decode('utf-8', errors='replace')
    finally:
        proc.stdout.close()
    await proc.wait()

    # Check for errors
    await proc.wait()
    if proc.returncode != 0:
        stderr = (await proc.stderr.read()).decode().strip() if proc.stderr else ""
        if stderr:
            yield f"\n\n[Error: {stderr}]"


def get_available_tools() -> list[dict]:
    """Return list of available tools (static for now)."""
    return [
        {"name": "read_file", "description": "Read file contents", "category": "file"},
        {"name": "write_file", "description": "Write to file", "category": "file"},
        {"name": "glob_search", "description": "Find files by pattern", "category": "file"},
        {"name": "grep_search", "description": "Search file contents", "category": "file"},
        {"name": "run_bash", "description": "Execute shell command", "category": "shell"},
        {"name": "web_fetch", "description": "Fetch URL content", "category": "web"},
        {"name": "web_search", "description": "Search the web", "category": "web"},
        {"name": "ask_user_question", "description": "Ask user for input", "category": "system"},
    ]
