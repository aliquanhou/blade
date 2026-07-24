"""Direct API streaming — calls DeepSeek's Anthropic-compatible endpoint."""

import json
from typing import AsyncGenerator
import httpx


async def chat_stream_direct(
    prompt: str,
    system_prompt: str = "You are Blade, a thin-shell AI engineering agent.",
    api_key: str = "",
    model: str = "deepseek-v4-flash",
    base_url: str = "https://api.deepseek.com/v1",
) -> AsyncGenerator[str, None]:
    """Call DeepSeek's Anthropic-compatible /v1/messages endpoint with streaming."""
    if not api_key:
        yield "[Error: No API key configured]"
        return

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    body = {
        "model": model,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "stream": True,
        "max_tokens": 8192,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", f"{base_url}/messages", json=body, headers=headers) as resp:
            if resp.status_code != 200:
                error_text = await resp.aread()
                yield f"[API Error {resp.status_code}: {error_text.decode()}]"
                return

            buffer = ""
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    try:
                        data = json.loads(payload)
                        if data.get("type") == "content_block_delta":
                            delta = data.get("delta", {})
                            text = delta.get("text", "")
                            if text:
                                yield text
                    except json.JSONDecodeError:
                        continue
