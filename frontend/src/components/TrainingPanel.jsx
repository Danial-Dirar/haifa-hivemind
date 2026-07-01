import { useEffect, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import * as api from "../lib/api.js";

export default function TrainingPanel({ onToast }) {
  const [st, setSt] = useState(null);

  async function refresh() {
    try {
      setSt(await api.trainingStatus());
    } catch {}
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const pending = st?.pending_examples ?? 0;
  const need = st?.min_required ?? 20;
  const ready = pending >= need;
  const busy = st?.busy;

  async function train() {
    try {
      await api.runTraining();
      onToast?.("Fine-tune started — runs in the background.");
      refresh();
    } catch (e) {
      onToast?.(e.message || "Could not start training", true);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title"><Brain size={13} /> Self-Improvement</div>
      <div className="stat-line"><span>Approved answers</span><span>{pending} / {need}</span></div>
      {st?.last_run && (
        <div className="stat-line">
          <span>Last fine-tune</span>
          <span style={{ textTransform: "capitalize" }}>{st.last_run.status}</span>
        </div>
      )}
      <button
        className="btn accent block"
        style={{ marginTop: 10 }}
        disabled={!ready || busy}
        onClick={train}
      >
        {busy ? <><Loader2 size={15} className="spin" /> Training…</> : "Fine-tune now"}
      </button>
      <div className="muted" style={{ marginTop: 8 }}>
        {busy
          ? "Learning from your approved answers."
          : ready
          ? "Enough feedback collected — safe to run when the PC is idle."
          : `Approve ${need - pending} more good answers to unlock.`}
      </div>
    </div>
  );
}
