// Thin client for the local Haifa HiveMind backend.
// In Electron the backend runs on the same machine; base can be overridden
// at build time with VITE_API_BASE (e.g. for a LAN mobile client later).

export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:8756";

async function j(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

// --- Model power ------------------------------------------------------------
export const getModelStatus = () => j("/model/status");
export const modelOn = () => j("/model/on", { method: "POST" });
export const modelPause = () => j("/model/pause", { method: "POST" });
export const modelResume = () => j("/model/resume", { method: "POST" });
export const modelOff = () => j("/model/off", { method: "POST" });

// --- Documents --------------------------------------------------------------
export const listDocuments = () => j("/documents");
export const docStats = () => j("/documents/stats/summary");
export const deleteDocument = (id) => j(`/documents/${id}`, { method: "DELETE" });
export function uploadDocument(file, topic = "microbiology") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("topic", topic);
  return j("/documents", { method: "POST", body: fd });
}

// --- Conversations (history + recycle bin) ----------------------------------
export const listConversations = () => j("/conversations");
export const createConversation = (title = "New chat") =>
  j("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
export const getConversation = (id) => j(`/conversations/${id}`);
export const renameConversation = (id, title) =>
  j(`/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
export const deleteConversation = (id) => j(`/conversations/${id}`, { method: "DELETE" });
export const listTrash = () => j("/conversations/trash");
export const restoreConversation = (id) =>
  j(`/conversations/${id}/restore`, { method: "POST" });
export const purgeConversation = (id) =>
  j(`/conversations/${id}/purge`, { method: "DELETE" });

// --- Feedback ---------------------------------------------------------------
export const sendFeedback = (payload) =>
  j("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// --- Training ---------------------------------------------------------------
export const trainingStatus = () => j("/training/status");
export const runTraining = () => j("/training/run", { method: "POST" });

// --- Chat (streaming SSE) ---------------------------------------------------
// onEvent receives {type:'sources'|'token'|'error'|'done', ...}.
export async function streamChat(
  { query, conversationId = null, topic = "", reconsider = false, history = [], images = [] },
  onEvent,
  signal
) {
  const fd = new FormData();
  fd.append("query", query);
  if (conversationId != null) fd.append("conversation_id", conversationId);
  fd.append("topic", topic);
  fd.append("reconsider", reconsider ? "true" : "false");
  fd.append("history", JSON.stringify(history));
  images.forEach((img) => fd.append("images", img));

  const res = await fetch(`${API_BASE}/chat`, { method: "POST", body: fd, signal });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {}
    }
  }
}
