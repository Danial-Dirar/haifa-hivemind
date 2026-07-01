import { useEffect, useState } from "react";
import { Power, Pause, Play, Cpu, Loader2 } from "lucide-react";
import * as api from "../lib/api.js";

const LABEL = {
  running: "Online",
  paused: "Paused",
  off: "Offline",
  starting: "Starting",
};

export default function PowerControls({ onToast, onStateChange }) {
  const [status, setStatus] = useState({ state: "off", vram_mb: 0, server_up: false });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const s = await api.getModelStatus();
      setStatus(s);
      onStateChange?.(s.state);
    } catch {}
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  async function act(fn, label) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      onToast?.(e.message || `Failed to ${label}`, true);
    } finally {
      setBusy(false);
    }
  }

  const st = status.state;
  return (
    <div className="panel">
      <div className="panel-title"><Cpu size={13} /> AI Engine</div>
      <div className="status-row">
        <span className="status-pill">
          <span className={`dot ${st}`} />
          {LABEL[st] || st}
        </span>
        <span className="vram">
          {status.vram_mb ? `${(status.vram_mb / 1024).toFixed(1)} GB VRAM` : "—"}
        </span>
      </div>
      <div className="power-grid">
        <button
          className={`pbtn on ${st === "running" ? "active" : ""}`}
          disabled={busy || st === "running"}
          onClick={() => act(st === "paused" ? api.modelResume : api.modelOn, "start")}
        >
          {busy && st !== "running" ? <Loader2 size={17} className="spin" /> : <Play size={17} />}
          On
        </button>
        <button
          className={`pbtn pause ${st === "paused" ? "active" : ""}`}
          disabled={busy || st !== "running"}
          onClick={() => act(api.modelPause, "pause")}
        >
          <Pause size={17} /> Pause
        </button>
        <button
          className={`pbtn off ${st === "off" ? "active" : ""}`}
          disabled={busy || st === "off"}
          onClick={() => act(api.modelOff, "stop")}
        >
          <Power size={17} /> Off
        </button>
      </div>
    </div>
  );
}
