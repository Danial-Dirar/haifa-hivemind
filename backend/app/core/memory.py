"""Preference memory — the lightweight, instant half of the learning loop.

When the client accepts/rejects an answer we distill short do/don't signals.
These are injected into the system prompt so behaviour shifts immediately,
without waiting for the (slow) QLoRA fine-tune.
"""
from __future__ import annotations

from app.core.db import get_conn, tx

MAX_SIGNALS_IN_PROMPT = 8


def add_signal(kind: str, content: str, weight: float = 1.0) -> None:
    content = content.strip()
    if not content:
        return
    with tx() as conn:
        conn.execute(
            "INSERT INTO memory (kind, content, weight) VALUES (?, ?, ?)",
            (kind, content, weight),
        )


def get_memory_block() -> str:
    conn = get_conn()
    rows = conn.execute(
        "SELECT kind, content FROM memory ORDER BY weight DESC, id DESC LIMIT ?",
        (MAX_SIGNALS_IN_PROMPT,),
    ).fetchall()
    if not rows:
        return ""
    prefer = [r["content"] for r in rows if r["kind"] == "prefer"]
    avoid = [r["content"] for r in rows if r["kind"] == "avoid"]
    lines: list[str] = []
    if prefer:
        lines.append("The user prefers answers that:")
        lines += [f"  - {p}" for p in prefer]
    if avoid:
        lines.append("Avoid the following (past answers were rejected for this):")
        lines += [f"  - {a}" for a in avoid]
    return "\n".join(lines)
