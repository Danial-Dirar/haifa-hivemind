"""Retrieval + prompt assembly for grounded, cited answers."""
from __future__ import annotations

from app.config import settings
from app.core import vectorstore
from app.core.memory import get_memory_block
from app.core.ollama_client import ollama

SYSTEM_BASE = (
    "You are Haifa HiveMind, a private research assistant built by Haifa "
    "Intelligence. You specialise in microbiology research papers, and also "
    "handle general documents the user has provided.\n"
    "Rules:\n"
    "1. Answer ONLY from the provided context and the conversation. If the "
    "context is insufficient, say so plainly and ask a focused clarifying "
    "question instead of guessing.\n"
    "2. Cite sources inline as [filename] when you use them.\n"
    "3. Be precise with scientific terms, units, strains, and methods.\n"
    "4. Reply in the SAME language the user writes in. If they write in Bengali "
    "(বাংলা) or romanized Bengali/Banglish, reply naturally in Bengali. Keep "
    "scientific/technical terms in English where that is standard.\n"
)

RECONSIDER_NOTE = (
    "\nIMPORTANT: Your previous answer was rejected by the user. Do NOT repeat "
    "it. Either (a) answer from a clearly different angle, or (b) if the "
    "request is ambiguous, ask ONE specific clarifying question to find out "
    "what they actually need."
)


async def retrieve(query: str, topic: str | None = None) -> list[dict]:
    embedding = await ollama.embed(query)
    return vectorstore.query(embedding, settings.retrieve_top_k, topic)


def _context_block(chunks: list[dict]) -> str:
    if not chunks:
        return "(no relevant documents found)"
    out = []
    for c in chunks:
        fn = c["meta"].get("filename", "doc")
        out.append(f"[{fn}]\n{c['text']}")
    return "\n\n---\n\n".join(out)


def build_messages(
    query: str,
    chunks: list[dict],
    history: list[dict] | None = None,
    reconsider: bool = False,
) -> list[dict]:
    system = SYSTEM_BASE
    mem = get_memory_block()
    if mem:
        system += "\nLearned preferences:\n" + mem
    if reconsider:
        system += RECONSIDER_NOTE

    context = _context_block(chunks)
    messages: list[dict] = [{"role": "system", "content": system}]
    if history:
        messages += history[-6:]  # keep recent turns for continuity
    messages.append(
        {
            "role": "user",
            "content": f"Context from the document library:\n{context}\n\n"
            f"Question: {query}",
        }
    )
    return messages
