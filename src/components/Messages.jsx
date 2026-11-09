import React, { useEffect, useRef, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { timeAgo } from "./Presence.jsx";

const THREAD_POLL_MS = 4000;
const LIST_POLL_MS = 10000;
const UNREAD_POLL_MS = 20000;

async function api(path, options = {}) {
  const r = await fetch(apiUrl(path), {
    ...options,
    headers: { ...authHeaders(), "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || data?.detail || "Something went wrong.");
  return data;
}

const initials = (name) => String(name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const clock = (iso) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
};
const shortWhen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? clock(iso)
    : d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

/** Total unread messages for the sidebar badge (refreshes every 20 s). */
export function useUnreadMessages(enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () => api("/messages/unread/").then((d) => { if (!cancelled) setCount(d.unread); }).catch(() => {});
    load();
    const timer = setInterval(load, UNREAD_POLL_MS);
    const onRead = () => load();
    window.addEventListener("aquatimbang:messages-read", onRead);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("aquatimbang:messages-read", onRead); };
  }, [enabled]);
  return count;
}

function Avatar({ person }) {
  return (
    <span className="msg-avatar">
      {initials(person.name)}
      <span className={`msg-avatar-dot ${person.is_online ? "on" : ""}`} aria-hidden="true" />
    </span>
  );
}

function ContactPicker({ onPick, onClose }) {
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    api("/messages/contacts/").then(setContacts).catch((e) => setError(e.message));
  }, []);
  const visible = (contacts || []).filter((c) =>
    `${c.name} ${c.username} ${c.role} ${c.municipality}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="msg-picker">
      <div className="msg-picker-head">
        <strong>New message</strong>
        <button type="button" className="msg-link" onClick={onClose}>Cancel</button>
      </div>
      <input className="msg-search" placeholder="Search name or role…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      {error && <p className="msg-muted">{error}</p>}
      {!contacts && !error && <p className="msg-muted">Loading…</p>}
      {contacts && visible.length === 0 && <p className="msg-muted">No one to message.</p>}
      <ul className="msg-list">
        {visible.map((c) => (
          <li key={c.id}>
            <button type="button" className="msg-row" onClick={() => onPick(c)}>
              <Avatar person={c} />
              <span className="msg-row-main">
                <strong>{c.name}</strong>
                <small>{c.role}{c.municipality ? ` · ${c.municipality}` : ""}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="msg-rule">Vendors can message their municipality's LGU and the Administrator. Vendors cannot message other vendors.</p>
    </div>
  );
}

function Thread({ conversation, onSent, onBack }) {
  const [messages, setMessages] = useState([]);
  const [lastReadByOther, setLastReadByOther] = useState(null);
  const [canReply, setCanReply] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const lastId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    lastId.current = 0;
    setMessages([]); setError(""); setText("");
    const load = async () => {
      try {
        const d = await api(`/messages/conversations/${conversation.id}/${lastId.current ? `?after=${lastId.current}` : ""}`);
        if (cancelled) return;
        if (d.messages.length) {
          lastId.current = d.messages[d.messages.length - 1].id;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...d.messages.filter((m) => !seen.has(m.id))];
          });
          window.dispatchEvent(new Event("aquatimbang:messages-read"));
        }
        setLastReadByOther(d.last_read_by_other);
        setCanReply(d.can_reply);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    load();
    const timer = setInterval(load, THREAD_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [conversation.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError("");
    try {
      const m = await api(`/messages/conversations/${conversation.id}/`, { method: "POST", body: JSON.stringify({ body }) });
      lastId.current = Math.max(lastId.current, m.id);
      setMessages((prev) => [...prev, m]);
      setText("");
      onSent?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const person = conversation.with;
  const lastMine = [...messages].reverse().find((m) => m.from_me);
  let lastDay = "";

  return (
    <section className="msg-thread">
      <header className="msg-thread-head">
        <button type="button" className="msg-back" onClick={onBack} aria-label="Back to conversations">‹</button>
        <Avatar person={person} />
        <div>
          <strong>{person.name}</strong>
          <small>
            {person.role}{person.municipality ? ` · ${person.municipality}` : ""} ·{" "}
            {person.is_online ? <span className="msg-online">Online</span> : `last seen ${timeAgo(person.last_seen)}`}
          </small>
        </div>
      </header>

      <div className="msg-body">
        {messages.length === 0 && !error && <p className="msg-empty">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="msg-day"><span>{day}</span></div>}
              <div className={`msg-bubble-row ${m.from_me ? "mine" : ""}`}>
                <div className="msg-bubble">
                  <p>{m.body}</p>
                  <time dateTime={m.created_at}>{clock(m.created_at)}</time>
                </div>
              </div>
              {lastMine && m.id === lastMine.id && lastReadByOther && lastReadByOther >= m.id && (
                <div className="msg-seen">Seen</div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <div className="msg-error" role="alert">{error}</div>}
      {canReply ? (
        <div className="msg-compose">
          <textarea
            rows={1}
            maxLength={2000}
            placeholder={`Message ${person.name}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            aria-label="Type a message"
          />
          <button type="button" className="primary-btn" disabled={!text.trim() || sending} onClick={send}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      ) : (
        <p className="msg-closed">You can no longer reply to this account.</p>
      )}
    </section>
  );
}

