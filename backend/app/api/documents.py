"""Document upload & library management.

The client drops PDF / DOCX / images here; ingestion runs in the background so
the UI stays responsive while big papers are parsed and embedded.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.config import settings
from app.core import ingest, vectorstore
from app.core.db import get_conn, tx

router = APIRouter(prefix="/documents", tags=["documents"])


async def _run_ingest(doc_id: int, path: Path, kind: str, topic: str) -> None:
    try:
        await ingest.ingest_document(doc_id, path, kind, topic)
    except Exception:
        pass  # error is persisted on the document row by ingest_document


@router.post("")
async def upload(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    topic: str = Form("microbiology"),
) -> dict:
    filename = file.filename or "upload"
    ext = Path(filename).suffix
    stored = settings.upload_dir / f"{uuid.uuid4().hex}{ext}"
    stored.write_bytes(await file.read())

    kind = ingest.detect_kind(stored)
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO documents (filename, path, kind, topic) VALUES (?,?,?,?)",
            (filename, str(stored), kind, topic),
        )
        doc_id = cur.lastrowid

    background.add_task(_run_ingest, doc_id, stored, kind, topic)
    return {"id": doc_id, "filename": filename, "kind": kind, "status": "pending"}


@router.get("")
async def list_documents() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, filename, kind, topic, chunks, status, error, created_at "
        "FROM documents ORDER BY id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


@router.delete("/{doc_id}")
async def delete_document(doc_id: int) -> dict:
    conn = get_conn()
    row = conn.execute(
        "SELECT path FROM documents WHERE id=?", (doc_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    vectorstore.delete_doc(doc_id)
    try:
        Path(row["path"]).unlink(missing_ok=True)
    except Exception:
        pass
    with tx() as conn:
        conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
    return {"deleted": doc_id}


@router.get("/stats/summary")
async def stats() -> dict:
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) c FROM documents").fetchone()["c"]
    indexed = conn.execute(
        "SELECT COUNT(*) c FROM documents WHERE status='indexed'"
    ).fetchone()["c"]
    return {"documents": total, "indexed": indexed, "chunks": vectorstore.count()}
