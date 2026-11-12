import React, { useEffect, useState } from "react";
import { askConfirm } from "./ConfirmDialog.jsx";
import { deleteClosedSeason, listClosedSeasons, listFishSpecies, saveClosedSeason } from "../api/forecast.js";
import PagedTable from "./PagedTable.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const emptySeason = () => ({
  id: null, name: "", area: "", start_month: 11, start_day: 1, end_month: 1, end_day: 31,
  species: [], source: "", notes: "", is_active: true,
});

const dates = (s) => `${MONTHS[s.start_month - 1]} ${s.start_day} – ${MONTHS[s.end_month - 1]} ${s.end_day}`;

function covers(season, day) {
  const key = (m, d) => m * 100 + d;
  const start = key(season.start_month, season.start_day);
  const end = key(season.end_month, season.end_day);
  const today = key(day.getMonth() + 1, day.getDate());
  return start <= end ? start <= today && today <= end : today >= start || today <= end;
}

function MonthDay({ label, idPrefix, month, day, onMonth, onDay }) {
  return (
    <div className="form-group">
      <label htmlFor={`${idPrefix}-month`}>{label}</label>
      <div className="season-date">
        <select id={`${idPrefix}-month`} value={month} onChange={(e) => onMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select aria-label={`${label} day`} value={day} onChange={(e) => onDay(Number(e.target.value))}>
          {Array.from({ length: DAYS_IN_MONTH[month - 1] }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
      </div>
    </div>
  );
}

// BFAR closed fishing seasons, used to explain price changes.
export default function ClosedSeasonsSection({ notify }) {
  const [seasons, setSeasons] = useState([]);
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptySeason);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listClosedSeasons(), listFishSpecies()])
      .then(([seasonRows, fishRows]) => {
        if (cancelled) return;
        setSeasons(seasonRows);
        setSpecies(fishRows.slice().sort((a, b) => a.name.localeCompare(b.name)));
        setError("");
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const update = (key, value) => setForm((prev) => {
    const next = { ...prev, [key]: value };
    // Keep the day valid when the month changes (e.g. Jan 31 -> Feb 29).
    if (key === "start_month") next.start_day = Math.min(next.start_day, DAYS_IN_MONTH[value - 1]);
    if (key === "end_month") next.end_day = Math.min(next.end_day, DAYS_IN_MONTH[value - 1]);
    return next;
  });
  const toggleFish = (id) => update("species", form.species.includes(id) ? form.species.filter((x) => x !== id) : [...form.species, id]);

  const save = async () => {
    if (!form.name.trim() || !form.area.trim()) {
      notify("Enter the season name and the fishing area.");
      return;
    }
    if (form.species.length === 0) {
      notify("Choose at least one fish covered by the closed season.");
      return;
    }
    setSaving(true);
    try {
      await saveClosedSeason(form);
      notify(form.id ? "Closed season updated." : "Closed season added.");
      setForm(emptySeason());
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify(err.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (season) => {
    setForm({ ...season, species: season.species.map(Number), source: season.source || "", notes: season.notes || "" });
    document.getElementById("season-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const remove = async (season) => {
    if (!await askConfirm(`Delete "${season.name}"? You can also turn it off instead.`)) return;
    try {
      await deleteClosedSeason(season.id);
      notify("Closed season deleted.");
      if (form.id === season.id) setForm(emptySeason());
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify(err.message);
    }
  };

  const today = new Date();

  return (
    <div className="config-grid season-grid">
      <div className="config-card" id="season-form">
        <div className="config-header">
          <div className="config-icon orange">🚫</div>
          <div><h3>{form.id ? `Edit ${form.name}` : "Add Closed Fishing Season"}</h3><p>BFAR bans that reduce fish supply each year</p></div>
        </div>

        <div className="form-group"><label htmlFor="season-name">Season Name</label>
          <input id="season-name" maxLength={120} value={form.name} placeholder="e.g. Visayan Sea closed season" onChange={(e) => update("name", e.target.value)} />
        </div>
        <div className="form-group"><label htmlFor="season-area">Fishing Area</label>
          <input id="season-area" maxLength={120} value={form.area} placeholder="e.g. Visayan Sea" onChange={(e) => update("area", e.target.value)} />
        </div>
        <div className="season-dates">
          <MonthDay label="Starts" idPrefix="season-start" month={form.start_month} day={form.start_day} onMonth={(v) => update("start_month", v)} onDay={(v) => update("start_day", v)} />
          <MonthDay label="Ends" idPrefix="season-end" month={form.end_month} day={form.end_day} onMonth={(v) => update("end_month", v)} onDay={(v) => update("end_day", v)} />
        </div>
        <div className="form-group">
          <label>Fish Covered</label>
          <div className="season-fish">
            {species.length === 0 && <span className="season-sub">No fish species yet.</span>}
            {species.map((fish) => (
              <button
                type="button"
                key={fish.id}
                className={`season-chip${form.species.includes(fish.id) ? " on" : ""}`}
                aria-pressed={form.species.includes(fish.id)}
                onClick={() => toggleFish(fish.id)}
              >
                {form.species.includes(fish.id) ? "✓ " : ""}{fish.name}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group"><label htmlFor="season-source">Source (optional)</label>
          <input id="season-source" maxLength={200} value={form.source} placeholder="e.g. BFAR Fisheries Administrative Order" onChange={(e) => update("source", e.target.value)} />
        </div>
        <div className="form-group"><label htmlFor="season-notes">Notes (optional)</label>
          <input id="season-notes" maxLength={300} value={form.notes} placeholder="e.g. No catching of sardines so they can spawn." onChange={(e) => update("notes", e.target.value)} />
        </div>
        <div className="toggle-row">
          <div><strong>Active</strong><p>Turn off to stop using this season in explanations.</p></div>
          <label className="switch"><input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} /><span className="slider"></span></label>
        </div>
        <div className="button-row">
          {form.id && <button className="secondary-btn" onClick={() => setForm(emptySeason())}>Cancel</button>}
          <button className="primary-btn full-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Save Changes" : "Add Season"}</button>
        </div>
      </div>

      <div className="config-card">
        <div className="config-header">
          <div className="config-icon purple">📅</div>
          <div><h3>Closed Fishing Seasons</h3><p>Used in "Why is the price changing?" on the forecast page</p></div>
        </div>
        {error && <div className="warn-box" role="alert">{error}</div>}
        <div style={{ overflowX: "auto" }}>
          <PagedTable className="inner-table">
            <thead><tr><th>SEASON</th><th>DATES</th><th>FISH</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="empty-row">Loading…</td></tr>
              ) : seasons.length === 0 ? (
                <tr><td colSpan="5" className="empty-row">No closed seasons yet.</td></tr>
              ) : seasons.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.area}</strong><div className="season-sub">{s.name}</div></td>
                  <td style={{ whiteSpace: "nowrap" }}>{dates(s)}</td>
                  <td>{s.species_names.join(", ") || "—"}</td>
                  <td>
                    {!s.is_active ? <span className="badge inactive">Off</span>
                      : covers(s, today) ? <span className="badge pending" style={{ whiteSpace: "nowrap" }}>In effect now</span>
                      : <span className="badge success">Active</span>}
                  </td>
                  <td>
                    <div className="action-icons">
                      <button title="Edit" onClick={() => edit(s)}>✎</button>
                      <button title="Delete" onClick={() => remove(s)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </PagedTable>
        </div>
        <p className="season-sub" style={{ marginTop: 12 }}>
          Starter dates are from BFAR announcements. Please confirm them with BFAR or the DVMF each year.
        </p>
      </div>
    </div>
  );
}
