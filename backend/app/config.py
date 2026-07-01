"""Central configuration for the Haifa HiveMind backend.

All values can be overridden via environment variables (prefix ``HIVEMIND_``)
or a ``.env`` file. Defaults are tuned for the client's box: a single NVIDIA
GPU with ~16 GB VRAM running Qwen2.5-VL 7B via Ollama.
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = BASE_DIR / "data"


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
    chroma_dir: Path = DATA_DIR / "chroma"
    collection_name: str = "hivemind_docs"
    chunk_size: int = 1200          # characters per chunk
    chunk_overlap: int = 200
    retrieve_top_k: int = 6

    # --- Storage --------------------------------------------------------
    upload_dir: Path = DATA_DIR / "uploads"
    training_dir: Path = DATA_DIR / "training"
    chat_images_dir: Path = DATA_DIR / "chat_images"  # images sent inside chats
    db_path: Path = DATA_DIR / "hivemind.db"

    # --- Adapter (LoRA) -------------------------------------------------
    # When a fine-tuned adapter exists, Ollama serves this model tag instead.
    adapter_model_tag: str = "qwen2.5vl-haifa"

    def ensure_dirs(self) -> None:
        for p in (self.chroma_dir, self.upload_dir, self.training_dir, self.chat_images_dir):
            p.mkdir(parents=True, exist_ok=True)


settings = Settings()
