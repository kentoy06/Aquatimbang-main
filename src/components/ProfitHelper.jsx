import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config.js";

const peso = (n) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : `${n < 0 ? "-" : ""}₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Forecast change (in %) that counts as "prices are moving".
const TREND_THRESHOLD = 3;

const num = (value) => {
  if (String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Work out profit for a batch of fish bought at the fish port (bagsakan).
 * Pure function so it can be tested and reused.
 */
export function computeProfit({ boughtKg, buyPerKg, otherCosts = 0, unsoldPct = 0, sellPerKg, lguPrice }) {
  const totalCost = boughtKg * buyPerKg + otherCosts;
  const sellableKg = boughtKg * (1 - unsoldPct / 100);
  const breakEven = sellableKg > 0 ? totalCost / sellableKg : null;
  const revenue = sellableKg * sellPerKg;
  const profit = revenue - totalCost;
  // Highest buying price per kg that still breaks even at the LGU price.
  const maxBuyPerKg = lguPrice && boughtKg > 0 ? (lguPrice * sellableKg - otherCosts) / boughtKg : null;
  return {
    totalCost,
    sellableKg,
    breakEven,
    revenue,
    profit,
    profitPerKg: sellableKg > 0 ? profit / sellableKg : null,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    maxBuyPerKg,
  };
}

function useOutlook(speciesId, municipalityId, enabled) {
  const [state, setState] = useState({ key: "", loading: false, data: null, error: "" });
  const key = enabled && speciesId && municipalityId ? `${speciesId}-${municipalityId}` : "";

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    setState({ key, loading: true, data: null, error: "" });
    const params = new URLSearchParams({ species: speciesId, municipality: municipalityId, horizon: "7" });
    fetch(`${API_BASE_URL}/forecasts/?${params}`, { headers: { Authorization: `Token ${localStorage.getItem("authToken")}` } })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.not_enough_data || !Array.isArray(data.forecast) || data.forecast.length === 0) {
          throw new Error(data?.message || "No forecast yet.");
        }
        if (!cancelled) setState({ key, loading: false, data, error: "" });
      })
      .catch((err) => { if (!cancelled) setState({ key, loading: false, data: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [key, speciesId, municipalityId]);

  return state.key === key ? state : { loading: Boolean(key), data: null, error: "" };
}

/**
 * Profit Helper: part of the Fair Price Calculator. The vendor enters what
 * they paid at the fish port, and it suggests a selling price within the LGU
 * price, shows the expected profit, and gives a buying tip from the forecast.
 */
export default function ProfitHelper({ t, speciesId, speciesName, municipalityId, municipality, lguPrice }) {
  const [boughtKg, setBoughtKg] = useState("");
  const [buyPerKg, setBuyPerKg] = useState("");
  const [otherCosts, setOtherCosts] = useState("");
  const [unsoldPct, setUnsoldPct] = useState("");
  const [sellPerKg, setSellPerKg] = useState("");

  const values = {
    boughtKg: num(boughtKg),
    buyPerKg: num(buyPerKg),
    otherCosts: num(otherCosts) ?? 0,
    unsoldPct: num(unsoldPct) ?? 0,
    sellPerKg: num(sellPerKg) ?? lguPrice,
  };
  const errors = [];
  if (Number.isNaN(values.boughtKg) || values.boughtKg !== null && values.boughtKg <= 0) errors.push(t("Kilos bought must be more than zero."));
  if (Number.isNaN(values.buyPerKg) || values.buyPerKg !== null && values.buyPerKg <= 0) errors.push(t("Buying price must be more than zero."));
  if (Number.isNaN(values.otherCosts) || values.otherCosts < 0) errors.push(t("Other costs can't be negative."));
  if (Number.isNaN(values.unsoldPct) || values.unsoldPct < 0 || values.unsoldPct >= 100) errors.push(t("Unsold or spoiled must be from 0 to 99%."));
  if (Number.isNaN(values.sellPerKg) || values.sellPerKg !== null && values.sellPerKg !== undefined && values.sellPerKg <= 0) errors.push(t("Selling price must be more than zero."));

  const ready = errors.length === 0 && values.boughtKg > 0 && values.buyPerKg > 0 && values.sellPerKg > 0;
  const result = ready ? computeProfit({ ...values, lguPrice }) : null;
  const outlook = useOutlook(speciesId, municipalityId, ready && Boolean(lguPrice));

  // Average forecast for the coming week compared with today's LGU price.
  let trend = null;
  if (outlook.data && lguPrice) {
    const prices = outlook.data.forecast.map((p) => Number(p.price)).filter(Number.isFinite);
    if (prices.length) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      trend = { avg, pct: ((avg - lguPrice) / lguPrice) * 100 };
    }
  }

  const aboveLgu = result && lguPrice && values.sellPerKg > lguPrice + 0.005;
  const losing = result && result.profit < 0;
  const lguCoversCost = result && lguPrice && result.breakEven !== null && result.breakEven <= lguPrice;

  const clear = () => { setBoughtKg(""); setBuyPerKg(""); setOtherCosts(""); setUnsoldPct(""); setSellPerKg(""); };

  return (
    <div className="config-card profit-helper">
      <div className="config-header"><div className="config-icon orange">📈</div><div>
        <h3>{t("Profit Helper")}</h3>
        <p>{t("Enter what you paid at the fish port to see your profit and a fair selling price.")}</p>
      </div></div>

      <div className="profit-layout">
        <div className="profit-inputs">
          <p className="profit-fish">{speciesName}{municipality ? ` · ${municipality}` : ""}</p>
          <div className="profit-fields">
            <div className="form-group"><label htmlFor="ph-kg">{t("Kilos bought")}</label>
              <div className="input-with-unit"><input id="ph-kg" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={boughtKg} onChange={(e) => setBoughtKg(e.target.value)} /><span>kg</span></div>
            </div>
            <div className="form-group"><label htmlFor="ph-buy">{t("Buying price per kg")}</label>
              <div className="input-with-unit"><input id="ph-buy" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={buyPerKg} onChange={(e) => setBuyPerKg(e.target.value)} /><span>₱/kg</span></div>
            </div>
            <div className="form-group"><label htmlFor="ph-other">{t("Other costs")} <small>({t("ice, transport, stall fee")})</small></label>
              <div className="input-with-unit"><input id="ph-other" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} /><span>₱</span></div>
            </div>
            <div className="form-group"><label htmlFor="ph-unsold">{t("Expected unsold or spoiled")}</label>
              <div className="input-with-unit"><input id="ph-unsold" type="number" inputMode="decimal" min="0" max="99" step="1" placeholder="0" value={unsoldPct} onChange={(e) => setUnsoldPct(e.target.value)} /><span>%</span></div>
            </div>
            <div className="form-group profit-wide"><label htmlFor="ph-sell">{t("Your selling price per kg")}</label>
              <div className="input-with-unit"><input id="ph-sell" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder={lguPrice ? lguPrice.toFixed(2) : "0.00"} value={sellPerKg} onChange={(e) => setSellPerKg(e.target.value)} /><span>₱/kg</span></div>
              <small className="profit-hint">{lguPrice ? t("Leave blank to use the LGU price ({price}).", { price: peso(lguPrice) }) : t("No LGU price for this fish yet, so enter your own selling price.")}</small>
            </div>
          </div>
          {errors.map((e) => <div className="error-box" key={e}>{e}</div>)}
          <button type="button" className="secondary-btn" onClick={clear}>{t("Clear")}</button>
        </div>

        <div className="profit-results">
          {!result ? (
            <div className="profit-empty">
              <span>🧾</span>
              <p>{t("Fill in the kilos and buying price to see your profit.")}</p>
            </div>
          ) : (
            <>
              <div className={`profit-headline ${losing ? "loss" : "gain"}`}>
                <span>{losing ? t("EXPECTED LOSS") : t("EXPECTED PROFIT")}</span>
                <strong>{peso(Math.abs(result.profit))}</strong>
                <small>
                  {t("{kg} kg sold at {price}/kg", { kg: Number(result.sellableKg.toFixed(2)), price: peso(values.sellPerKg) })}
                  {result.margin !== null && ` · ${t("margin")} ${result.margin.toFixed(1)}%`}
                </small>
              </div>

              <div className="profit-stats">
                <div><span>{t("Total cost")}</span><strong>{peso(result.totalCost)}</strong></div>
                <div><span>{t("Expected sales")}</span><strong>{peso(result.revenue)}</strong></div>
                <div><span>{t("Break-even price")}</span><strong>{peso(result.breakEven)}<small>/kg</small></strong></div>
                <div><span>{t("Profit per kg")}</span><strong>{peso(result.profitPerKg)}</strong></div>
              </div>

              <div className="profit-tips">
                {lguPrice && lguCoversCost && (
                  <div className="profit-tip good">
                    <b>💡 {t("Suggested price")}</b>
                    <p>{t("Sell between {low} and {high} per kg. You cover your costs and stay within the LGU price.", { low: peso(result.breakEven), high: peso(lguPrice) })}</p>
                  </div>
                )}
                {lguPrice && !lguCoversCost && (
                  <div className="profit-tip bad">
                    <b>⚠ {t("The LGU price doesn't cover your costs")}</b>
                    <p>
                      {result.maxBuyPerKg > 0
                        ? t("To break even at {price}/kg, buy at {max}/kg or less, or lower your other costs.", { price: peso(lguPrice), max: peso(result.maxBuyPerKg) })
                        : t("Your other costs are too high for this amount of fish. Buy more kilos or lower your costs.")}
                    </p>
                  </div>
                )}
                {aboveLgu && (
                  <div className="profit-tip warn">
                    <b>⚖ {t("Above the LGU price")}</b>
                    <p>{t("Your price is {diff}/kg higher than the LGU price. Buyers and inspectors may see this as overpricing.", { diff: peso(values.sellPerKg - lguPrice) })}</p>
                  </div>
                )}
                {lguPrice && (
                  <div className="profit-tip info">
                    <b>📊 {t("Price outlook (next 7 days)")}</b>
                    <p>
                      {outlook.loading && t("Checking the forecast…")}
                      {!outlook.loading && !trend && t("No forecast yet for this fish. It needs more price history.")}
                      {trend && trend.pct >= TREND_THRESHOLD && t("Prices are expected to rise about {pct}% (around {avg}/kg). A good time to stock up, since your fish may sell higher.", { pct: trend.pct.toFixed(1), avg: peso(trend.avg) })}
                      {trend && trend.pct <= -TREND_THRESHOLD && t("Prices are expected to drop about {pct}% (around {avg}/kg). Buy only what you can sell soon.", { pct: Math.abs(trend.pct).toFixed(1), avg: peso(trend.avg) })}
                      {trend && Math.abs(trend.pct) < TREND_THRESHOLD && t("Prices should stay about the same (around {avg}/kg).", { avg: peso(trend.avg) })}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="profit-note">{t("For planning only. Nothing here is saved or shared with the LGU.")}</p>
    </div>
  );
}
