// Thin client for the local Haifa HiveMind backend.
// In Electron the backend runs on the same machine; base can be overridden
// at build time with VITE_API_BASE (e.g. for a LAN mobile client later).
//
// DEMO MODE: when the app is served from a public host (e.g. Vercel) there is
// no local backend, so every call is answered with realistic mock data and the
// chat streams a canned "this is only the interface" message. This lets us ship
// a live interface preview without any AI running. Auto-detected by hostname,
// or forced with VITE_DEMO=1.

export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:8756";

const _host = typeof window !== "undefined" ? window.location.hostname : "";
export const DEMO =
  import.meta.env.VITE_DEMO === "1" ||
  import.meta.env.VITE_DEMO === "true" ||
  (!!_host && _host !== "localhost" && _host !== "127.0.0.1");

export const REPO_URL = "https://github.com/Danial-Dirar/haifa-hivemind";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------
const DEMO_DOCS = [
  { id: 1, filename: "Antibiotic_Resistance_Pseudomonas.pdf", kind: "pdf", topic: "microbiology", chunks: 42, status: "indexed" },
  { id: 2, filename: "Biofilm_Formation_Review.pdf", kind: "pdf", topic: "microbiology", chunks: 31, status: "indexed" },
  { id: 3, filename: "gram_stain_plate.png", kind: "image", topic: "microbiology", chunks: 3, status: "indexed" },
];
const DEMO_CONVS = [
  { id: 101, title: "Quorum sensing in P. aeruginosa", updated_at: "", messages: 2 },
  { id: 102, title: "Growth media comparison", updated_at: "", messages: 2 },
];
const DEMO_MESSAGES = {
  101: [
    { id: 1, role: "user", content: "Explain quorum sensing in Pseudomonas aeruginosa.", sources: [], images: [] },
    { id: 2, role: "assistant", content: "Quorum sensing (QS) in *P. aeruginosa* is a cell-density–dependent signalling system that coordinates group behaviours such as biofilm formation and virulence-factor production, using acyl-homoserine-lactone autoinducers [Biofilm_Formation_Review.pdf].", sources: ["Biofilm_Formation_Review.pdf"], images: [] },
  ],
  102: [
    { id: 1, role: "user", content: "Compare LB and M9 media for E. coli.", sources: [], images: [] },
    { id: 2, role: "assistant", content: "LB is a rich, undefined medium giving fast growth, while M9 is a defined minimal medium used when you need to control the exact nutrient composition [Antibiotic_Resistance_Pseudomonas.pdf].", sources: ["Antibiotic_Resistance_Pseudomonas.pdf"], images: [] },
  ],
};
const DEMO_REPLY =
  "👋 This is a **live demo** of the Haifa HiveMind interface. The real assistant " +
  "runs **100% on your own machine** — it reads your uploaded research papers and " +
  "answers privately, fully offline, and even learns from your feedback.\n\n" +
  "What you're seeing here is just the interface preview. To get the working " +
  "version, follow the **install guide in the README**. 🧠";

// ---------------------------------------------------------------------------
// First-run setup / onboarding
// ---------------------------------------------------------------------------
export const getSetupStatus = () =>
  DEMO
    ? Promise.resolve({ ollama_installed: true, ollama_running: true, models: {}, ready: true, required: [] })
    : j("/setup/status");

