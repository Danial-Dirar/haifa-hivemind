import { MessageSquarePlus, Trash2, Trash, History } from "lucide-react";

export default function ChatHistory({
  conversations,
  activeId,
  trashCount,
  onNew,
  onSelect,
  onDelete,
  onOpenTrash,
}) {
  return (
    <div className="panel">
      <div className="panel-title"><History size={13} /> Chats</div>
      <div className="hist-head">
        <button className="btn accent new-chat" onClick={onNew}>
          <MessageSquarePlus size={15} /> New chat
        </button>
        <button className="btn ghost trash-btn" title="Recycle bin" onClick={onOpenTrash}>
          <Trash size={15} />
          {trashCount > 0 && <span className="trash-badge">{trashCount}</span>}
        </button>
      </div>

      <div className="conv-list">
        {conversations.length === 0 && (
          <div className="muted" style={{ padding: "8px 4px" }}>No saved chats yet.</div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`conv ${c.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <span className="conv-title">{c.title}</span>
            <button
              className="icon-btn conv-del"
              title="Delete (recoverable for 30 days)"
              onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
