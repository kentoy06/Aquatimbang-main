import React, { useEffect, useState } from "react";
import { getPriceExplanation } from "../api/forecast.js";
import { useT } from "../i18n/vendor.js";

const peso = (n) =>
  `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

const EFFECT = {
  up: { arrow: "▲", label: "Pushes price up" },
  down: { arrow: "▼", label: "Pushes price down" },
};

/**
 * "Why is the price changing?" — explains this week's price change from
 * recorded weather, fuel, holidays, BFAR closed seasons and monthly patterns.
 */
export default function PriceExplanation({ speciesId, municipalityId }) {
  const t = useT();
  const [state, setState] = useState({ key: "", data: null, error: "" });
  const key = speciesId ? `${speciesId}-${municipalityId || ""}` : "";

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    getPriceExplanation({ speciesId, municipalityId })
      .then((data) => { if (!cancelled) setState({ key, data, error: "" }); })
      .catch((err) => { if (!cancelled) setState({ key, data: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [key, speciesId, municipalityId]);

  if (!key) return null;
  const loading = state.key !== key;
  const { data, error } = loading ? { data: null, error: "" } : state;

  return (
    <div className="panel price-why">
      <div className="panel-header">
        <div>
          <h3>🔍 {t("Why is the price changing?")}</h3>
          <p>{t("Based on recorded weather, fuel prices, holidays and BFAR closed fishing seasons")}</p>
        </div>
      </div>

      {loading && <p className="price-why-muted">{t("Checking what affected the price…")}</p>}
      {error && <div className="warn-box" role="alert">{error}</div>}
      {data && !data.enough_data && <p className="price-why-muted">{data.message}</p>}

      {data?.enough_data && (
        <>
          <div className={`price-why-summary ${data.direction}`}>
            <div className="price-why-change">
              <span className="price-why-arrow" aria-hidden="true">
                {data.direction === "up" ? "▲" : data.direction === "down" ? "▼" : "▬"}
              </span>
              <div>
                <strong>{data.direction === "steady" ? t("Steady") : `${data.change_pct > 0 ? "+" : ""}${data.change_pct}%`}</strong>
                <small>{peso(data.previous_price)} → {peso(data.latest_price)}</small>
              </div>
            </div>
            <p>{data.summary}<small> {t("Compared {from} with {to}.", { from: longDate(data.compared_with), to: longDate(data.as_of) })}</small></p>
          </div>

          {data.reasons.length === 0 ? (
            <p className="price-why-muted">
              {t("No weather, fuel, holiday or closed-season records match this period. Logging External Factors daily gives better explanations.")}
            </p>
          ) : (
            <ul className="price-why-list">
              {data.reasons.map((reason) => (
                <li key={`${reason.kind}-${reason.title}`} className={`${reason.effect}${reason.matches ? " matches" : ""}`}>
                  <span className="price-why-icon" aria-hidden="true">{reason.icon}</span>
                  <div>
                    <div className="price-why-title">
                      <strong>{reason.title}</strong>
                      <span className={`price-why-effect ${reason.effect}`}>{EFFECT[reason.effect].arrow} {t(EFFECT[reason.effect].label)}</span>
                      {reason.matches && <span className="price-why-likely">{t("Likely reason")}</span>}
                    </div>
                    <p>{reason.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="price-why-note">
            {t("These are possible reasons based on recorded data, not proof. Closed season dates come from BFAR and may change each year.")}
          </p>
        </>
      )}
    </div>
  );
}
