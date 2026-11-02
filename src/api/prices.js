// AquaTimbang - load published prices by date range.
//
// Dashboards load only the last RECENT_DAYS of published prices, so years
// of imported history do not slow every page down. Pages that let the user
// pick an older date range fetch those older prices separately.

import { useEffect, useState } from "react";
import { fetchAll } from "./config.js";

export const RECENT_DAYS = 365;

// First day of the recent window, as "YYYY-MM-DD".
export function recentSince() {
  const day = new Date();
  day.setDate(day.getDate() - RECENT_DAYS);
  return day.toLocaleDateString("en-CA");
}

// Add `?since=` (or `&since=`) for the recent window to a price API path.
export const withRecentWindow = (path) => `${path}${path.includes("?") ? "&" : "?"}since=${recentSince()}`;

/**
 * Published prices from `from` up to the start of the recent window,
 * fetched only when `from` is older than what the dashboard already has.
 * Returns [] otherwise.
 */
export function useOlderPublished(from, to = "") {
  const since = recentSince();
  const needed = Boolean(from) && from < since && (!to || to >= from);
  const until = to && to < since ? to : since;
  const [state, setState] = useState({ key: "", records: [], loading: false, error: "" });
  const key = needed ? `${from}|${until}` : "";

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    setState({ key, records: [], loading: true, error: "" });
    fetchAll(`/prices/published/?since=${from}&until=${until}`)
      .then((records) => { if (!cancelled) setState({ key, records, loading: false, error: "" }); })
      .catch((err) => { if (!cancelled) setState({ key, records: [], loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [key, from, until]);

  return state.key === key && key ? state : { records: [], loading: needed, error: "" };
}

// Combine two lists of price records without duplicates.
export function mergeRecords(recent, older) {
  if (!older.length) return recent;
  const ids = new Set(recent.map((r) => r.id));
  return [...older.filter((r) => !ids.has(r.id)), ...recent];
}
