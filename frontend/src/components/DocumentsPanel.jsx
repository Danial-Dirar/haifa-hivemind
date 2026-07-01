import { useEffect, useRef, useState } from "react";
import { FileText, Image, FileType, Trash2, UploadCloud, Library } from "lucide-react";
import * as api from "../lib/api.js";

const KIND_ICON = { pdf: FileText, docx: FileType, image: Image, text: FileText };

export default function DocumentsPanel({ onToast }) {
  const [docs, setDocs] = useState([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  async function refresh() {
    try {
      setDocs(await api.listDocuments());
    } catch {}
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000); // reflect background indexing
    return () => clearInterval(t);
  }, []);

  async function upload(files) {
    for (const f of files) {
      try {
        await api.uploadDocument(f);
        onToast?.(`Ingesting ${f.name}…`);
      } catch (e) {
        onToast?.(e.message || "Upload failed", true);
      }
    }
    refresh();
  }

  return (
    <div className="panel">
      <div className="panel-title"><Library size={13} /> Knowledge Library</div>
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload([...e.dataTransfer.files]);
        }}
      >
        <UploadCloud size={20} style={{ marginBottom: 6, opacity: 0.7 }} />
        <div>Drop papers, DOCX, PDF or screenshots</div>
        <div className="muted" style={{ marginTop: 3 }}>or click to browse</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
        onChange={(e) => upload([...e.target.files])}
      />

      <div style={{ marginTop: 12 }}>
        {docs.length === 0 && <div className="muted">No documents yet.</div>}
        {docs.map((d) => {
          const Icon = KIND_ICON[d.kind] || FileText;
          return (
            <div className="doc" key={d.id} title={d.error || d.filename}>
              <Icon size={15} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
              <span className="doc-name">{d.filename}</span>
              <span className={`doc-status ${d.status}`}>
                {d.status === "indexed" ? `${d.chunks}` : d.status}
              </span>
              <button
                className="icon-btn"
                onClick={async () => {
                  await api.deleteDocument(d.id);
                  refresh();
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
