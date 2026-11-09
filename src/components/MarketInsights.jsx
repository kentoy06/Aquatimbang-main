import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders, fetchAll } from "../api/config.js";

const CONDITION_ICONS = {
  stormy: "⛈", rainy: "🌧", holiday: "🎉", holiday_eve: "📅", weekend: "🗓",
  closed_season: "🚫", fuel_up: "⛽", fuel_down: "⛽",
};
const SHORT = {
  stormy: "Stormy", rainy: "Rainy", holiday: "Holiday", holiday_eve: "Day before a holiday",
  weekend: "Weekend", closed_season: "Closed season", fuel_up: "Diesel up", fuel_down: "Diesel down",
};
const pct = (n) => `${Math.round(n * 100)}%`;
const longDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "");

/**
 * Market Insights: association rules mined from published prices and the
 * logged conditions (weather, holidays, diesel, closed seasons).
 */
export default function MarketInsights() {
  const [species, setSpecies] = useState([]);
  const [places, setPlaces] = useState([]);
  const [fishId, setFishId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [days, setDays] = useState(730);
  const [state, setState] = useState({ key: "", data: null, error: "" });

  useEffect(() => {
    fetchAll("/fish-species/").then((rows) => setSpecies(rows.filter((s) => s.is_active !== false).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    fetchAll("/municipalities/").then((rows) => setPlaces(rows.filter((m) => m.is_active !== false))).catch(() => {});
  }, []);

  const key = `${fishId}|${placeId}|${days}`;
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ days: String(days) });
    if (fishId) params.set("species", fishId);
    if (placeId) params.set("municipality", placeId);
    fetch(apiUrl(`/insights/rules/?${params}`), { headers: authHeaders() })
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.detail || d?.message || "Could not load insights."); return d; })
      .then((d) => { if (!cancelled) setState({ key, data: d, error: "" }); })
      .catch((e) => { if (!cancelled) setState({ key, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [key, fishId, placeId, days]);

  const loading = state.key !== key;
  const data = loading ? null : state.data;
  const subject = data?.fish || "all fish";

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Market Insights</h2>
          <p>Patterns mined from past prices: which conditions go together with prices above or below their usual level.</p>
        </div>
      </div>

      <div className="panel insights-filters">
        <label>Fish
          <select value={fishId} onChange={(e) => setFishId(e.target.value)}>
            <option value="">All fish</option>
            {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Municipality
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">All municipalities</option>
            {places.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>Period
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={365}>Last year</option>
            <option value={730}>Last 2 years</option>
            <option value={1500}>All history</option>
          </select>
        </label>
      </div>

      {!loading && state.error && <div className="warn-box" role="alert">{state.error}</div>}
      {loading && <div className="panel" style={{ padding: 20 }}>Mining the price history…</div>}

      {data && (
        <>
          <div className="insights-summary">
            <div><b>{data.transactions.toLocaleString()}</b><span>fish-days analysed</span></div>
            {data.baseline && <div><b>{pct(data.baseline.above)}</b><span>of days {subject} was above its usual price</span></div>}
            {data.baseline && <div><b>{pct(data.baseline.below)}</b><span>of days it was below</span></div>}
            <div><b>{data.rules.length}</b><span>strong patterns found</span></div>
          </div>
          {data.from && <p className="insights-period">Prices from {longDate(data.from)} to {longDate(data.to)}{data.municipality ? ` in ${data.municipality}` : ""}.</p>}

          {data.transactions < 30 ? (
            <div className="panel" style={{ padding: 20 }}>Not enough published prices with logged conditions yet. Keep publishing prices and logging External Factors daily.</div>
          ) : data.rules.length === 0 ? (
            <div className="panel" style={{ padding: 20 }}>No strong patterns for {subject} in this period. Prices moved the same way whatever the conditions.</div>
          ) : (
            <div className="insights-rules">
              {data.rules.map((rule) => (
                <article key={`${rule.conditions.join("+")}-${rule.outcome}`} className={`insight-rule ${rule.outcome}`}>
                  <div className="insight-if">
                    <span className="insight-label">When</span>
                    {rule.conditions.map((c) => (
                      <span key={c} className="insight-chip"><span aria-hidden="true">{CONDITION_ICONS[c]}</span> {SHORT[c] || c}</span>
                    ))}
                  </div>
                  <div className="insight-then">
                    <span className="insight-arrow" aria-hidden="true">{rule.outcome === "above" ? "▲" : "▼"}</span>
                    <div>
                      <strong>{pct(rule.confidence)}</strong>
                      <span>of those days the price was {rule.outcome === "above" ? "above" : "below"} usual, by about {Math.abs(rule.average_percent)}%</span>
                    </div>
                  </div>
                  <p className="insight-text">{rule.text}</p>
                  <dl className="insight-measures">
                    <div><dt>Seen on</dt><dd>{rule.days_matched} of {rule.days_with_conditions} days</dd></div>
                    <div><dt>Confidence</dt><dd>{pct(rule.confidence)}</dd></div>
                    <div><dt>Lift</dt><dd>{rule.lift}× more likely</dd></div>
                    <div><dt>Support</dt><dd>{(rule.support * 100).toFixed(1)}% of all days</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          )}

          <details className="insights-how">
            <summary>How are these found? (association rule mining)</summary>
            <ol>
              <li>Each day with a published price is one record: the conditions that day (weather, holiday, weekend, closed season, diesel change) and whether the price was <b>above</b> or <b>below</b> its usual level (more than {data.settings?.level_percent ?? 4}% from its median over the previous {data.settings?.usual_window_days ?? 28} days).</li>
              <li>Like the Apriori method, the system counts conditions and pairs of conditions that happen often, then measures how often each is followed by a price above or below usual.</li>
              <li>
                A pattern is shown only when it happened on at least {data.settings?.min_days ?? 5} days (<b>support</b>), held at least {pct(data.settings?.min_confidence ?? 0.4)} of the time (<b>confidence</b>),
                and is at least {data.settings?.min_lift ?? 1.25}× more likely than on an ordinary day (<b>lift</b>).
              </li>
              <li>Patterns show what tends to happen together, not proof of cause. They get better the more days of prices and External Factors are logged.</li>
            </ol>
          </details>
        </>
      )}
    </>
  );
}
