import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl } from "../api/config.js";

const peso = (n) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
const shortDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

// Small line chart of the last 30 days of official prices.
function PriceSparkline({ history }) {
  if (history.length < 2) return <p className="fp-muted">Not enough prices yet for a chart.</p>;
  const W = 460, H = 130, PAD_X = 8, PAD_TOP = 12, PAD_BOTTOM = 22;
  const values = history.map((h) => h.price);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => PAD_X + (i / (history.length - 1)) * (W - PAD_X * 2);
  const y = (v) => PAD_TOP + (1 - (v - min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const line = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(history.length - 1).toFixed(1)},${H - PAD_BOTTOM} L${x(0).toFixed(1)},${H - PAD_BOTTOM} Z`;
  const last = history[history.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fp-chart" role="img"
      aria-label={`Official price over the last ${history.length} days, from ${peso(history[0].price)} to ${peso(last.price)}`}>
      <defs>
        <linearGradient id="fp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3fc1d9" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3fc1d9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PAD_X} x2={W - PAD_X} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} stroke="#d7e3ec" />
      <path d={area} fill="url(#fp-fill)" />
      <path d={line} fill="none" stroke="#0e7c86" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(history.length - 1)} cy={y(last.price)} r="4.5" fill="#ff7a1a" stroke="#fff" strokeWidth="2" />
      <text x={PAD_X} y={H - 6} fontSize="11" fill="#667085">{shortDate(history[0].date)}</text>
      <text x={W - PAD_X} y={H - 6} fontSize="11" fill="#667085" textAnchor="end">{shortDate(last.date)}</text>
    </svg>
  );
}

/**
 * Public "fish profile" opened from a price card on the landing page.
 * item: { fish_id, fish_name, municipality_id, municipality_name, has_photo, updated_at }
 */
export default function FishProfileModal({ item, onClose, onLogin, onRegister }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = item.municipality_id ? `?municipality=${item.municipality_id}` : "";
    fetch(apiUrl(`/public/fish/${item.fish_id}/${params}`))
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.message || "Could not load this fish."); return d; })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [item]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fish = data?.fish;
  const photo = (fish?.has_photo ?? item.has_photo)
    ? apiUrl(`/fish-species/${item.fish_id}/photo/?v=${encodeURIComponent(fish?.updated_at || item.updated_at || "")}`)
    : "";
  const change = data?.weekly_change_percent;

  // Rendered at the end of <body> so the landing panel's animation can't trap it.
  return createPortal(
    <div className="fp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <article className="fp-modal" role="dialog" aria-modal="true" aria-labelledby="fp-title">
        <button className="fp-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="fp-photo">
          {photo ? <img src={photo} alt={item.fish_name} /> : <span>{item.fish_name.slice(0, 2).toUpperCase()}</span>}
        </div>

        <div className="fp-body">
          <header>
            <span className="fp-eyebrow">Official LGU price · {item.municipality_name}</span>
            <h3 id="fp-title">{item.fish_name}</h3>
            {fish?.scientific_name && <em className="fp-sci">{fish.scientific_name}</em>}
          </header>

          {error && <div className="fp-error" role="alert">{error}</div>}
          {!data && !error && <p className="fp-muted">Loading…</p>}

          {data && (
            <>
              <div className="fp-price-row">
                <div className="fp-price">
                  <strong>{peso(data.latest.price_per_kg)}</strong><small>/kg</small>
                </div>
                {change !== null && change !== undefined && (
                  <span className={`fp-change ${change > 0 ? "up" : change < 0 ? "down" : ""}`}>
                    {change > 0 ? "▲" : change < 0 ? "▼" : "▬"} {Math.abs(change)}% vs a week ago
                  </span>
                )}
              </div>

              <dl className="fp-facts">
                <div><dt>Price date</dt><dd>{longDate(data.latest.recorded_date)}</dd></div>
                <div><dt>Municipality</dt><dd>{data.municipality.name}{data.municipality.province ? `, ${data.municipality.province}` : ""}</dd></div>
                {data.week_ago && <div><dt>A week earlier</dt><dd>{peso(data.week_ago.price_per_kg)} ({shortDate(data.week_ago.recorded_date)})</dd></div>}
                <div><dt>Published by</dt><dd>The LGU{data.latest.is_correction ? " (corrected)" : ""}</dd></div>
              </dl>

              {data.closed_seasons_now.length > 0 && (
                <div className="fp-season">
                  <strong>🚫 Closed fishing season now</strong>
                  {data.closed_seasons_now.map((s) => (
                    <p key={s.name}>{s.area}: {s.notes || "Catching this fish is banned for now."} Less supply can raise prices.</p>
                  ))}
                </div>
              )}

              <section className="fp-section">
                <h4>Last 30 days</h4>
                <PriceSparkline history={data.history} />
                {data.stats_30_days && (
                  <div className="fp-stats">
                    <div><span>Lowest</span><b>{peso(data.stats_30_days.low)}</b></div>
                    <div><span>Average</span><b>{peso(data.stats_30_days.average)}</b></div>
                    <div><span>Highest</span><b>{peso(data.stats_30_days.high)}</b></div>
                  </div>
                )}
              </section>

              {fish?.description && (
                <section className="fp-section">
                  <h4>About this fish</h4>
                  <p>{fish.description}</p>
                </section>
              )}

              {data.also_priced_in.length > 0 && (
                <p className="fp-muted">Also priced in: {data.also_priced_in.join(", ")}</p>
              )}
              {fish?.photo_credit && <p className="fp-credit">Photo: {fish.photo_credit}</p>}

              <div className="fp-actions">
                <button className="pill-btn pill-orange" onClick={onLogin}>Log in for forecasts</button>
                <button className="pill-btn" onClick={onRegister}>Register as a vendor</button>
              </div>
            </>
          )}
        </div>
      </article>
    </div>,
    document.body,
  );
}
