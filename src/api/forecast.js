// AquaTimbang - SARIMAX price forecasts and external factors.

import { apiUrl, authHeaders, fetchAll } from "./config.js";

async function readJson(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object"
      ? data.message || data.detail || Object.values(data).flat().map(String).join(" ")
      : "";
    throw new Error(message || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

// GET /forecasts/?species=&municipality=&horizon=
export async function getForecast({ speciesId, municipalityId, horizon }) {
  const params = new URLSearchParams({ species: speciesId, horizon: String(horizon) });
  if (municipalityId) params.set("municipality", municipalityId);
  return readJson(await fetch(apiUrl(`/forecasts/?${params}`), { headers: authHeaders() }));
}

export async function getForecastHistory() {
  return readJson(await fetch(apiUrl("/forecasts/history/"), { headers: authHeaders() }));
}

export const listExternalFactors = () => fetchAll("/external-factors/");

export async function saveExternalFactor(factor) {
  const url = factor.id ? apiUrl(`/external-factors/${factor.id}/`) : apiUrl("/external-factors/");
  return readJson(await fetch(url, {
    method: factor.id ? "PATCH" : "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      date: factor.date,
      fuel_price: factor.fuel_price === "" || factor.fuel_price === null ? null : factor.fuel_price,
      weather: factor.weather,
      is_holiday: factor.is_holiday,
      notes: factor.notes || "",
    }),
  }));
}

export async function deleteExternalFactor(id) {
  const response = await fetch(apiUrl(`/external-factors/${id}/`), { method: "DELETE", headers: authHeaders() });
  if (!response.ok) await readJson(response);
}

// Plain-language names for the model's external factors.
export const FACTOR_LABELS = {
  fuel_price: "Fuel price",
  rainy: "Rainy weather",
  stormy: "Stormy weather",
  holiday: "Holiday",
};

export function describeFactorEffect(name, value) {
  const amount = `₱${Math.abs(value).toFixed(2)}/kg`;
  const direction = value >= 0 ? "raises" : "lowers";
  if (name === "fuel_price") return `Each ₱1/liter rise in fuel ${direction} the price by about ${amount}.`;
  return `${FACTOR_LABELS[name] || name} ${direction} the price by about ${amount}.`;
}
