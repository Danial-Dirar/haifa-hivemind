"""ChromaDB persistent vector store. We supply embeddings ourselves (via
Ollama's ``nomic-embed-text``), so Chroma runs with no embedding model of its
own — keeping the client install lean.
"""
from __future__ import annotations

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings

_client = chromadb.PersistentClient(
    path=str(settings.chroma_dir),
    settings=ChromaSettings(anonymized_telemetry=False, allow_reset=True),
)

_collection = _client.get_or_create_collection(
    name=settings.collection_name,
    embedding_function=None,          # we pass embeddings explicitly
    metadata={"hnsw:space": "cosine"},
)


def add_chunks(
    doc_id: int,
    chunks: list[str],
    embeddings: list[list[float]],
    topic: str,
    filename: str,
) -> None:
    ids = [f"{doc_id}:{i}" for i in range(len(chunks))]
    metadatas = [
        {"doc_id": doc_id, "chunk": i, "topic": topic, "filename": filename}
        for i in range(len(chunks))
    ]
    _collection.add(
        ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas
    )


def query(embedding: list[float], top_k: int, topic: str | None = None) -> list[dict]:
    where = {"topic": topic} if topic else None
    res = _collection.query(
        query_embeddings=[embedding], n_results=top_k, where=where
    )
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    return [
        {"text": d, "meta": m, "distance": dist}
        for d, m, dist in zip(docs, metas, dists)
    ]


def delete_doc(doc_id: int) -> None:
    _collection.delete(where={"doc_id": doc_id})


def count() -> int:
    return _collection.count()
