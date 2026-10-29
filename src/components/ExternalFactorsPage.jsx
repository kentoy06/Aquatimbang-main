import React, { useEffect, useState } from "react";
import { deleteExternalFactor, listExternalFactors, saveExternalFactor } from "../api/forecast.js";

const peso = (n) =>
  n === null || n === undefined || n === "" ? "—" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = () => new Date().toLocaleDateString("en-CA");

const emptyForm = () => ({ id: null, date: today(), fuel_price: "", weather: "sunny", is_holiday: false, notes: "" });

// Daily fuel price, weather and holidays used as SARIMAX external factors.
function ExternalFactorsPage({ notify }) {
  const [factors, setFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listExternalFactors()
      .then((rows) => { if (!cancelled) { setFactors(rows); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.date) {
      notify("Choose a date.");
      return;
    }
    if (form.fuel_price !== "" && !(Number(form.fuel_price) > 0)) {
      notify("Fuel price must be greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await saveExternalFactor(form);
      notify(form.id ? "External factor updated." : "External factor saved.");
      setForm(emptyForm());
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify(err.message.includes("date") ? "A record for this date already exists — edit it in the list instead." : err.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (factor) => setForm({
    id: factor.id,
    date: factor.date,
    fuel_price: factor.fuel_price ?? "",
    weather: factor.weather,
    is_holiday: factor.is_holiday,
    notes: factor.notes || "",
  });

  const remove = async (factor) => {
    if (!window.confirm(`Delete the external factors for ${factor.date}?`)) return;
    try {
      await deleteExternalFactor(factor.id);
      notify("Entry deleted.");
      if (form.id === factor.id) setForm(emptyForm());
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify(err.message);
    }
  };

  // The forecast only uses factors logged on at least half of the days.
  const recentDays = new Set(
    Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i - 1);
      return d.toLocaleDateString("en-CA");
    })
  );
  const loggedRecently = factors.filter((f) => recentDays.has(f.date)).length;

  return (
    <>
      <div className="page-title">
        <div><h2>External Factors</h2><p>Log fuel prices, weather, and holidays used by the forecasting model.</p></div>
      </div>

      <div className={loggedRecently >= 15 ? "info-box" : "warn-box"} style={{ marginBottom: 16 }}>
        Logged on <strong>{loggedRecently} of the last 30 days</strong>. The forecast uses these factors once they are
        logged on at least half of the days — log them every day for the best results. Upcoming holidays can be
        logged in advance.
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">☁</div>
            <div><h3>{form.id ? `Edit ${form.date}` : "Log External Factor"}</h3><p>Record conditions that affect fish supply</p></div>
          </div>

          <div className="form-group"><label htmlFor="factor-date">Date</label><input id="factor-date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></div>
          <div className="form-group">
            <label htmlFor="factor-fuel">Fuel Price per Liter (optional)</label>
            <div className="input-with-unit"><span>₱</span><input id="factor-fuel" type="number" min="0" step="0.01" placeholder="e.g. 63.50" value={form.fuel_price} onChange={(e) => update("fuel_price", e.target.value)} /></div>
          </div>
          <div className="form-group">
            <label htmlFor="factor-weather">Weather Condition</label>
            <select id="factor-weather" value={form.weather} onChange={(e) => update("weather", e.target.value)}>
              <option value="sunny">Sunny</option>
              <option value="cloudy">Cloudy</option>
              <option value="rainy">Rainy</option>
              <option value="stormy">Stormy</option>
            </select>
          </div>
          <div className="toggle-row">
            <div><strong>Holiday or Fiesta</strong><p>Mark if this date is a local holiday.</p></div>
            <label className="switch"><input type="checkbox" checked={form.is_holiday} onChange={(e) => update("is_holiday", e.target.checked)} /><span className="slider"></span></label>
          </div>
          <div className="form-group"><label htmlFor="factor-notes">Notes (optional)</label><input id="factor-notes" maxLength={200} value={form.notes} placeholder="e.g. Fishing trips suspended" onChange={(e) => update("notes", e.target.value)} /></div>
          <div className="button-row">
            {form.id && <button className="secondary-btn" onClick={() => setForm(emptyForm())}>Cancel</button>}
            <button className="primary-btn full-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Save Changes" : "Save Factor"}</button>
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon purple">▤</div>
            <div><h3>Recent Entries</h3><p>Latest logged external conditions</p></div>
          </div>

          {error && <div className="warn-box" role="alert">{error}</div>}
          <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
            <table className="inner-table">
              <thead><tr><th>DATE</th><th>FUEL</th><th>WEATHER</th><th>HOLIDAY</th><th>ACTIONS</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="empty-row">Loading…</td></tr>
                ) : factors.length === 0 ? (
                  <tr><td colSpan="5" className="empty-row">No external factors logged yet.</td></tr>
                ) : factors.slice(0, 60).map((f) => (
                  <tr key={f.id}>
                    <td>{f.date}</td>
                    <td><strong>{peso(f.fuel_price)}</strong></td>
                    <td>{f.weather_display}</td>
                    <td>{f.is_holiday ? <span className="badge pending" title={f.notes}>Yes</span> : <span className="badge inactive">No</span>}</td>
                    <td>
                      <div className="action-icons">
                        <button title="Edit" onClick={() => edit(f)}>✎</button>
                        <button title="Delete" onClick={() => remove(f)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default ExternalFactorsPage;
