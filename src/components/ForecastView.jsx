import React, { useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FACTOR_LABELS, getForecast } from "../api/forecast.js";
import PriceExplanation from "./PriceExplanation.jsx";
import "./Forecast.css";
import { useT } from "../i18n/vendor.js";
import PagedTable from "./PagedTable.jsx";

const peso = (n) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? "—"
    : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

// Join history and forecast into one series for the chart. The forecast
// line starts at the last published price so the two lines connect.
function chartRows(result) {
  const history = result.history.map((p) => ({ date: p.date, actual: p.price }));
  const last = result.history[result.history.length - 1];
  if (last) {
    history[history.length - 1] = { ...history[history.length - 1], forecast: last.price, band: [last.price, last.price] };
  }
  const future = result.forecast.map((p) => ({ date: p.date, forecast: p.price, band: [p.lower, p.upper] }));
  return [...history, ...future];
}

function ChartTooltip({ active, payload, label }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="forecast-tooltip">
      <strong>{longDate(label)}</strong>
      {row.actual !== undefined && <div>{t("Published")}: {peso(row.actual)}</div>}
      {row.forecast !== undefined && row.actual === undefined && (
        <>
          <div>{t("Forecast")}: {peso(row.forecast)}</div>
          <div className="muted">{t("95% range")}: {peso(row.band[0])} – {peso(row.band[1])}</div>
        </>
      )}
    </div>
  );
}

// describeFactorEffect, translated.
function factorEffect(t, name, value) {
  const amount = `₱${Math.abs(value).toFixed(2)}/kg`;
  if (name === "fuel_price") {
    return t(value >= 0 ? "Each ₱1/liter rise in fuel raises the price by about {amount}." : "Each ₱1/liter rise in fuel lowers the price by about {amount}.", { amount });
  }
  return t(value >= 0 ? "{factor} raises the price by about {amount}." : "{factor} lowers the price by about {amount}.", { factor: t(FACTOR_LABELS[name] || name), amount });
}

