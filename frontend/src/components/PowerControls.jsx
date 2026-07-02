import { useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import * as api from "../lib/api.js";

// Single On/Off toggle. On  = all models loaded and ready.
//                        Off = all models unloaded (GPU/VRAM freed).
export default function PowerControls({ onToast, onStateChange }) {
  const [status, setStatus] = useState({ state: "off", vram_mb: 0 });
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

  const on = status.state === "running";
  const working = busy || status.state === "starting";

  async function toggle() {
    setBusy(true);
    try {
      await (on ? api.modelOff() : api.modelOn());
      await refresh();
    } catch (e) {
      onToast?.(e.message || "Action failed", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title"><Cpu size={13} /> AI Engine</div>
      <div className="engine-row">
        <div>
          <div className="engine-state">
            <span className={`dot ${working ? "starting" : on ? "running" : "off"}`} />
            {working ? "Starting…" : on ? "Online" : "Off"}
          </div>
          <div className="vram">
            {status.vram_mb ? `${(status.vram_mb / 1024).toFixed(1)} GB VRAM in use` : "No GPU memory in use"}
          </div>
        </div>
        <button
          className={`switch ${on ? "on" : ""}`}
          disabled={working}
          onClick={toggle}
          aria-label="Toggle AI engine"
          title={on ? "Turn the AI off (frees GPU)" : "Turn the AI on"}
        >
          <span className="knob">{working && <Loader2 size={12} className="spin" />}</span>
        </button>
      </div>
    </div>
  );
}
