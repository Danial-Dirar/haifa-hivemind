"""Async wrapper around the local Ollama HTTP API.

Ollama is our model server: it loads Qwen2.5-VL into VRAM, streams chat, and
computes embeddings. We talk to it over localhost only.
"""
from __future__ import annotations

import base64
import json
from typing import AsyncIterator

import httpx

from app.config import settings


class OllamaClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.ollama_url).rstrip("/")

    async def is_up(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as c:
                r = await c.get(f"{self.base_url}/api/version")
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(f"{self.base_url}/api/tags")
            r.raise_for_status()
            return r.json().get("models", [])

    async def running(self) -> list[dict]:
        """Models currently loaded in VRAM (via /api/ps)."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                r = await c.get(f"{self.base_url}/api/ps")
                r.raise_for_status()
                return r.json().get("models", [])
        except Exception:
            return []

    async def embed(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=60.0) as c:
            r = await c.post(
                f"{self.base_url}/api/embeddings",
                json={"model": settings.embed_model, "prompt": text},
            )
            r.raise_for_status()
            return r.json()["embedding"]

    async def warm(self, model: str) -> None:
        """Load a model into VRAM and pin it there (keep_alive = -1)."""
        async with httpx.AsyncClient(timeout=120.0) as c:
            await c.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": "",
                    "keep_alive": settings.keep_alive_running,
                },
            )

    async def unload(self, model: str) -> None:
        """Evict a model from VRAM immediately (keep_alive = 0) -> frees GPU."""
        async with httpx.AsyncClient(timeout=30.0) as c:
            await c.post(
                f"{self.base_url}/api/generate",
                json={"model": model, "prompt": "", "keep_alive": 0},
            )

    async def chat_stream(
        self,
        model: str,
        messages: list[dict],
        images: list[bytes] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a chat completion token-by-token.

        ``images`` (raw bytes) are attached to the final user message so the
        vision model can read dropped screenshots.
        """
        payload_messages = [dict(m) for m in messages]
        if images:
            payload_messages[-1]["images"] = [
                base64.b64encode(img).decode() for img in images
            ]

        async with httpx.AsyncClient(timeout=None) as c:
            async with c.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": payload_messages,
                    "stream": True,
                    "keep_alive": settings.keep_alive_running,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    chunk = data.get("message", {}).get("content", "")
                    if chunk:
                        yield chunk
                    if data.get("done"):
                        break


ollama = OllamaClient()