function exportCsv(result) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["Date", "Forecast price per kg", "Lower (95%)", "Upper (95%)", "Model"],
    ...result.forecast.map((p) => [p.date, p.price.toFixed(2), p.lower.toFixed(2), p.upper.toFixed(2), result.model_used]),
  ];
  const blob = new Blob(["﻿" + rows.map((r) => r.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${result.fish_name}_forecast.csv`.replace(/\s+/g, "_");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Price forecast page shared by every dashboard.
 *
 * species:        [{ id, name }] — selectable fish species
 * municipalities: [{ id, name }] — selectable municipalities ("" = all)
 * defaultMunicipalityId: municipality selected at first
 * onGenerated:    called after a new forecast is made (e.g. to refresh a history list)
 */
function ForecastView({ species = [], municipalities = [], defaultMunicipalityId = "", notify, onGenerated, description }) {
  const t = useT();
  const [speciesChoice, setSpeciesChoice] = useState("");
  const [municipalityId, setMunicipalityId] = useState(defaultMunicipalityId ? String(defaultMunicipalityId) : "");
  const [horizon, setHorizon] = useState("7");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const speciesId = species.some((s) => String(s.id) === speciesChoice) ? speciesChoice : String(species[0]?.id ?? "");

  useEffect(() => {
    if (!speciesId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setMessage("");
    getForecast({ speciesId, municipalityId, horizon })
      .then((data) => {
        if (cancelled) return;
        if (data.not_enough_data) {
          setResult(null);
          setMessage(data.message);
        } else {
          setResult(data);
          if (!data.cached) onGenerated?.(data);
        }
      })
      .catch((err) => { if (!cancelled) { setResult(null); setError(err.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onGenerated is a callback from the parent; re-running on its identity is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesId, municipalityId, horizon]);

  const last = result?.history?.[result.history.length - 1];
  const end = result?.forecast?.[result.forecast.length - 1];
  const change = last && end ? ((end.price - last.price) / last.price) * 100 : 0;
  const isSarimax = result?.model_type === "sarimax";
  // Changes under half a percent are reported as "about the same".
  const flat = Math.abs(change) < 0.5;
  const changeText = `${change > 0 && !flat ? "+" : ""}${flat ? "0.0" : change.toFixed(1)}%`;
  const peak = result?.forecast?.reduce((best, p) => (!best || p.price > best.price ? p : best), null);
  const municipalityName = municipalities.find((m) => String(m.id) === municipalityId)?.name || t("all municipalities");

  return (
    <>
      <div className="page-title">
        <div>
          <h2>{t("Price Forecast")}</h2>
          <p>{t(description || "Short-term price forecasts from published prices and external factors (SARIMAX).")}</p>
        </div>
        <div className="filter-row forecast-filters">
          <select className="date-input" aria-label={t("Fish species")} value={speciesId} onChange={(e) => setSpeciesChoice(e.target.value)} disabled={!species.length}>
            {!species.length && <option value="">{t("No fish species")}</option>}
            {species.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          <select className="date-input" aria-label={t("Municipality")} value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)}>
            <option value="">{t("All municipalities")}</option>
            {municipalities.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
          </select>
          <select className="date-input" aria-label={t("Forecast period")} value={horizon} onChange={(e) => setHorizon(e.target.value)}>
            <option value="7">{t("Next {n} days", { n: 7 })}</option>
            <option value="14">{t("Next {n} days", { n: 14 })}</option>
            <option value="30">{t("Next {n} days", { n: 30 })}</option>
          </select>
        </div>
      </div>

      <div className="notice">
        <div className="notice-icon">!</div>
        <div>
          <strong>{t("Estimates only — not official LGU prices")}</strong>
          <p>{t("Forecasts show the most likely price and a 95% range. Real prices can fall outside it during unusual market events.")}</p>
        </div>
      </div>

      <PriceExplanation speciesId={speciesId} municipalityId={municipalityId} />

      {loading ? (
        <div className="panel forecast-state">
          <div className="forecast-spinner" aria-hidden="true" />
          <div>
            <strong>{t("Running the forecast model…")}</strong>
            <p>{t("The first forecast after new prices are published can take up to a minute.")}</p>
          </div>
        </div>
      ) : error ? (
        <div className="panel forecast-state"><div className="warn-box" role="alert">{error}</div></div>
      ) : message ? (
        <div className="panel forecast-state"><p>{message}</p></div>
      ) : !result ? (
        <div className="panel forecast-state"><p>{t("Select a fish species to see its forecast.")}</p></div>
      ) : (
        <>
          {result.warnings?.length > 0 && (
            <div className="warn-box forecast-warnings">
              {result.warnings.map((w) => <div key={w}>⚠ {w}</div>)}
            </div>
          )}

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">₱</div>
              <div><span>{t("Latest Published Price")}</span><h2>{peso(last?.price)}</h2><small>{last ? longDate(last.date) : "—"}</small></div>
            </div>
            <div className="stat-card">
              <div className={`stat-icon ${flat ? "blue" : change > 0 ? "orange" : "green"}`}>{flat ? "●" : change > 0 ? "▲" : "▼"}</div>
              <div><span>{t("Forecast for {date}", { date: end ? longDate(end.date) : "—" })}</span><h2>{peso(end?.price)}</h2><small>{changeText} · {t("range")} {peso(end?.lower)} – {peso(end?.upper)}</small></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple">∿</div>
              <div><span>{t("Forecast Accuracy (MAPE)")}</span><h2>{result.mape !== null ? `${result.mape}%` : "—"}</h2><small>{result.mape !== null ? t("Average error on the last {n} days", { n: result.holdout_days }) : t("Not measured for trend lines")}</small></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">∑</div>
              <div><span>{t("Model")}</span><h2 className="forecast-model-name">{isSarimax ? "SARIMAX" : t("Trend")}</h2><small>{result.model_used}</small></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h3>{result.fish_name} — {municipalityName}</h3>
                <p>{t("Last {past} days of published prices and the next {next} days", { past: result.history.length, next: result.forecast.length })}</p>
              </div>
              <button className="secondary-btn" onClick={() => { exportCsv(result); notify?.(t("Forecast exported.")); }}>↓ {t("Export CSV")}</button>
            </div>
            <div className="forecast-chart" role="img" aria-label={`Price chart for ${result.fish_name}: published prices and forecast with 95% range`}>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartRows(result)} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="#eaecf0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} tick={{ fontSize: 12, fill: "#667085" }} />
                  <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `₱${Math.round(v)}`} width={56} tick={{ fontSize: 12, fill: "#667085" }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area dataKey="band" name={t("95% range")} stroke="none" fill="#f59e0b" fillOpacity={0.18} isAnimationActive={false} />
                  <Line dataKey="actual" name={t("Published price")} stroke="#0E7C86" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="forecast" name={t("Forecast")} stroke="#d97706" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="insight-box">
              <strong>📈 {t("Insight")}</strong>
              <p>
                {flat
                  ? t("{fish} is expected to stay about the same over the next {n} days, ", { fish: result.fish_name, n: result.forecast.length })
                  : t(change > 0
                      ? "{fish} is expected to rise by about {pct}% over the next {n} days, "
                      : "{fish} is expected to ease by about {pct}% over the next {n} days, ",
                    { fish: result.fish_name, pct: Math.abs(change).toFixed(1), n: result.forecast.length })}
                {t("ending near {price} per kilogram (likely between {low} and {high}).", { price: peso(end?.price), low: peso(end?.lower), high: peso(end?.upper) })}
                {peak && last && peak.price > last.price * 1.02 && peak.date !== end?.date && (
                  <> {t("The highest price is expected on {date}, at about {price}.", { date: longDate(peak.date), price: peso(peak.price) })}</>
                )}
              </p>
            </div>
          </div>

          <div className="config-grid forecast-details">
            <div className="config-card">
              <div className="config-header">
                <div className="config-icon orange">☁</div>
                <div><h3>{t("External Factors")}</h3><p>{t("Effect of each factor found by the model")}</p></div>
              </div>
              {Object.keys(result.coefficients || {}).length === 0 ? (
                <p className="forecast-muted">
                  {isSarimax
                    ? t("No external factors were used — the forecast is based on price history only.")
                    : t("External factors are only used by the SARIMAX model.")}
                </p>
              ) : (
                <ul className="forecast-factors">
                  {Object.entries(result.coefficients).map(([name, value]) => (
                    <li key={name}><strong>{t(FACTOR_LABELS[name] || name)}</strong><span>{factorEffect(t, name, value)}</span></li>
                  ))}
                </ul>
              )}
            </div>

            <div className="config-card">
              <div className="config-header">
                <div className="config-icon blue">∑</div>
                <div><h3>{t("Model Details")}</h3><p>{t("How this forecast was made")}</p></div>
              </div>
              <div className="profile-grid">
                <div className="profile-field"><span>{t("Model")}</span><strong>{result.model_used}</strong></div>
                <div className="profile-field"><span>{t("Training data")}</span><strong>{t("{n} days", { n: result.observations })} · {longDate(result.training_start)} – {longDate(result.training_end)}</strong></div>
                <div className="profile-field"><span>MAPE</span><strong>{result.mape !== null ? `${result.mape}%` : "—"}</strong></div>
                <div className="profile-field"><span>RMSE</span><strong>{result.rmse !== null ? peso(result.rmse) : "—"}</strong></div>
                <div className="profile-field"><span>{t("Generated")}</span><strong>{new Date(result.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong></div>
                <div className="profile-field"><span>{t("Confidence level")}</span><strong>{result.confidence_level}%</strong></div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div><h3>{t("Daily Forecast")}</h3><p>{t("Most likely price and 95% range per day")}</p></div></div>
            <div style={{ overflowX: "auto" }}>
              <PagedTable>
                <thead><tr><th>{t("DATE")}</th><th>{t("FORECAST / KG")}</th><th>{t("95% RANGE")}</th></tr></thead>
                <tbody>
                  {result.forecast.map((p) => (
                    <tr key={p.date}>
                      <td>{longDate(p.date)}</td>
                      <td><strong>{peso(p.price)}</strong></td>
                      <td>{peso(p.lower)} – {peso(p.upper)}</td>
                    </tr>
                  ))}
                </tbody>
              </PagedTable>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default ForecastView;
