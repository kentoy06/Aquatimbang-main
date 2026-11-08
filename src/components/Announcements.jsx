import React, { useEffect, useState } from "react";
import { askConfirm } from "./ConfirmDialog.jsx";
import { apiUrl, authHeaders, fetchAll } from "../api/config.js";

const AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "vendors", label: "Fish Vendors" },
  { value: "lgu", label: "LGU Officers" },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "";

// How often dashboards look for new announcements.
const LIVE_CHECK_MS = 60 * 1000;

/**
 * Announcements the logged-in user can see (all of them for Administrators).
 * With `live`, they are checked again every minute and whenever the tab is
 * opened again, so a new announcement shows up without refreshing.
 */
export function useAnnouncements(reloadKey = 0, { live = false } = {}) {
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!live) return undefined;
    const again = () => { if (document.visibilityState === "visible") setTick((t) => t + 1); };
    const timer = setInterval(again, LIVE_CHECK_MS);
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [live]);

  useEffect(() => {
    if (!localStorage.getItem("authToken")) return undefined;
    let cancelled = false;
    fetchAll("/announcements/")
      .then((rows) => { if (!cancelled) { setAnnouncements(rows); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [reloadKey, tick]);
  return { announcements, error };
}

// Which announcements this user already saw (kept on this device).
const seenKey = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return `aquatimbang-seen-announcements-${user.id ?? "anon"}`;
  } catch {
    return "aquatimbang-seen-announcements-anon";
  }
};
function readSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || "[]")); } catch { return new Set(); }
}
function writeSeen(ids) {
  try { localStorage.setItem(seenKey(), JSON.stringify([...ids].slice(-200))); } catch { /* storage unavailable */ }
}

/**
 * Pops up announcements the user hasn't seen yet, newest first. "Got it"
 * marks them seen; afterwards they stay in the Notifications tab only.
 */
export function AnnouncementPopup({ announcements }) {
  const [seen, setSeen] = useState(readSeen);
  const unseen = announcements
    .filter((a) => a.is_active && !seen.has(a.id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!unseen.length) return null;

  const gotIt = () => {
    const next = new Set(seen);
    unseen.forEach((a) => next.add(a.id));
    writeSeen(next);
    setSeen(next);
  };

  return (
    <div className="modal-backdrop announce-backdrop">
      <div className="modal announce-modal" role="dialog" aria-modal="true" aria-labelledby="announce-title">
        <div className="announce-head">
          <span className="announce-icon" aria-hidden="true">📢</span>
          <div>
            <small>{unseen.length > 1 ? `${unseen.length} new announcements` : "New announcement"}</small>
            <h3 id="announce-title">{unseen[0].title}</h3>
          </div>
        </div>
        <div className="announce-list">
          {unseen.slice(0, 5).map((a, i) => (
            <article key={a.id}>
              {i > 0 && <strong>{a.title}</strong>}
              <p>{a.message}</p>
              <small>{formatDate(a.created_at)}{a.created_by_name ? ` · from ${a.created_by_name}` : ""}</small>
            </article>
          ))}
        </div>
        <p className="announce-note">You can read it again anytime in Notifications.</p>
        <div className="button-row"><button className="primary-btn" onClick={gotIt} autoFocus>Got it</button></div>
      </div>
    </div>
  );
}

async function send(path, method, body) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" ? Object.values(data).flat().map(String).join(" ") : "";
    throw new Error(message || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

// Administrator page: write, edit, hide and delete announcements.
export function AnnouncementsManager({ notify }) {
  const empty = { title: "", message: "", audience: "all" };
  const [reloadKey, setReloadKey] = useState(0);
  const { announcements, error } = useAnnouncements(reloadKey);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const reload = () => setReloadKey((k) => k + 1);

  const save = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      notify("Write a title and a message.");
      return;
    }
    setSaving(true);
    try {
      if (editing) await send(`/announcements/${editing.id}/`, "PATCH", form);
      else await send("/announcements/", "POST", form);
      notify(editing ? "Announcement updated." : "Announcement published.");
      setForm(empty);
      setEditing(null);
      reload();
    } catch (err) {
      notify(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a) => {
    try {
      await send(`/announcements/${a.id}/`, "PATCH", { is_active: !a.is_active });
      notify(a.is_active ? "Announcement hidden." : "Announcement shown again.");
      reload();
    } catch (err) {
      notify(err.message);
    }
  };

  const remove = async (a) => {
    if (!await askConfirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try {
      await send(`/announcements/${a.id}/`, "DELETE");
      notify("Announcement deleted.");
      if (editing?.id === a.id) { setEditing(null); setForm(empty); }
      reload();
    } catch (err) {
      notify(err.message);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>System Announcements</h2>
          <p>Messages that pop up for Fish Vendors and LGU Officers and stay in their Notifications.</p>
        </div>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">📢</div>
            <div>
              <h3>{editing ? "Edit Announcement" : "New Announcement"}</h3>
              <p>Pops up on the chosen users' screens within a minute, then stays in their Notifications</p>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="ann-title">Title</label>
            <input id="ann-title" maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Carbon Market closed on Monday" />
          </div>
          <div className="form-group">
            <label htmlFor="ann-message">Message</label>
            <textarea id="ann-message" rows={5} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} style={{ width: "100%", resize: "vertical" }} />
          </div>
          <div className="form-group">
            <label htmlFor="ann-audience">Show to</label>
            <select id="ann-audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div className="button-row">
            {editing && <button className="secondary-btn" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}
            <button className="primary-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Publish Announcement"}</button>
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">☰</div>
            <div><h3>All Announcements</h3><p>{announcements.filter((a) => a.is_active).length} shown · {announcements.length} total</p></div>
          </div>
          {error && <div className="warn-box" role="alert">{error}</div>}
          {!error && announcements.length === 0 && <div className="info-box">No announcements yet.</div>}
          <div className="history-list">
            {announcements.map((a) => (
              <div className="history-item" key={a.id} style={{ alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{a.title}</strong>{" "}
                  <span className={`badge ${a.is_active ? "success" : "inactive"}`}>{a.is_active ? "Shown" : "Hidden"}</span>
                  <p style={{ margin: "4px 0", whiteSpace: "pre-line" }}>{a.message}</p>
                  <small>{a.audience_display} · {formatDate(a.created_at)}{a.created_by_name ? ` · ${a.created_by_name}` : ""}</small>
                </div>
                <div className="action-icons" style={{ flexShrink: 0 }}>
                  <button title="Edit" onClick={() => { setEditing(a); setForm({ title: a.title, message: a.message, audience: a.audience }); }}>✎</button>
                  <button title={a.is_active ? "Hide" : "Show"} onClick={() => toggle(a)}>{a.is_active ? "◌" : "◉"}</button>
                  <button title="Delete" onClick={() => remove(a)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
