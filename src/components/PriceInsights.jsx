import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import PagedTable from "./PagedTable.jsx";

/**
 * Learned price check: asks the server whether a price is unusual for this
 * fish and municipality, half a second after the officer stops typing.
 */
export function usePriceCheck({ speciesId, municipalityId, price, date, marketId }) {
  const [result, setResult] = useState(null);
  const key = speciesId && municipalityId && Number(price) > 0 ? `${speciesId}|${municipalityId}|${marketId || ""}|${price}|${date}` : "";

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ species: speciesId, municipality: municipalityId, price: String(price) });
      if (date) params.set("date", date);
      if (marketId) params.set("market", marketId);
      fetch(apiUrl(`/insights/price-check/?${params}`), { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (!cancelled) setResult(data ? { key, ...data } : null); })
        .catch(() => { if (!cancelled) setResult(null); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, speciesId, municipalityId, price, date, marketId]);

  return result && result.key === key ? result : null;
}

const ICONS = { normal: "✓", unusual: "⚠", very_unusual: "⚠", no_history: "ℹ" };

export function PriceCheckNote({ check }) {
  if (!check) return null;
  return (
    <div className={`price-check ${check.level}`} role={check.level === "normal" || check.level === "no_history" ? "status" : "alert"}>
      <span aria-hidden="true">{ICONS[check.level] || "ℹ"}</span>
      <p>
        {check.level === "very_unusual" && <strong>Very unusual price. </strong>}
        {check.level === "unusual" && <strong>Unusual price. </strong>}
        {check.message}
        {check.history_count > 0 && check.level !== "no_history" && (
          <small> Learned from {check.history_count} published prices in the last {check.window_days} days.</small>
        )}
      </p>
    </div>
  );
}

const peso = (n) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Prices of the last 30 days that don't fit their fish's learned normal range.
export function LearnedOutliers({ title = "Unusual prices (learned)" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl(`/insights/outliers/?days=${days}`), { headers: authHeaders() })
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.detail || d?.message || "Could not load unusual prices."); return d; })
      .then((d) => { if (!cancelled) { setData(d); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>
            Each price is compared with its own fish and municipality's normal range, learned from the previous
            {data ? ` ${data.window_days}` : " 90"} days (median and robust z-score), so a ₱300 Lapu-lapu is fine but a ₱300 Galunggong is not.
          </p>
        </div>
        <select aria-label="Period" value={days} onChange={(e) => { setData(null); setDays(Number(e.target.value)); }}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      {error && <div className="warn-box" style={{ margin: "0 18px 18px" }}>{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <PagedTable>
          <thead><tr><th>DATE</th><th>FISH</th><th>MUNICIPALITY</th><th>PRICE / KG</th><th>USUAL RANGE</th><th>DIFFERENCE</th><th>LEVEL</th><th>STATUS</th></tr></thead>
          <tbody>
            {!data && !error && <tr><td colSpan="8" className="empty-row">Checking prices…</td></tr>}
            {data?.outliers.length === 0 && <tr><td colSpan="8" className="empty-row">No unusual prices in this period.</td></tr>}
            {data?.outliers.map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td><strong>{row.fish}</strong></td>
                <td>{row.municipality}</td>
                <td><strong>{peso(row.price)}</strong></td>
                <td>{peso(row.usual_low)} – {peso(row.usual_high)}</td>
                <td className={row.percent_from_usual > 0 ? "up" : "down"}>{row.percent_from_usual > 0 ? "+" : ""}{row.percent_from_usual}%</td>
                <td><span className={`badge ${row.level === "very_unusual" ? "rejected" : "pending"}`}>{row.level === "very_unusual" ? "Very unusual" : "Unusual"}</span></td>
                <td style={{ textTransform: "capitalize" }}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </PagedTable>
      </div>
    </div>
  );
}
