"""Haifa HiveMind backend — FastAPI app.

Runs entirely on the client's machine (localhost). The Electron desktop shell
(and, later, a mobile app on the LAN) are the only clients.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api import chat, conversations, documents, feedback, model, training
from app.config import settings
from app.core import history
from app.core.db import init_db
from app.core.ollama_client import ollama


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    init_db()
    history.purge_expired()  # clear recycle-bin items older than 30 days
    yield


settings.ensure_dirs()  # must exist before mounting static dirs below

app = FastAPI(title="Haifa HiveMind", version=__version__, lifespan=lifespan)

# Desktop shell loads from file:// or a dev server; allow local origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # localhost-only server; safe for a single-user app
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(model.router)
app.include_router(documents.router)
app.include_router(conversations.router)
app.include_router(chat.router)
app.include_router(feedback.router)
app.include_router(training.router)

# Serve images that were sent inside chats (for reloading saved conversations).
app.mount(
    "/chat-images",
    StaticFiles(directory=str(settings.chat_images_dir)),
    name="chat-images",
)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "version": __version__,
        "ollama_up": await ollama.is_up(),
        "chat_model": settings.chat_model,
    }


# In a packaged build the compiled frontend is copied here and served directly,
# so the whole product is one process. Ignored during development.
_web = Path(__file__).resolve().parent.parent / "web"
if _web.is_dir():
    app.mount("/", StaticFiles(directory=str(_web), html=True), name="web")
