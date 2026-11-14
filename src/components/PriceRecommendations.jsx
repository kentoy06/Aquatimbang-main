import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl, authHeaders } from "../api/config.js";
import { askConfirm } from "./ConfirmDialog.jsx";
import PagedTable from "./PagedTable.jsx";

const peso = (n) => (n === null || n === undefined ? "—" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (n) => `${Math.round((n || 0) * 100)}%`;

// Same reasons as the server's PriceCorrection.REASON_CHOICES.
const CHANGE_REASONS = [
  ["encoding_error", "Encoding error (wrong digit or decimal)"],
  ["dvmf_correction", "Corrected by the DVMF official record"],
  ["market_change", "Market price changed sharply the same day"],
  ["wrong_market_or_date", "Wrong market or date"],
];

async function call(path, method = "GET", body) {
  const r = await fetch(apiUrl(path), {
    method,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const message = data.message || data.detail || Object.values(data).flat().join(" ");
    throw new Error(message || "Something went wrong.");
  }
  return data;
}

/**
 * Price Recommendations (LGU): for each fish, the price history plus the
 * vendors' suggestions of the last days, with the vendors' reasons grouped
 * by text clustering, give a recommended price that the LGU publishes.
 */
export default function PriceRecommendations({ notify }) {
  const [market, setMarket] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [details, setDetails] = useState(null);
  const [override, setOverride] = useState(null); // { row, price, category, reason }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await call(`/price-recommendations/${market ? `?market=${market}` : ""}`);
      setData(result);
      if (!market && result.market) setMarket(String(result.market.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [market]);
  useEffect(() => { load(); }, [load]);

  const publish = async (row, extra = {}) => {
    const price = extra.price_per_kg ?? row.recommended_price;
    if (!extra.price_per_kg && !(await askConfirm(
      `Publish ${row.fish_name} at ${peso(price)}/kg for today at ${data.market?.name}?\n\n${row.basis}`,
      { confirmLabel: "Publish" },
    ))) return;
    setBusy(row.fish_id);
    try {
      const result = await call("/price-recommendations/publish/", "POST", {
        fish_species: row.fish_id, market: data.market?.id, municipality: data.municipality?.id, ...extra,
      });
      notify?.(result.message);
      setOverride(null);
      load();
    } catch (e) {
      if (override) setOverride((o) => ({ ...o, error: e.message }));
      else notify?.(e.message);
    } finally {
      setBusy(null);
    }
  };

  const rows = data?.results || [];
  const withVendors = rows.filter((r) => r.vendor_count > 0).length;
  const rules = rows[0]?.rules;

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Recommendations</h2>
          <p>Today's recommended price for each fish, from the price history and the vendors' suggested prices and reasons.</p>
        </div>
        {data?.markets?.length > 0 && (
          <select className="recommend-market" value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Market">
            {data.markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      <div className="info-box recommend-how">
        <strong>How the price is computed.</strong> Start from the history: the median of the latest {rules?.history_count || 7} published prices.
        The vendors' reasons from the last {rules?.suggestion_days || 7} days are grouped by text clustering. When at least {rules?.min_vendors || 3} vendors
        suggested and at least {pct(rules?.agreement_share || 0.6)} of them gave the same reason, the vendors' median price counts
        {" "}{pct(rules?.weight_per_vendor || 0.1)} per vendor (up to {pct(rules?.max_vendor_weight || 0.7)}); otherwise the history alone is used.
        {" "}<strong>When the vendors agree, the price is published automatically</strong> as soon as a vendor submits, and it is updated as more vendors suggest.
        These published prices become the price history the forecast learns from. When vendors disagree, publish the price here yourself.
      </div>

      {error && <div className="warn-box" role="alert">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>{data?.market?.name || "Market"} · {data?.municipality?.name || ""}</h3>
            <p>{rows.length} fish · {withVendors} with vendor suggestions</p>
          </div>
          <button className="secondary-btn" onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
        <PagedTable>
          <thead>
            <tr>
              <th>FISH</th><th>LAST PRICE</th><th>HISTORY MEDIAN</th><th>VENDORS</th><th>MAIN REASON</th>
              <th>VENDOR WEIGHT</th><th>RECOMMENDED</th><th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr><td colSpan="8" className="empty-row">Loading recommendations…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8" className="empty-row">No price history or vendor suggestions yet. Import the DVMF price records first.</td></tr>
            ) : rows.map((r) => {
              const top = r.clusters[0];
              return (
                <tr key={r.fish_id}>
                  <td><strong>{r.fish_name}</strong></td>
                  <td>{peso(r.last_price)}{r.last_date && <small className="muted-text" style={{ display: "block" }}>{r.last_date}</small>}</td>
                  <td>{peso(r.history_median)}</td>
                  <td>{r.vendor_count ? <>{r.vendor_count} · {peso(r.vendor_median)}</> : <span className="muted-text">None</span>}</td>
                  <td>
                    {top ? (
                      <button type="button" className="reason-chip" onClick={() => setDetails(r)} title="See all reason groups">
                        {top.label} <b>{pct(top.share)}</b>
                      </button>
                    ) : <span className="muted-text">—</span>}
                  </td>
                  <td>{r.vendor_weight ? pct(r.vendor_weight) : <span className="muted-text">0%</span>}</td>
                  <td>
                    <strong>{peso(r.recommended_price)}</strong>
                    {r.change_percent !== null && r.change_percent !== 0 && (
                      <small className={r.change_percent > 0 ? "rec-up" : "rec-down"}> {r.change_percent > 0 ? "▲" : "▼"} {Math.abs(r.change_percent)}%</small>
                    )}
                    {!r.in_allowed_range && <small className="rec-warn">Outside the allowed range</small>}
                  </td>
                  <td>
                    {r.published_today && r.published_today_automatic ? (
                      <div className="action-buttons">
                        <span className="badge success" title="Published automatically because the vendors agree on the reason">Auto-published {peso(r.published_today_price)}</span>
                        <button className="secondary-btn" disabled={busy === r.fish_id} onClick={() => setOverride({ row: r, price: r.published_today_price ?? "", category: "", reason: "" })}>Change</button>
                        <button className="text-btn" onClick={() => setDetails(r)}>Why?</button>
                      </div>
                    ) : r.published_today ? (
                      <span className="badge success">Published {peso(r.published_today_price)}</span>
                    ) : (
                      <div className="action-buttons">
                        <button className="primary-btn" disabled={busy === r.fish_id || r.recommended_price === null || !r.in_allowed_range} onClick={() => publish(r)}>Publish</button>
                        <button className="secondary-btn" disabled={busy === r.fish_id} onClick={() => setOverride({ row: r, price: r.recommended_price ?? "", category: "", reason: "" })}>Other price</button>
                        <button className="text-btn" onClick={() => setDetails(r)}>Why?</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </PagedTable>
      </div>

      {details && createPortal(
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetails(null); }}>
          <div className="modal reasons-modal" role="dialog" aria-modal="true" aria-labelledby="reasons-title">
            <div className="modal-head">
              <h3 id="reasons-title">Why vendors suggest these prices: {details.fish_name}</h3>
              <button className="modal-close" onClick={() => setDetails(null)} aria-label="Close">✕</button>
            </div>
            <p className="reasons-basis">{details.basis}</p>
            <div className="profile-grid">
              <div className="profile-field"><span>History median</span><strong>{peso(details.history_median)}</strong></div>
              <div className="profile-field"><span>Vendors' median ({details.vendor_count})</span><strong>{peso(details.vendor_median)}</strong></div>
              <div className="profile-field"><span>Vendor weight</span><strong>{pct(details.vendor_weight)}</strong></div>
              <div className="profile-field"><span>Recommended</span><strong>{peso(details.recommended_price)}</strong></div>
            </div>
            <div className="mini-head">Reason groups (text clustering of the vendors' reasons and comments)</div>
            {details.clusters.length === 0 ? <p className="empty-row">No vendor suggestions in the last days.</p> : (
              <ul className="reason-clusters">
                {details.clusters.map((c, i) => (
                  <li key={i}>
                    <div className="reason-cluster-head">
                      <strong>{c.label}</strong>
                      <span>{c.size} vendor{c.size === 1 ? "" : "s"} · {pct(c.share)} · median {peso(c.median_price)}</span>
                    </div>
                    <div className="reason-bar"><span style={{ width: pct(c.share) }} /></div>
                    {c.top_terms.length > 0 && <small>Key words: {c.top_terms.join(", ")}</small>}
                    {c.comments.length > 0 && <ul className="reason-comments">{c.comments.map((t, j) => <li key={j}>"{t}"</li>)}</ul>}
                  </li>
                ))}
              </ul>
            )}
            <div className="button-row"><button className="primary-btn" onClick={() => setDetails(null)}>Close</button></div>
          </div>
        </div>,
        document.body,
      )}

      {override && createPortal(
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOverride(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="override-title">
            <div className="modal-head">
              <h3 id="override-title">Publish a different price: {override.row.fish_name}</h3>
              <button className="modal-close" onClick={() => setOverride(null)} aria-label="Close">✕</button>
            </div>
            <p className="muted-text" style={{ marginTop: 0 }}>
              Recommended: <strong>{peso(override.row.recommended_price)}</strong>. A different price needs a clear reason, which is saved with the price and in the audit log.
            </p>
            <div className="form-group">
              <label htmlFor="override-price">Price per kg</label>
              <div className="input-with-unit"><span>₱</span>
                <input id="override-price" type="number" min="0.01" step="0.01" value={override.price} onChange={(e) => setOverride((o) => ({ ...o, price: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="override-category">Reason</label>
              <select id="override-category" value={override.category} onChange={(e) => setOverride((o) => ({ ...o, category: e.target.value }))}>
                <option value="">Choose why</option>
                {CHANGE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="override-reason">Explain (at least 30 characters)</label>
              <textarea id="override-reason" rows={3} value={override.reason} placeholder="What did you see, and where did the price come from?"
                onChange={(e) => setOverride((o) => ({ ...o, reason: e.target.value }))} />
              <small className="field-help">{override.reason.trim().length}/30</small>
            </div>
            {override.error && <div className="warn-box" role="alert">{override.error}</div>}
            <div className="button-row">
              <button className="secondary-btn" onClick={() => setOverride(null)} disabled={Boolean(busy)}>Cancel</button>
              <button className="primary-btn" disabled={Boolean(busy) || !override.price || !override.category || override.reason.trim().length < 30}
                onClick={() => publish(override.row, { price_per_kg: override.price, reason_category: override.category, reason: override.reason.trim() })}>
                Publish this price
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
