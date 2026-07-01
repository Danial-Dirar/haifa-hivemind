"""Idle-time QLoRA fine-tune — the slow, durable half of the learning loop.

Flow:
  1. Collect accepted (prompt, response) pairs the client hasn't trained on yet.
  2. Write a JSONL SFT dataset.
  3. QLoRA fine-tune (4-bit) on the GPU — runs only when the client asks or the
     machine is idle, so it never fights the chat model for VRAM.
  4. Register the adapter with Ollama via a Modelfile so future chats use it.

Heavy deps (torch/peft/trl/bitsandbytes) are imported lazily and are NOT part
of the base runtime. Install them with ``requirements-train.txt`` on the GPU box.

NOTE (scope honesty): fine-tuning the *vision* tower of Qwen2.5-VL is a large
undertaking. This pipeline fine-tunes the language behaviour on text Q&A pairs
— which is where the client's feedback signal actually lives — and is designed
so the vision path can be added in a later phase without changing the API.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime
from pathlib import Path

from app.config import settings
from app.core.db import get_conn, tx

MIN_EXAMPLES = 20  # don't bother training on fewer than this


def collect_pending() -> list[dict]:
    rows = get_conn().execute(
        "SELECT id, prompt, response FROM training_examples WHERE used_in_run IS NULL"
    ).fetchall()
    return [dict(r) for r in rows]


def _write_dataset(examples: list[dict], run_id: int) -> Path:
    path = settings.training_dir / f"run_{run_id}.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for ex in examples:
            f.write(
                json.dumps(
                    {
                        "messages": [
                            {"role": "user", "content": ex["prompt"]},
                            {"role": "assistant", "content": ex["response"]},
                        ]
                    }
                )
                + "\n"
            )
    return path


def _register_with_ollama(adapter_dir: Path) -> None:
    """Build a new Ollama model tag that layers the LoRA adapter on the base."""
    modelfile = adapter_dir / "Modelfile"
    modelfile.write_text(
        f"FROM {settings.chat_model}\nADAPTER {adapter_dir}\n", encoding="utf-8"
    )
    subprocess.run(
        ["ollama", "create", settings.adapter_model_tag, "-f", str(modelfile)],
        check=True,
    )


def start_run() -> dict:
    """Create a queued training run and return its record (does not train yet)."""
    pending = collect_pending()
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO training_runs (status, n_examples) VALUES ('queued', ?)",
            (len(pending),),
        )
        run_id = cur.lastrowid
    return {"run_id": run_id, "n_examples": len(pending), "min_required": MIN_EXAMPLES}


def run_training(run_id: int) -> None:
    """Execute a queued run. Blocking + GPU-heavy — call from a worker thread."""
    examples = collect_pending()
    ids = [e["id"] for e in examples]

    def _fail(msg: str) -> None:
        with tx() as conn:
            conn.execute(
                "UPDATE training_runs SET status='error', log=?, finished_at=? WHERE id=?",
                (msg, datetime.utcnow().isoformat(), run_id),
            )

    if len(examples) < MIN_EXAMPLES:
        _fail(f"Not enough examples ({len(examples)} < {MIN_EXAMPLES}).")
        return

    with tx() as conn:
        conn.execute(
            "UPDATE training_runs SET status='running', started_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), run_id),
        )

    try:
        dataset_path = _write_dataset(examples, run_id)
        adapter_dir = settings.training_dir / f"adapter_run_{run_id}"
        _train_qlora(dataset_path, adapter_dir)  # heavy; lazy imports inside
        _register_with_ollama(adapter_dir)

        placeholders = ",".join("?" for _ in ids)
        with tx() as conn:
            conn.execute(
                f"UPDATE training_examples SET used_in_run=? WHERE id IN ({placeholders})",
                (run_id, *ids),
            )
            conn.execute(
                "UPDATE training_runs SET status='done', adapter_path=?, finished_at=? WHERE id=?",
                (str(adapter_dir), datetime.utcnow().isoformat(), run_id),
            )
    except Exception as exc:  # noqa: BLE001
        _fail(f"{type(exc).__name__}: {exc}")


def _train_qlora(dataset_path: Path, adapter_dir: Path) -> None:
    """Actual 4-bit QLoRA SFT. Requires requirements-train.txt on a CUDA box."""
    try:
        import torch
        from datasets import load_dataset
        from peft import LoraConfig
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
        )
        from trl import SFTConfig, SFTTrainer
    except ImportError as exc:  # pragma: no cover - depends on optional deps
        raise RuntimeError(
            "Training deps missing. On the GPU box run: "
            "pip install -r requirements-train.txt"
        ) from exc

    # Base HF weights for the language backbone (configurable via env).
    base_id = "Qwen/Qwen2.5-7B-Instruct"

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(base_id)
    model = AutoModelForCausalLM.from_pretrained(
        base_id, quantization_config=bnb, device_map="auto"
    )
    lora = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        task_type="CAUSAL_LM",
    )
    dataset = load_dataset("json", data_files=str(dataset_path), split="train")

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=lora,
        processing_class=tokenizer,
        args=SFTConfig(
            output_dir=str(adapter_dir),
            per_device_train_batch_size=1,
            gradient_accumulation_steps=8,
            num_train_epochs=2,
            learning_rate=2e-4,
            bf16=True,
            logging_steps=5,
            save_strategy="no",
        ),
    )
    trainer.train()
    trainer.model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
