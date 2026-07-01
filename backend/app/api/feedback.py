"""Feedback loop — the reinforcement signal.

  accept (check)  -> queued as a positive pair for the next QLoRA run;
                     optional note becomes a 'prefer' memory signal.
  reject (cross)  -> optional note becomes an 'avoid' memory signal, and the
                     UI is told it may ask the model to reconsider / clarify.
"""
from __future__ import annotations

import json

from fastapi import APIRouter
from pydantic import BaseModel

from app.core import memory
from app.core.db import tx

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackIn(BaseModel):
    session_id: str = "default"
    query: str
    answer: str
    verdict: str  # "accept" | "reject"
    note: str | None = None
    context: list[str] | None = None


@router.post("")
async def submit(fb: FeedbackIn) -> dict:
    with tx() as conn:
        conn.execute(
            "INSERT INTO feedback (session_id, query, answer, verdict, note, context)"
            " VALUES (?,?,?,?,?,?)",
            (
                fb.session_id,
                fb.query,
                fb.answer,
                fb.verdict,
                fb.note,
                json.dumps(fb.context or []),
            ),
        )

    should_reconsider = False
    if fb.verdict == "accept":
        with tx() as conn:
            conn.execute(
                "INSERT INTO training_examples (prompt, response, source)"
                " VALUES (?,?,'feedback')",
                (fb.query, fb.answer),
            )
        if fb.note:
            memory.add_signal("prefer", fb.note, weight=1.5)
    elif fb.verdict == "reject":
        if fb.note:
            memory.add_signal("avoid", fb.note, weight=1.5)
        should_reconsider = True

    return {"ok": True, "reconsider": should_reconsider}


@router.get("/pending-training")
async def pending_training() -> dict:
    from app.core.db import get_conn

    n = get_conn().execute(
        "SELECT COUNT(*) c FROM training_examples WHERE used_in_run IS NULL"
    ).fetchone()["c"]
    return {"pending_examples": n}
