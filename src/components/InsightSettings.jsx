import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { askText } from "./ConfirmDialog.jsx";

const GROUPS = [
  {
    title: "Price warnings",
    note: "Used by the warning in Price Entry and the list of unusual prices.",
    fields: [
      ["window_days", "Learn each fish's usual price from the last", "days"],
      ["unusual_percent", "Mark a price as unusual when it is at least", "% from its usual price"],
      ["very_unusual_percent", "Mark a price as very unusual when it is at least", "% from its usual price"],
    ],
  },
  {
    title: "Market Insights",
    note: "Used when finding patterns between conditions and prices.",
    fields: [
      ["usual_window_days", "Compare each day's price with the median of the previous", "days"],
      ["level_percent", "Count a price as above or below usual when it differs by at least", "%"],
      ["min_days", "Show a pattern only if it happened on at least", "days"],
      ["min_confidence_percent", "…and held on at least", "% of those days (confidence)"],
      ["min_lift", "…and was at least", "× more likely than on an ordinary day (lift)"],
    ],
  },
];

const peso = (n) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const asText = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));
const sameValues = (a, b) => a && b && Object.keys(b).every((k) => Number(a[k]) === Number(b[k]));

async function send(path, method, body) {
  const r = await fetch(apiUrl(path), {
    method,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const err = new Error(data?.message || data?.detail || "Please check the values.");
    err.fields = data && typeof data === "object" ? data : {};
    throw err;
  }
  return data;
}

function PriceList({ rows, empty }) {
  if (!rows.length) return <p className="is-muted">{empty}</p>;
  return (
    <table className="is-table">
      <thead><tr><th>Date</th><th>Fish</th><th>Municipality</th><th>Price</th><th>Usual</th><th>Difference</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{shortDate(r.date)}</td><td>{r.fish}</td><td>{r.municipality}</td>
            <td>{peso(r.price)}</td><td>{peso(r.usual_median)}</td>
            <td>{r.percent_from_usual > 0 ? "+" : ""}{r.percent_from_usual}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Insight Settings: the LGU tries new cut-offs on the saved prices,
 * reviews the effect, then applies them with a reason (logged).
 */
export default function InsightSettings() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState({ message: "", fields: {} });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    send("/insights/settings/", "GET")
      .then((d) => { setSaved(d); setForm(asText(d.values)); })
      .catch((e) => setError({ message: e.message, fields: {} }));
  }, []);

  if (!saved || !form) {
    return (
      <>
        <div className="page-title"><div><h2>Insight Settings</h2></div></div>
        {error.message ? <div className="warn-box" role="alert">{error.message}</div> : <div className="panel" style={{ padding: 20 }}>Loading…</div>}
      </>
    );
  }

  const changed = !sameValues(form, saved.values);
  const previewed = preview && sameValues(form, preview.proposed);
  const isDefault = sameValues(form, saved.defaults);

  const edit = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setNotice(""); };

  const runPreview = async () => {
    setBusy("preview"); setError({ message: "", fields: {} }); setNotice("");
    try {
      setPreview(await send("/insights/settings/preview/", "POST", form));
    } catch (e) {
      setPreview(null); setError({ message: e.message, fields: e.fields });
    } finally { setBusy(""); }
  };

  const apply = async () => {
    const reason = await askText("Why are you changing these settings?", "", { title: "Reason for the change", confirmLabel: "Apply" });
    if (reason === null) return;
    if (!reason.trim()) { setError({ message: "Give a short reason for this change.", fields: {} }); return; }
    setBusy("apply"); setError({ message: "", fields: {} });
    try {
      const d = await send("/insights/settings/", "PUT", { ...form, reason: reason.trim() });
      setSaved(d); setForm(asText(d.values)); setPreview(null);
      setNotice("The new settings are now in use. The change was recorded in the Audit Log.");
    } catch (e) {
      setError({ message: e.message, fields: e.fields });
    } finally { setBusy(""); }
  };

  const o = preview?.outliers;
  const r = preview?.rules;

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Insight Settings</h2>
          <p>Try new values on the prices already saved, check the effect, then apply them. Nothing changes until you click Apply.</p>
        </div>
      </div>

      {notice && <div className="is-notice" role="status">{notice}</div>}
      {error.message && <div className="warn-box" role="alert">{error.message}</div>}

      <div className="is-groups">
        {GROUPS.map((group) => (
          <section key={group.title} className="panel is-group">
            <h3>{group.title}</h3>
            <p className="is-muted">{group.note}</p>
            {group.fields.map(([key, before, after]) => {
              const limit = saved.limits[key];
              const differs = Number(form[key]) !== Number(saved.values[key]);
              return (
                <label key={key} className={`is-field${differs ? " changed" : ""}`}>
                  <span>{before}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={limit.min}
                    max={limit.max}
                    step={key === "min_lift" ? 0.05 : key.endsWith("days") ? 1 : 0.5}
                    value={form[key]}
                    onChange={(e) => edit(key, e.target.value)}
                    aria-label={limit.label}
                  />
                  <span>{after}</span>
                  {differs && <small className="is-was">now {saved.values[key]}</small>}
                  {error.fields[key] && <small className="is-error">{error.fields[key]}</small>}
                </label>
              );
            })}
            {group.title === "Price warnings" && (
              <p className="is-fixed">
                A price must also have a robust z-score of at least {saved.fixed.unusual_z} (unusual) or {saved.fixed.very_unusual_z} (very unusual).
                These are the cut-offs recommended by Iglewicz &amp; Hoaglin (1993) and stay fixed.
              </p>
            )}
          </section>
        ))}
      </div>

      <div className="is-actions">
        <button className="secondary-btn" disabled={isDefault || !!busy} onClick={() => { setForm(asText(saved.defaults)); setPreview(null); setNotice(""); }}>
          Reset to defaults
        </button>
        <button className="secondary-btn" disabled={!changed || !!busy} onClick={() => { setForm(asText(saved.values)); setPreview(null); }}>
          Cancel changes
        </button>
        <button className="primary-btn" disabled={!changed || !!busy} onClick={runPreview}>
          {busy === "preview" ? "Checking the saved prices…" : "Preview"}
        </button>
        <button className="pill-btn pill-orange" disabled={!previewed || !!busy} onClick={apply}
          title={previewed ? "" : "Preview the new values first"}>
          {busy === "apply" ? "Applying…" : "Apply"}
        </button>
      </div>
      {changed && !previewed && <p className="is-muted is-hint">Click Preview to see the effect before applying.</p>}

      {preview && previewed && (
        <section className="panel is-preview">
          <h3>What would change</h3>
          <table className="is-table is-compare">
            <thead><tr><th></th><th>Now</th><th>With new values</th></tr></thead>
            <tbody>
              <tr><td>Prices flagged in the last {o.days} days</td><td>{o.current.total}</td><td><b>{o.proposed.total}</b></td></tr>
              <tr><td>— unusual</td><td>{o.current.unusual}</td><td>{o.proposed.unusual}</td></tr>
              <tr><td>— very unusual</td><td>{o.current.very_unusual}</td><td>{o.proposed.very_unusual}</td></tr>
              <tr><td>Patterns shown in Market Insights (all fish)</td><td>{r.current}</td><td><b>{r.proposed}</b></td></tr>
            </tbody>
          </table>

          <h4>Prices that would no longer be flagged</h4>
          <PriceList rows={o.no_longer_flagged} empty="None." />
          <h4>Prices that would become flagged</h4>
          <PriceList rows={o.newly_flagged} empty="None." />

          <h4>Patterns that would disappear</h4>
          {r.removed.length ? <ul className="is-rules">{r.removed.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="is-muted">None.</p>}
          <h4>Patterns that would appear</h4>
          {r.added.length ? <ul className="is-rules">{r.added.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="is-muted">None.</p>}
        </section>
      )}

      {saved.updated_by && (
        <p className="is-muted is-last">
          Last changed by {saved.updated_by} on {new Date(saved.updated_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
          {saved.last_reason ? ` — “${saved.last_reason}”` : ""}
        </p>
      )}
    </>
  );
}
