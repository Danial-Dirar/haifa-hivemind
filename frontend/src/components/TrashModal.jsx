import { useEffect, useState } from "react";
import { Trash, X, RotateCcw, Trash2 } from "lucide-react";
import * as api from "../lib/api.js";

export default function TrashModal({ onClose, onChanged, onToast }) {
  const [items, setItems] = useState([]);

  async function refresh() {
    try {
      setItems(await api.listTrash());
    } catch (e) {
      onToast?.(e.message, true);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function restore(id) {
    await api.restoreConversation(id);
    onToast?.("Chat restored.");
    await refresh();
    onChanged?.();
  }
  async function purge(id) {
    await api.purgeConversation(id);
    await refresh();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><Trash size={16} /> Recycle Bin</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="muted" style={{ marginBottom: 10 }}>
            Deleted chats are kept for 30 days, then removed automatically.
          </div>
          {items.length === 0 && <div className="muted">The recycle bin is empty.</div>}
          {items.map((it) => (
            <div className="trash-row" key={it.id}>
              <span className="t-title">{it.title}</span>
              <span className={`days ${it.days_left <= 3 ? "soon" : ""}`}>
                {Math.max(it.days_left, 0)}d left
              </span>
              <button className="btn ghost" onClick={() => restore(it.id)} title="Restore">
                <RotateCcw size={14} /> Restore
              </button>
              <button className="icon-btn" onClick={() => purge(it.id)} title="Delete forever">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
