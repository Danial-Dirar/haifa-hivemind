"""Training controls — trigger and monitor idle-time QLoRA runs."""
from __future__ import annotations

import threading

from fastapi import APIRouter, HTTPException

from app.core.db import get_conn
from app.training import lora

router = APIRouter(prefix="/training", tags=["training"])

_worker: threading.Thread | None = None


@router.get("/status")
async def status() -> dict:
    conn = get_conn()
    last = conn.execute(
        "SELECT id, status, n_examples, started_at, finished_at, log "
        "FROM training_runs ORDER BY id DESC LIMIT 1"
    ).fetchone()
    pending = conn.execute(
        "SELECT COUNT(*) c FROM training_examples WHERE used_in_run IS NULL"
    ).fetchone()["c"]
    running = _worker is not None and _worker.is_alive()
    return {
        "pending_examples": pending,
        "min_required": lora.MIN_EXAMPLES,
        "busy": running,
        "last_run": dict(last) if last else None,
    }


@router.post("/run")
async def run() -> dict:
    global _worker
    if _worker is not None and _worker.is_alive():
        raise HTTPException(status_code=409, detail="A training run is already active.")

    info = lora.start_run()
    if info["n_examples"] < info["min_required"]:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least {info['min_required']} accepted answers to train "
            f"(have {info['n_examples']}). Keep using and approving answers.",
        )

    _worker = threading.Thread(
        target=lora.run_training, args=(info["run_id"],), daemon=True
    )
    _worker.start()
    return {"started": True, **info}
