import { useEffect, useRef, useState } from "react";
import {
  MessageSquarePlus, Search, Trash, Trash2, Pencil, X,
} from "lucide-react";
import HiveMark from "./HiveMark.jsx";
import * as api from "../lib/api.js";

export default function ChatSidebar({
  conversations, activeId, trashCount,
  onNew, onSelect, onDelete, onRename, onOpenTrash,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = not searching
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const debounce = useRef();

  useEffect(() => {
    clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) { setResults(null); return; }
    debounce.current = setTimeout(async () => {
      try { setResults(await api.searchConversations(q)); } catch { setResults([]); }
    }, 220);
    return () => clearTimeout(debounce.current);
  }, [query]);

  function startRename(c) {
    setRenamingId(c.id);
    setRenameValue(c.title);
  }
  function commitRename(id) {
    const v = renameValue.trim();
    if (v) onRename(id, v);
    setRenamingId(null);
  }

  const searching = results !== null;
  const list = searching ? results : conversations;

  return (
    <aside className="sidebar left">
      <div className="brand">
        <div className="brand-mark"><HiveMark size={20} /></div>
        <div>
          <div className="brand-name">Haifa HiveMind</div>
          <div className="brand-sub">Haifa Intelligence</div>
        </div>
      </div>

      <div className="left-actions">
        <button className="btn accent block" onClick={onNew}>
          <MessageSquarePlus size={16} /> New chat
        </button>
        <div className="search-box">
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input
            value={query}
            placeholder="Search chats…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-btn" onClick={() => setQuery("")}><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="recents-label">{searching ? "Search results" : "Recents"}</div>
      <div className="conv-scroll">
        {list.length === 0 && (
          <div className="muted" style={{ padding: "6px 8px" }}>
            {searching ? "No matching chats." : "No saved chats yet."}
          </div>
        )}
        {list.map((c) => (
          <div
            key={c.id}
            className={`conv ${c.id === activeId ? "active" : ""}`}
            onClick={() => renamingId !== c.id && onSelect(c.id)}
          >
            {renamingId === c.id ? (
              <input
                className="rename-input"
                autoFocus
                value={renameValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(c.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => commitRename(c.id)}
              />
            ) : (
              <>
                <div className="conv-main">
                  <span className="conv-title">{c.title}</span>
                  {searching && c.snippet && <span className="snippet">{c.snippet}</span>}
                </div>
                <div className="conv-actions">
                  <button
                    className="icon-btn" title="Rename"
                    onClick={(e) => { e.stopPropagation(); startRename(c); }}
                  ><Pencil size={13} /></button>
                  <button
                    className="icon-btn" title="Delete (recoverable 30 days)"
                    onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                  ><Trash2 size={13} /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="left-foot">
        <button className="btn ghost block trash-btn" onClick={onOpenTrash}>
          <Trash size={15} /> Recycle bin
          {trashCount > 0 && <span className="trash-badge">{trashCount}</span>}
        </button>
      </div>
    </aside>
  );
}
