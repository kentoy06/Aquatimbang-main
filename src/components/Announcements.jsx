import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders, fetchAll } from "../api/config.js";

const AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "vendors", label: "Fish Vendors" },
  { value: "lgu", label: "LGU Officers" },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "";

// Announcements the logged-in user can see (all of them for Administrators).
export function useAnnouncements(reloadKey = 0) {
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetchAll("/announcements/")
      .then((rows) => { if (!cancelled) { setAnnouncements(rows); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [reloadKey]);
  return { announcements, error };
}

// Active announcements shown at the top of a dashboard.
export function AnnouncementBanner({ announcements, title = "Announcements" }) {
  const active = announcements.filter((a) => a.is_active);
  if (!active.length) return null;
  return (
    <div className="panel" style={{ marginBottom: 18, borderLeft: "4px solid #f79009" }}>
      <div className="panel-header"><div><h3>📢 {title}</h3></div></div>
      <div style={{ padding: "0 18px 14px", display: "grid", gap: 12 }}>
        {active.slice(0, 3).map((a) => (
          <div key={a.id}>
            <strong>{a.title}</strong>
            <p style={{ margin: "4px 0 2px", whiteSpace: "pre-line", color: "#344054" }}>{a.message}</p>
            <small style={{ color: "#667085" }}>{formatDate(a.created_at)}</small>
          </div>
        ))}
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
    if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
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
          <p>Messages shown on the dashboards of Fish Vendors and LGU Officers.</p>
        </div>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">📢</div>
            <div>
              <h3>{editing ? "Edit Announcement" : "New Announcement"}</h3>
              <p>Shown at the top of the chosen users' dashboards</p>
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
