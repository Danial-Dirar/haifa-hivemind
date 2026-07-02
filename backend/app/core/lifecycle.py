"""Model lifecycle: ON / PAUSE / OFF so the client can control GPU + RAM use.

  RUNNING  - Ollama server up, chat model resident in VRAM. Instant answers.
  PAUSED   - Ollama server up, model evicted from VRAM. GPU freed; resume in ~2s.
  OFF      - Ollama server process stopped (if we own it). Nothing loaded.

The Electron shell manages *this backend*; this backend manages *Ollama*.
"""
from __future__ import annotations

import asyncio
import shutil
import subprocess
from enum import Enum

from app.config import settings
from app.core.ollama_client import ollama


class ModelState(str, Enum):
    OFF = "off"
    PAUSED = "paused"
    RUNNING = "running"
    STARTING = "starting"


class LifecycleManager:
    def __init__(self) -> None:
        self._proc: subprocess.Popen | None = None  # ollama serve, if we own it
        self._state: ModelState = ModelState.OFF
        self._lock = asyncio.Lock()

    @property
    def owns_server(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    async def _start_server(self) -> None:
        if await ollama.is_up():
            return  # already running (e.g. Ollama tray service on Windows)
        binary = shutil.which("ollama")
        if not binary:
            raise RuntimeError(
                "Ollama is not installed. Run the bundled Ollama installer first."
            )
        self._proc = subprocess.Popen(
            [binary, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(30):  # wait up to ~15s for the server to accept requests
            if await ollama.is_up():
                return
            await asyncio.sleep(0.5)
        raise RuntimeError("Ollama server did not come up in time.")

    async def ensure_server(self) -> None:
        """Start the Ollama server if needed (without loading a model).
        Used by first-run setup so models can be pulled before warming."""
        async with self._lock:
            await self._start_server()

    async def turn_on(self) -> ModelState:
        async with self._lock:
            self._state = ModelState.STARTING
            await self._start_server()
            await ollama.warm(settings.chat_model)
            self._state = ModelState.RUNNING
            return self._state

    async def pause(self) -> ModelState:
        async with self._lock:
            if await ollama.is_up():
                await ollama.unload(settings.chat_model)
                self._state = ModelState.PAUSED
            else:
                self._state = ModelState.OFF
            return self._state

    async def resume(self) -> ModelState:
        return await self.turn_on()

    async def turn_off(self) -> ModelState:
        async with self._lock:
            if await ollama.is_up():
                try:
                    await ollama.unload(settings.chat_model)
                except Exception:
                    pass
            if self.owns_server:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
            self._proc = None
            self._state = ModelState.OFF
            return self._state

    async def status(self) -> dict:
        """Reconcile our tracked state with reality and report VRAM usage."""
        up = await ollama.is_up()
        if not up:
            self._state = ModelState.OFF
        loaded = await ollama.running() if up else []
        chat_loaded = any(
            m.get("name", "").startswith(settings.chat_model.split(":")[0])
            for m in loaded
        )
        if up and self._state not in (ModelState.STARTING,):
            self._state = ModelState.RUNNING if chat_loaded else ModelState.PAUSED

        vram_bytes = sum(m.get("size_vram", 0) for m in loaded)
        return {
            "state": self._state.value,
            "server_up": up,
            "owns_server": self.owns_server,
            "loaded_models": [m.get("name") for m in loaded],
            "vram_mb": round(vram_bytes / (1024 * 1024)),
        }


lifecycle = LifecycleManager()
