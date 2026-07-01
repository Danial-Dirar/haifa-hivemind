"""Conversation history + recycle bin endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core import history

router = APIRouter(prefix="/conversations", tags=["conversations"])


class CreateIn(BaseModel):
    title: str = "New chat"


class RenameIn(BaseModel):
    title: str


@router.get("")
async def list_all() -> list[dict]:
    return history.list_conversations()


@router.post("")
async def create(body: CreateIn) -> dict:
    cid = history.create_conversation(body.title)
    return {"id": cid, "title": body.title}


@router.get("/search")
async def search(q: str = "") -> list[dict]:
    return history.search_conversations(q)


@router.get("/trash")
async def trash() -> list[dict]:
    return history.list_trash()


@router.get("/{conv_id}")
async def get_one(conv_id: int) -> dict:
    msgs = history.get_messages(conv_id)
    return {"id": conv_id, "messages": msgs}


@router.patch("/{conv_id}")
async def rename(conv_id: int, body: RenameIn) -> dict:
    history.rename_conversation(conv_id, body.title)
    return {"ok": True}


@router.delete("/{conv_id}")
async def delete(conv_id: int) -> dict:
    """Soft-delete -> moves to the 30-day recycle bin."""
    history.soft_delete(conv_id)
    return {"ok": True, "recoverable": True}


@router.post("/{conv_id}/restore")
async def restore(conv_id: int) -> dict:
    history.restore(conv_id)
    return {"ok": True}


@router.delete("/{conv_id}/purge")
async def purge(conv_id: int) -> dict:
    """Permanently delete from the recycle bin (no recovery)."""
    history.purge_now(conv_id)
    return {"ok": True}
