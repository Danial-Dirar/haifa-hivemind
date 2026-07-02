"""Central configuration for the Haifa HiveMind backend.

All values can be overridden via environment variables (prefix ``HIVEMIND_``)
or a ``.env`` file. Defaults are tuned for the client's box: a single NVIDIA
GPU with ~16 GB VRAM running Qwen2.5-VL 7B via Ollama.
"""
from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

# Where user data lives. In a packaged app the install folder is read-only
# (Program Files on Windows, the read-only AppImage mount on Linux), so the
# Electron shell passes HIVEMIND_DATA_DIR pointing at a writable per-user path.
# In development it falls back to backend/data.
DEFAULT_DATA_DIR = Path(os.environ.get("HIVEMIND_DATA_DIR", str(BASE_DIR / "data")))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="HIVEMIND_", env_file=".env", extra="ignore"
    )

    # --- Server ---------------------------------------------------------
    host: str = "127.0.0.1"
    port: int = 8756  # uncommon port so it won't clash on the client PC

    # --- Ollama ---------------------------------------------------------
    ollama_url: str = "http://127.0.0.1:11434"
    # Multimodal model: handles microbiology text AND dropped screenshots.
    chat_model: str = "qwen2.5vl:7b"
    # Lightweight embedding model for RAG retrieval.
    embed_model: str = "nomic-embed-text"
    # Keep-alive when RUNNING (-1 = stay resident in VRAM until we unload).
    # MUST be an int: Ollama rejects the bare string "-1" (invalid duration) -> 400.
    keep_alive_running: int = -1

    # --- RAG ------------------------------------------------------------
    collection_name: str = "hivemind_docs"
    chunk_size: int = 1200          # characters per chunk
    chunk_overlap: int = 200
    retrieve_top_k: int = 6

    # --- Storage (root; all subpaths derive from it) --------------------
    data_dir: Path = DEFAULT_DATA_DIR

    # --- Adapter (LoRA) -------------------------------------------------
    # When a fine-tuned adapter exists, Ollama serves this model tag instead.
    adapter_model_tag: str = "qwen2.5vl-haifa"

    # --- Derived writable paths ----------------------------------------
    @property
    def chroma_dir(self) -> Path:
        return self.data_dir / "chroma"

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def training_dir(self) -> Path:
        return self.data_dir / "training"

    @property
    def chat_images_dir(self) -> Path:
        return self.data_dir / "chat_images"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "hivemind.db"

    def ensure_dirs(self) -> None:
        for p in (self.chroma_dir, self.upload_dir, self.training_dir, self.chat_images_dir):
            p.mkdir(parents=True, exist_ok=True)


settings = Settings()
