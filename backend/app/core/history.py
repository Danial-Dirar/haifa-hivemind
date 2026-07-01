"""Conversation persistence + a 30-day recycle bin.

Chats are never hard-deleted on the user's action — they are *soft*-deleted
(``deleted_at`` set) so they can be recovered from the recycle bin. Anything
sitting in the bin longer than ``TRASH_RETENTION_DAYS`` is purged automatically.
"""
from __future__ import annotations

import json

from app.config import settings
from app.core.db import get_conn, tx

TRASH_RETENTION_DAYS = 30
TITLE_MAXLEN = 60


def create_conversation(title: str = "New chat") -> int:
    title = (title or "New chat").strip()[:TITLE_MAXLEN] or "New chat"
    with tx() as conn:
        cur = conn.execute("INSERT INTO conversations (title) VALUES (?)", (title,))
        return cur.lastrowid


def rename_conversation(conv_id: int, title: str) -> None:
    with tx() as conn:
        conn.execute(
            "UPDATE conversations SET title=?, updated_at=datetime('now') WHERE id=?",
            (title.strip()[:TITLE_MAXLEN] or "New chat", conv_id),
        )


def add_message(
    conv_id: int,
    role: str,
    content: str,
    sources: list[str] | None = None,
    images: list[str] | None = None,
) -> int:
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO chat_messages (conversation_id, role, content, sources, images)"
            " VALUES (?,?,?,?,?)",
            (conv_id, role, content, json.dumps(sources or []), json.dumps(images or [])),
        )
        conn.execute(
            "UPDATE conversations SET updated_at=datetime('now') WHERE id=?", (conv_id,)
        )
        return cur.lastrowid


def list_conversations() -> list[dict]:
    rows = get_conn().execute(
        "SELECT c.id, c.title, c.updated_at, "
        "  (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id=c.id) AS messages "
        "FROM conversations c WHERE c.deleted_at IS NULL "
        "ORDER BY c.updated_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_messages(conv_id: int) -> list[dict]:
    rows = get_conn().execute(
        "SELECT id, role, content, sources, images, created_at FROM chat_messages "
        "WHERE conversation_id=? ORDER BY id ASC",
        (conv_id,),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["sources"] = json.loads(d.get("sources") or "[]")
        d["images"] = json.loads(d.get("images") or "[]")
        out.append(d)
    return out


def search_conversations(q: str, limit: int = 20) -> list[dict]:
    """Full-text-ish search over active chats: title OR any message content.

    Returns each matching conversation once, with a short snippet of the first
    message that matched (so the user sees *why* it matched).
    """
    q = (q or "").strip()
    if not q:
        return []
    like = f"%{q}%"
    rows = get_conn().execute(
        "SELECT c.id, c.title, c.updated_at, "
        "  (SELECT m.content FROM chat_messages m "
        "     WHERE m.conversation_id=c.id AND m.content LIKE ? "
        "     ORDER BY m.id LIMIT 1) AS snippet "
        "FROM conversations c "
        "WHERE c.deleted_at IS NULL AND ("
        "  c.title LIKE ? OR EXISTS ("
        "    SELECT 1 FROM chat_messages m WHERE m.conversation_id=c.id AND m.content LIKE ?"
        "  )) "
        "ORDER BY c.updated_at DESC LIMIT ?",
        (like, like, like, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def soft_delete(conv_id: int) -> None:
    with tx() as conn:
        conn.execute(
            "UPDATE conversations SET deleted_at=datetime('now') WHERE id=?", (conv_id,)
        )


def restore(conv_id: int) -> None:
    with tx() as conn:
        conn.execute(
            "UPDATE conversations SET deleted_at=NULL, updated_at=datetime('now') WHERE id=?",
            (conv_id,),
        )


def list_trash() -> list[dict]:
    """Deleted chats still within the retention window, with days remaining."""
    purge_expired()
    rows = get_conn().execute(
        "SELECT id, title, deleted_at, "
        f"  CAST({TRASH_RETENTION_DAYS} - (julianday('now') - julianday(deleted_at)) AS INT) AS days_left "
        "FROM conversations WHERE deleted_at IS NOT NULL "
        "ORDER BY deleted_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def _image_files_for(conn, conv_ids: list[int]) -> list[str]:
    """Collect every chat-image filename belonging to the given conversations."""
    if not conv_ids:
        return []
    ph = ",".join("?" for _ in conv_ids)
    rows = conn.execute(
        f"SELECT images FROM chat_messages WHERE conversation_id IN ({ph})",
        tuple(conv_ids),
    ).fetchall()
    files: list[str] = []
    for r in rows:
        files.extend(json.loads(r["images"] or "[]"))
    return files


def _unlink_images(files: list[str]) -> None:
    for fn in files:
        try:
            (settings.chat_images_dir / fn).unlink(missing_ok=True)
        except Exception:
            pass


def purge_expired() -> int:
    """Hard-delete bin items older than the retention window (rows + image files)."""
    cond = (
        "deleted_at IS NOT NULL "
        f"AND julianday('now') - julianday(deleted_at) > {TRASH_RETENTION_DAYS}"
    )
    with tx() as conn:
        ids = [r["id"] for r in conn.execute(f"SELECT id FROM conversations WHERE {cond}")]
        files = _image_files_for(conn, ids)
        n = conn.execute(f"DELETE FROM conversations WHERE {cond}").rowcount
    _unlink_images(files)  # after commit, so a DB failure never orphans deletes
    return n


def purge_now(conv_id: int) -> None:
    """Permanently delete a single chat from the recycle bin (rows + image files)."""
    with tx() as conn:
        files = _image_files_for(conn, [conv_id])
        deleted = conn.execute(
            "DELETE FROM conversations WHERE id=? AND deleted_at IS NOT NULL", (conv_id,)
        ).rowcount
    if deleted:
        _unlink_images(files)
