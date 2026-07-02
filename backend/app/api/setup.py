"""First-run setup — make the app usable with zero manual steps.

Checks whether Ollama and the required models are present, and streams the model
download so the onboarding screen can show a live progress bar. Models go to
Ollama's own store, so there's no directory management for the user to do.
"""
from __future__ import annotations

import json
import shutil

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import settings
from app.core.lifecycle import lifecycle
from app.core.ollama_client import ollama

router = APIRouter(prefix="/setup", tags=["setup"])


def _required() -> list[str]:
    return [settings.chat_model, settings.embed_model]


def _has(name: str, present_names: list[str]) -> bool:
    base = name.split(":")[0]
    return any(n == name or n.startswith(base) for n in present_names)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.get("/status")
async def status() -> dict:
    up = await ollama.is_up()
    installed = up or shutil.which("ollama") is not None
    names: list[str] = []
    if up:
        try:
            names = [m.get("name", "") for m in await ollama.list_models()]
        except Exception:
            names = []
    models = {req: _has(req, names) for req in _required()}
    return {
        "ollama_installed": installed,
        "ollama_running": up,
        "models": models,
        "ready": up and all(models.values()),
        "required": _required(),
    }


@router.post("/pull")
async def pull():
    """Stream the download of any missing models (Server-Sent Events)."""

    async def gen():
        # Make sure the Ollama server is up so we can pull.
        try:
            await lifecycle.ensure_server()
        except RuntimeError as exc:
            yield _sse({"type": "error", "detail": str(exc), "need_ollama": True})
            return

        try:
            names = [m.get("name", "") for m in await ollama.list_models()]
        except Exception:
            names = []

        for req in _required():
            if _has(req, names):
                yield _sse({"type": "model_done", "model": req, "skipped": True})
                continue
            yield _sse({"type": "model_start", "model": req})
            try:
                async for prog in ollama.pull_stream(req):
                    yield _sse({
                        "type": "progress",
                        "model": req,
                        "status": prog.get("status"),
                        "completed": prog.get("completed"),
                        "total": prog.get("total"),
                    })
            except Exception as exc:  # noqa: BLE001
                yield _sse({"type": "error", "model": req, "detail": str(exc)})
                return
            yield _sse({"type": "model_done", "model": req})

        yield _sse({"type": "done"})

    return StreamingResponse(gen(), media_type="text/event-stream")
