"""Streaming chat endpoint (grounded RAG + optional image input).

Request is multipart/form-data so screenshots can ride along with the question.
Response is Server-Sent Events: first a ``sources`` frame, then ``token``
frames, then ``done``.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.core import history as chat_history
from app.core import rag
from app.core.ollama_client import ollama


def _save_chat_images(images_data: list[bytes], filenames: list[str]) -> list[str]:
    """Persist chat images to disk; return stored filenames for the history."""
    stored: list[str] = []
    for data, name in zip(images_data, filenames):
        ext = Path(name or "").suffix or ".png"
        fn = f"{uuid.uuid4().hex}{ext}"
        (settings.chat_images_dir / fn).write_bytes(data)
        stored.append(fn)
    return stored

router = APIRouter(prefix="/chat", tags=["chat"])


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("")
async def chat(
    query: str = Form(...),
    session_id: str = Form("default"),
    conversation_id: int | None = Form(None),
    topic: str = Form(""),
    reconsider: bool = Form(False),
    history: str = Form("[]"),
    images: list[UploadFile] = File(default=[]),
):
    if not await ollama.is_up():
        raise HTTPException(
            status_code=409,
            detail="AI is OFF. Press the power button to turn it on first.",
        )

    try:
        hist = json.loads(history) if history else []
    except json.JSONDecodeError:
        hist = []

    image_bytes = [await img.read() for img in images] if images else []
    image_names = [img.filename or "" for img in images] if images else []

    chunks = await rag.retrieve(query, topic or None)
    messages = rag.build_messages(query, chunks, hist, reconsider=reconsider)
    sources = sorted({c["meta"].get("filename", "doc") for c in chunks})

    # Persist the conversation. A reconsider re-answers the same question, so we
    # don't store the user turn again in that case.
    conv_id = conversation_id
    new_conv = False
    if conv_id is None:
        conv_id = chat_history.create_conversation(query)
        new_conv = True
    if not reconsider:
        stored_images = _save_chat_images(image_bytes, image_names)
        chat_history.add_message(conv_id, "user", query, [], stored_images)

    async def gen():
        yield _sse({"type": "conversation", "id": conv_id, "new": new_conv})
        yield _sse({"type": "sources", "sources": sources})
        collected: list[str] = []
        try:
            async for tok in ollama.chat_stream(
                settings.chat_model, messages, images=image_bytes
            ):
                collected.append(tok)
                yield _sse({"type": "token", "text": tok})
        except Exception as exc:  # noqa: BLE001
            yield _sse({"type": "error", "detail": str(exc)})
        answer = "".join(collected).strip()
        if answer:
            chat_history.add_message(conv_id, "assistant", answer, sources)
        yield _sse({"type": "done"})

    return StreamingResponse(gen(), media_type="text/event-stream")
