"""Tiny SQLite layer (stdlib only) for documents, feedback, memory & training.

We deliberately avoid an ORM: the schema is small, and stdlib ``sqlite3`` keeps
the client install free of extra native deps.
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

from app.config import settings

_local = threading.local()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def get_conn() -> sqlite3.Connection:
    """One connection per thread (FastAPI runs handlers across a threadpool)."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = _connect()
        _local.conn = conn
    return conn


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT NOT NULL,
    path        TEXT NOT NULL,
    kind        TEXT NOT NULL,           -- pdf | docx | image | text
    topic       TEXT DEFAULT 'general',  -- e.g. microbiology
    chunks      INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'pending',  -- pending | indexed | error
    error       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- Saved conversations (soft-deleted into a 30-day recycle bin).
CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL DEFAULT 'New chat',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    deleted_at  TEXT                       -- NULL = active; set = in recycle bin
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,             -- user | assistant
    content     TEXT NOT NULL,
    sources     TEXT DEFAULT '[]',         -- json list of filenames
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);

CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,
    query       TEXT NOT NULL,
    answer      TEXT NOT NULL,
    verdict     TEXT NOT NULL,           -- accept | reject
    note        TEXT,
    context     TEXT,                    -- retrieved snippets used (json)
    created_at  TEXT DEFAULT (datetime('now'))
);

-- Preference memory: distilled do/don't signals that steer future answers.
CREATE TABLE IF NOT EXISTS memory (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,           -- prefer | avoid
    content     TEXT NOT NULL,
    weight      REAL DEFAULT 1.0,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- Curated pairs queued for the next idle-time QLoRA run.
CREATE TABLE IF NOT EXISTS training_examples (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt      TEXT NOT NULL,
    response    TEXT NOT NULL,
    source      TEXT DEFAULT 'feedback', -- feedback | manual
    used_in_run INTEGER,                 -- FK-ish to training_runs.id
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    status      TEXT DEFAULT 'queued',   -- queued | running | done | error
    n_examples  INTEGER DEFAULT 0,
    adapter_path TEXT,
    log         TEXT,
    started_at  TEXT,
    finished_at TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);
"""


def init_db() -> None:
    settings.ensure_dirs()
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()