export async function streamSetupPull(onEvent, signal) {
  if (DEMO) {
    onEvent({ type: "done" });
    return;
  }
  const res = await fetch(`${API_BASE}/setup/pull`, { method: "POST", signal });
  if (!res.ok) throw new Error("Could not start model download");
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

// ---------------------------------------------------------------------------
// Model power
// ---------------------------------------------------------------------------
export const getModelStatus = () =>
  DEMO
    ? Promise.resolve({ state: "running", server_up: true, owns_server: false, loaded_models: ["qwen2.5vl:7b (demo)"], vram_mb: 6200 })
    : j("/model/status");
export const modelOn = () => (DEMO ? Promise.resolve({ state: "running" }) : j("/model/on", { method: "POST" }));
export const modelPause = () => (DEMO ? Promise.resolve({ state: "paused" }) : j("/model/pause", { method: "POST" }));
export const modelResume = () => (DEMO ? Promise.resolve({ state: "running" }) : j("/model/resume", { method: "POST" }));
export const modelOff = () => (DEMO ? Promise.resolve({ state: "off" }) : j("/model/off", { method: "POST" }));

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export const listDocuments = () => (DEMO ? Promise.resolve(DEMO_DOCS) : j("/documents"));
export const docStats = () =>
  DEMO ? Promise.resolve({ documents: 3, indexed: 3, chunks: 76 }) : j("/documents/stats/summary");
export const deleteDocument = (id) => (DEMO ? Promise.resolve({ deleted: id }) : j(`/documents/${id}`, { method: "DELETE" }));
export function uploadDocument(file, topic = "microbiology") {
  if (DEMO) return Promise.reject(new Error("Demo mode — install locally to add your own documents."));
  const fd = new FormData();
  fd.append("file", file);
  fd.append("topic", topic);
  return j("/documents", { method: "POST", body: fd });
}

// ---------------------------------------------------------------------------
// Conversations (history + recycle bin)
// ---------------------------------------------------------------------------
export const listConversations = () => (DEMO ? Promise.resolve(DEMO_CONVS) : j("/conversations"));
export const createConversation = (title = "New chat") =>
  DEMO
    ? Promise.resolve({ id: Date.now(), title })
    : j("/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
export const getConversation = (id) =>
  DEMO ? Promise.resolve({ id, messages: DEMO_MESSAGES[id] || [] }) : j(`/conversations/${id}`);
export const searchConversations = (q) =>
  DEMO
    ? Promise.resolve(DEMO_CONVS.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())).map((c) => ({ ...c, snippet: "matched in this demo chat" })))
    : j(`/conversations/search?q=${encodeURIComponent(q)}`);
export const chatImageUrl = (name) => (DEMO ? name : `${API_BASE}/chat-images/${name}`);
export const renameConversation = (id, title) =>
  DEMO
    ? Promise.resolve({ ok: true })
    : j(`/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
export const deleteConversation = (id) => (DEMO ? Promise.resolve({ ok: true }) : j(`/conversations/${id}`, { method: "DELETE" }));
export const listTrash = () => (DEMO ? Promise.resolve([]) : j("/conversations/trash"));
export const restoreConversation = (id) => (DEMO ? Promise.resolve({ ok: true }) : j(`/conversations/${id}/restore`, { method: "POST" }));
export const purgeConversation = (id) => (DEMO ? Promise.resolve({ ok: true }) : j(`/conversations/${id}/purge`, { method: "DELETE" }));

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
export const sendFeedback = (payload) =>
  DEMO
    ? Promise.resolve({ ok: true, reconsider: false })
    : j("/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------
export const trainingStatus = () =>
  DEMO
    ? Promise.resolve({ pending_examples: 7, min_required: 20, busy: false, last_run: null })
    : j("/training/status");
export const runTraining = () =>
  DEMO ? Promise.reject(new Error("Demo mode — fine-tuning runs on your local GPU.")) : j("/training/run", { method: "POST" });

// ---------------------------------------------------------------------------
// Chat (streaming SSE)
// ---------------------------------------------------------------------------
export async function streamChat(
  { query, conversationId = null, topic = "", reconsider = false, history = [], images = [] },
  onEvent,
  signal
) {
  if (DEMO) {
    onEvent({ type: "conversation", id: conversationId ?? Date.now(), new: conversationId == null });
    onEvent({ type: "sources", sources: ["demo"] });
    for (const word of DEMO_REPLY.split(" ")) {
      if (signal?.aborted) break;
      await sleep(32);
      onEvent({ type: "token", text: word + " " });
    }
    onEvent({ type: "done" });
    return;
  }

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
