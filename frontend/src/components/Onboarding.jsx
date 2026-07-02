import { useEffect, useRef, useState } from "react";
import { Loader2, Download, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import HiveMark from "./HiveMark.jsx";
import * as api from "../lib/api.js";

// First-run setup: makes the app usable with no manual steps — it downloads the
// required AI models automatically (with a progress bar). If Ollama isn't
// installed yet, it guides the one-time install, then continues on its own.
export default function Onboarding({ onReady }) {
  const [phase, setPhase] = useState("checking"); // checking|need_ollama|downloading|error
  const [label, setLabel] = useState("Checking your setup…");
  const [model, setModel] = useState("");
  const [pct, setPct] = useState(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  async function check() {
    setPhase("checking");
    setLabel("Checking your setup…");
    try {
      const s = await api.getSetupStatus();
      if (s.ready) return onReady();
      if (!s.ollama_installed) return setPhase("need_ollama");
      startPull();
    } catch {
      setError("Couldn't reach the local engine. Please restart the app.");
      setPhase("error");
    }
  }

  function startPull() {
    setPhase("downloading");
    setLabel("Downloading the AI models — this happens only once.");
    api
      .streamSetupPull((evt) => {
        if (evt.type === "model_start") { setModel(evt.model); setPct(0); }
        else if (evt.type === "progress") {
          if (evt.total) setPct(Math.round((evt.completed / evt.total) * 100));
          if (evt.status) setLabel(evt.status);
        } else if (evt.type === "model_done") { setModel(evt.model); setPct(100); }
        else if (evt.type === "error") {
          if (evt.need_ollama) return setPhase("need_ollama");
          setError(evt.detail || "Download failed."); setPhase("error");
        } else if (evt.type === "done") { onReady(); }
      })
      .catch((e) => { setError(e.message); setPhase("error"); });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    check();
  }, []);

  const shortModel = model.split(":")[0];

  return (
    <div className="gate">
      <div className="gate-card onboarding">
        <div className="onb-mark"><HiveMark size={34} /></div>
        <div className="onb-title">Setting up Haifa HiveMind</div>
        <div className="brand-sub" style={{ textAlign: "center", marginBottom: 22 }}>
          Haifa Intelligence
        </div>

        {phase === "checking" && (
          <div className="onb-body">
            <Loader2 className="spin" size={22} />
            <div>{label}</div>
          </div>
        )}

        {phase === "downloading" && (
          <div className="onb-body">
            <div className="onb-row">
              <Download size={18} style={{ color: "var(--accent)" }} />
              <span>{shortModel ? `Downloading ${shortModel}` : "Preparing…"}</span>
              {pct != null && <span className="onb-pct">{pct}%</span>}
            </div>
            <div className="onb-bar"><div className="onb-fill" style={{ width: `${pct ?? 8}%` }} /></div>
            <div className="muted" style={{ marginTop: 4 }}>{label}</div>
            <div className="muted">First-time download (~6 GB). Please keep the app open.</div>
          </div>
        )}

        {phase === "need_ollama" && (
          <div className="onb-body">
            <AlertTriangle size={22} style={{ color: "var(--accent)" }} />
            <div style={{ textAlign: "center" }}>
              One quick one-time step: install <b>Ollama</b> (the local AI engine),
              then we'll take care of the rest automatically.
            </div>
            <a className="btn accent" href="https://ollama.com/download" target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Get Ollama
            </a>
            <button className="btn ghost" onClick={check}>I've installed it — continue</button>
          </div>
        )}

        {phase === "error" && (
          <div className="onb-body">
            <AlertTriangle size={22} style={{ color: "var(--red)" }} />
            <div style={{ textAlign: "center", color: "var(--red)" }}>{error}</div>
            <button className="btn accent" onClick={check}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