/**
 * Messages page for Vendors, LGU Officers and Administrators.
 * Vendor <-> LGU (same municipality), LGU <-> Admin, Vendor <-> Admin.
 */
export default function Messages() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null);
  const [picking, setPicking] = useState(false);

  const loadList = () => api("/messages/conversations/").then((rows) => { setList(rows); setError(""); }).catch((e) => setError(e.message));

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const open = async (person) => {
    setPicking(false);
    try {
      const convo = await api("/messages/conversations/", { method: "POST", body: JSON.stringify({ user_id: person.id }) });
      setActive(convo);
    } catch (e) {
      setError(e.message);
    }
  };

  // Keep the open conversation's header (online status) fresh.
  const activeRow = active && (list || []).find((c) => c.id === active.id);
  const shown = activeRow || active;

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Messages</h2>
          <p>Private conversations with your LGU, vendors or the Administrator.</p>
        </div>
      </div>

      <div className={`msg-layout ${shown ? "has-thread" : ""}`}>
        <aside className="msg-side">
          {picking ? (
            <ContactPicker onPick={open} onClose={() => setPicking(false)} />
          ) : (
            <>
              <div className="msg-side-head">
                <strong>Conversations</strong>
                <button type="button" className="primary-btn msg-new" onClick={() => setPicking(true)}>+ New</button>
              </div>
              {error && <p className="msg-muted">{error}</p>}
              {!list && !error && <p className="msg-muted">Loading…</p>}
              {list && list.length === 0 && (
                <p className="msg-muted">No conversations yet. Click <b>+ New</b> to message someone.</p>
              )}
              <ul className="msg-list">
                {(list || []).map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`msg-row ${shown?.id === c.id ? "active" : ""}`} onClick={() => setActive(c)}>
                      <Avatar person={c.with} />
                      <span className="msg-row-main">
                        <span className="msg-row-top">
                          <strong>{c.with.name}</strong>
                          <small>{shortWhen(c.last_message_at)}</small>
                        </span>
                        <span className="msg-row-bottom">
                          <small className={c.unread ? "unread" : ""}>
                            {c.last_message ? `${c.last_message.from_me ? "You: " : ""}${c.last_message.body}` : c.with.role}
                          </small>
                          {c.unread > 0 && <span className="nav-badge msg-unread">{c.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        {shown ? (
          <Thread conversation={shown} onSent={loadList} onBack={() => setActive(null)} />
        ) : (
          <section className="msg-thread msg-placeholder">
            <p>Choose a conversation, or click <b>+ New</b> to start one.</p>
          </section>
        )}
      </div>
    </>
  );
}
