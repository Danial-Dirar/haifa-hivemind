import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, Square } from "lucide-react";
import PowerControls from "./components/PowerControls.jsx";
import DocumentsPanel from "./components/DocumentsPanel.jsx";
import TrainingPanel from "./components/TrainingPanel.jsx";
import ChatSidebar from "./components/ChatSidebar.jsx";
import TrashModal from "./components/TrashModal.jsx";
import Message from "./components/Message.jsx";
import * as api from "./lib/api.js";

let idc = 0;
const uid = () => `m${++idc}`;

const SUGGESTIONS = [
  "Summarise the key findings across my uploaded papers",
  "Compare the antibiotic resistance mechanisms discussed",
  "আমার আপলোড করা পেপারগুলোর মূল ফলাফল বাংলায় বুঝিয়ে দাও",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState([]); // {file, url}
  const [sending, setSending] = useState(false);
  const [modelState, setModelState] = useState("off");
  const [toast, setToast] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [trashCount, setTrashCount] = useState(0);
  const [trashOpen, setTrashOpen] = useState(false);

  const scrollRef = useRef();
  const fileRef = useRef();
  const abortRef = useRef(null);

  const showToast = (text, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), 3200);
  };

  async function refreshConversations() {
    try { setConversations(await api.listConversations()); } catch {}
  }
  async function refreshTrashCount() {
    try { setTrashCount((await api.listTrash()).length); } catch {}
  }

  useEffect(() => {
    refreshConversations();
    refreshTrashCount();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function patchLast(fn) {
    setMessages((ms) => {
      const copy = [...ms];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") { copy[i] = fn(copy[i]); break; }
      }
      return copy;
    });
  }

  function buildHistory() {
    return messages
      .filter((m) => m.content && !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function runQuery({ query, imgs = [], reconsider = false }) {
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const aiId = uid();
    setMessages((ms) => [
      ...ms,
      { id: aiId, role: "assistant", content: "", sources: [], streaming: true, query },
    ]);

    try {
      await api.streamChat(
        { query, conversationId, reconsider, history: buildHistory(), images: imgs.map((i) => i.file) },
        (evt) => {
          if (evt.type === "conversation") {
            if (conversationId == null) setConversationId(evt.id);
            if (evt.new) refreshConversations();
          } else if (evt.type === "sources") patchLast((m) => ({ ...m, sources: evt.sources }));
          else if (evt.type === "token") patchLast((m) => ({ ...m, content: m.content + evt.text }));
          else if (evt.type === "error") showToast(evt.detail, true);
          else if (evt.type === "done") patchLast((m) => ({ ...m, streaming: false }));
        },
        controller.signal
      );
    } catch (e) {
      if (e.name === "AbortError") {
        patchLast((m) => ({ ...m, stopped: true })); // user pressed Stop — keep partial
      } else {
        patchLast((m) => ({ ...m, content: m.content || `⚠️ ${e.message}` }));
        showToast(e.message, true);
      }
    } finally {
      patchLast((m) => ({ ...m, streaming: false }));
      abortRef.current = null;
      setSending(false);
      refreshConversations();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function send() {
    const query = input.trim();
    if (!query || sending) return;
    const imgs = images;
    setMessages((ms) => [
      ...ms,
      { id: uid(), role: "user", content: query, images: imgs.map((i) => i.url) },
    ]);
    setInput("");
    setImages([]);
    await runQuery({ query, imgs });
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setInput("");
    setImages([]);
  }

  async function selectConversation(id) {
    if (id === conversationId) return;
    try {
      const conv = await api.getConversation(id);
      let lastUserQuery = "";
      const mapped = conv.messages.map((m) => {
        if (m.role === "user") lastUserQuery = m.content;
        return {
          id: uid(),
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          images: (m.images || []).map((fn) => api.chatImageUrl(fn)),
          streaming: false,
          query: m.role === "assistant" ? lastUserQuery : undefined,
        };
      });
      setConversationId(id);
      setMessages(mapped);
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function deleteConversation(id) {
    try {
      await api.deleteConversation(id);
      if (id === conversationId) newChat();
      await refreshConversations();
      await refreshTrashCount();
      showToast("Chat moved to recycle bin.");
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function renameConversation(id, title) {
    try {
      await api.renameConversation(id, title);
      await refreshConversations();
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function accept(msg) {
    setMessages((ms) => ms.map((m) => (m.id === msg.id ? { ...m, feedback: "accept" } : m)));
    try {
      await api.sendFeedback({ query: msg.query, answer: msg.content, verdict: "accept", context: msg.sources });
    } catch (e) { showToast(e.message, true); }
  }

  async function reject(msg, note) {
    setMessages((ms) => ms.map((m) => (m.id === msg.id ? { ...m, feedback: "reject" } : m)));
    try {
      const res = await api.sendFeedback({
        query: msg.query, answer: msg.content, verdict: "reject", note, context: msg.sources,
      });
      if (res.reconsider) {
        showToast("Rethinking with your feedback…");
        await runQuery({ query: msg.query, reconsider: true });
      }
    } catch (e) { showToast(e.message, true); }
  }

  function addImages(files) {
    const imgs = [...files]
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setImages((cur) => [...cur, ...imgs]);
  }

  const offline = modelState === "off";

  return (
    <>
      {api.DEMO && (
        <div className="demo-ribbon">
          <span>
            🔬 <b>Live demo</b> — this is the interface only. The private AI runs entirely on <b>your own machine</b>.
          </span>
          <a href={api.REPO_URL} target="_blank" rel="noreferrer">Install the real thing →</a>
        </div>
      )}
      <div className={`app ${api.DEMO ? "demo" : ""}`}>
      <ChatSidebar
        conversations={conversations}
        activeId={conversationId}
        trashCount={trashCount}
        onNew={newChat}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onOpenTrash={() => setTrashOpen(true)}
      />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Research Assistant</h1>
            <div className="sub">Private · On-device · Microbiology-focused</div>
          </div>
        </div>

        {offline && (
          <div className="banner">
            The AI engine is off. Press <b>On</b> in the panel on the right to start it.
          </div>
        )}

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="hero">
              <div className="big">Ask your <span className="accent-text">private</span> research AI</div>
              <div className="muted" style={{ maxWidth: 460 }}>
                Everything runs on this machine. Upload papers on the right, then ask away —
                answers are grounded in your own library. বাংলাতেও জিজ্ঞেস করতে পারেন।
              </div>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <div className="suggestion" key={s} onClick={() => setInput(s)}>{s}</div>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <Message key={m.id} msg={m} onAccept={accept} onReject={reject} />
            ))
          )}
        </div>

        <div className="composer-wrap">
          {images.length > 0 && (
            <div className="thumbs">
              {images.map((im, i) => (
                <div className="thumb" key={i}>
                  <img src={im.url} alt="" />
                  <button onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer">
            <textarea
              rows={1}
              value={input}
              placeholder={offline ? "Turn the engine on to chat…" : "Ask about your research… / আপনার গবেষণা নিয়ে জিজ্ঞেস করুন…"}
              disabled={offline}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              onPaste={(e) => {
                const files = [...e.clipboardData.items]
                  .filter((it) => it.type.startsWith("image/"))
                  .map((it) => it.getAsFile())
                  .filter(Boolean);
                if (files.length) { e.preventDefault(); addImages(files); }
              }}
            />
            <div className="composer-actions">
              <button className="attach" disabled={offline} onClick={() => fileRef.current?.click()}>
                <Paperclip size={18} />
              </button>
              {sending ? (
                <button className="send stop" onClick={stop} title="Stop generating">
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button className="send" disabled={offline || !input.trim()} onClick={send}>
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => addImages(e.target.files)} />
        </div>
      </main>

      <aside className="sidebar right">
        <div className="sidebar-scroll" style={{ paddingTop: 12 }}>
          <PowerControls onToast={showToast} onStateChange={setModelState} />
          <DocumentsPanel onToast={showToast} />
          <TrainingPanel onToast={showToast} />
        </div>
      </aside>

      {trashOpen && (
        <TrashModal
          onClose={() => setTrashOpen(false)}
          onChanged={() => { refreshConversations(); refreshTrashCount(); }}
          onToast={showToast}
        />
      )}
      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.text}</div>}
      </div>
    </>
  );
}
