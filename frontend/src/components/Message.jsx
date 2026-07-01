import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, X, RefreshCw } from "lucide-react";

export default function Message({ msg, onAccept, onReject }) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const isUser = msg.role === "user";
  const fb = msg.feedback;

  function submitReject(withNote) {
    onReject?.(msg, withNote ? note.trim() : "");
    setShowNote(false);
    setNote("");
  }

  return (
    <div className="msg">
      <div className={`avatar ${isUser ? "user" : "ai"}`}>{isUser ? "You" : "HM"}</div>
      <div className="bubble">
        <div className="role">{isUser ? "You" : "Haifa HiveMind"}</div>

        {msg.images?.length > 0 && (
          <div className="thumbs" style={{ margin: "0 0 8px" }}>
            {msg.images.map((src, i) => (
              <div className="thumb" key={i}><img src={src} alt="" /></div>
            ))}
          </div>
        )}

        <div className="content">
          {isUser ? (
            <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
          ) : (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ""}</ReactMarkdown>
              {msg.streaming && <span className="cursor" />}
            </>
          )}
        </div>

        {!isUser && msg.sources?.length > 0 && (
          <div className="sources">
            {msg.sources.map((s) => <span className="chip" key={s}>{s}</span>)}
          </div>
        )}

        {!isUser && !msg.streaming && msg.content && (
          <>
            <div className="feedback">
              <button
                className={`fbtn accept ${fb === "accept" ? "done" : ""}`}
                disabled={!!fb}
                onClick={() => onAccept?.(msg)}
              >
                <Check size={14} /> {fb === "accept" ? "Approved" : "Good"}
              </button>
              <button
                className={`fbtn reject ${fb === "reject" ? "done" : ""}`}
                disabled={fb === "accept"}
                onClick={() => setShowNote((v) => !v)}
              >
                <X size={14} /> Not what I wanted
              </button>
              {fb === "accept" && <span className="fb-hint">Saved for fine-tuning</span>}
            </div>

            {showNote && (
              <div className="note-box">
                <div className="muted" style={{ marginBottom: 6 }}>
                  Optional — tell it what you actually expected, so it learns:
                </div>
                <textarea
                  autoFocus
                  value={note}
                  placeholder="e.g. I wanted the growth conditions, not the taxonomy…"
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="note-actions">
                  <button className="btn accent" onClick={() => submitReject(true)}>
                    <RefreshCw size={14} /> Submit & rethink
                  </button>
                  <button className="btn ghost" onClick={() => submitReject(false)}>
                    Just rethink
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
