import { useState } from "react";
import HiveMark from "./HiveMark.jsx";
import { EULA_TEXT } from "../lib/eula.js";

// First-run license gate. Shown on Linux/desktop where there is no installer
// wizard to present the EULA. Blocks the app until accepted.
export default function EulaGate({ onAccept }) {
  const [atEnd, setAtEnd] = useState(false);

  function decline() {
    // Best effort: close the desktop window; in a browser just do nothing.
    try { window.close(); } catch {}
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <div className="brand-mark"><HiveMark size={20} /></div>
          <div>
            <div className="brand-name">Haifa HiveMind</div>
            <div className="brand-sub">Haifa Intelligence · License Agreement</div>
          </div>
        </div>

        <div
          className="eula-scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAtEnd(true);
          }}
        >
          <pre>{EULA_TEXT}</pre>
        </div>

        <div className="gate-actions">
          <button className="btn ghost" onClick={decline}>Decline &amp; exit</button>
          <button
            className="btn accent"
            disabled={!atEnd}
            title={atEnd ? "" : "Please scroll through the agreement first"}
            onClick={onAccept}
          >
            {atEnd ? "I Agree" : "Scroll to read…"}
          </button>
        </div>
      </div>
    </div>
  );
}
