// AquaTimbang - helpers for turning Django PriceRecord rows into
// the summaries shown on the dashboards (trends, comparisons, forecasts).

export const isPublished = (record) => record.status === "published";

// Unique, sorted fish species names that appear in the records.
export function speciesNames(records) {
  return [...new Set(records.map((r) => r.fish_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Unique, sorted municipality names that appear in the records.
export function municipalityNames(records) {
  return [...new Set(records.map((r) => r.municipality_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Daily price series for one species, oldest first: [{ date, price }].
// When several municipalities report on the same day, their prices are averaged.
export function dailySeries(records, species, municipality = "") {
  const byDate = new Map();
  records
    .filter((r) => r.fish_name === species && (!municipality || r.municipality_name === municipality))
    .forEach((r) => {
      const price = Number(r.price_per_kg);
      if (!r.recorded_date || !Number.isFinite(price)) return;
      const day = byDate.get(r.recorded_date) || { total: 0, count: 0 };
      day.total += price;
      day.count += 1;
      byDate.set(r.recorded_date, day);
    });
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, day]) => ({ date, price: day.total / day.count }));
}

// Keep only the series points within the last `days` days of the newest point.
export function lastDays(series, days) {
  if (!series.length) return series;
  const end = new Date(`${series[series.length - 1].date}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - (Number(days) - 1));
  const from = start.toLocaleDateString("en-CA");
  return series.filter((p) => p.date >= from);
}

// Keep only the series points between two "YYYY-MM-DD" dates (either may be empty).
export function betweenDates(series, from, to) {
  return series.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
}

// Latest record for each key (e.g. species + municipality).
export function latestBy(records, keyOf) {
  const latest = new Map();
  records.forEach((r) => {
    const key = keyOf(r);
    const old = latest.get(key);
    if (!old || r.recorded_date > old.recorded_date || (r.recorded_date === old.recorded_date && r.id > old.id)) {
      latest.set(key, r);
    }
  });
  return [...latest.values()];
}

// Date ranges a trends page offers, shortest first ("all" = every price).
export const RANGE_STEPS = ["7", "14", "30", "90", "180", "365", "all"];
export const RANGE_LABELS = {
  7: "the last 7 days", 14: "the last 14 days", 30: "the last 30 days", 90: "the last 90 days",
  180: "the last 180 days", 365: "the last 12 months", all: "all history",
};

// "YYYY-MM-DD" of the first day of the last `days` days, today included.
export function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - (Number(days) - 1));
  return d.toLocaleDateString("en-CA");
}

// Days with a published price for one fish (by id or name) since a date.
export function countPricedDays(records, { species, speciesName, municipality = "", since = "" }) {
  const days = new Set();
  records.forEach((r) => {
    if (r.status && r.status !== "published") return;
    if (species !== undefined && String(r.fish_species) !== String(species)) return;
    if (speciesName !== undefined && r.fish_name !== speciesName) return;
    if (municipality && String(r.municipality_name || "").toLowerCase() !== String(municipality).toLowerCase()) return;
    const day = String(r.recorded_date || "").slice(0, 10);
    if (day && (!since || day >= since)) days.add(day);
  });
  return days.size;
}

/**
 * The range to show: the chosen one, or, when it has fewer than two priced
 * days, the next longer range that has at least two (up to "all").
 */
export function widenRange(range, pricedDaysIn) {
  if (range === "all" || range === "custom") return range;
  const steps = RANGE_STEPS.slice(Math.max(0, RANGE_STEPS.indexOf(String(range))));
  for (const step of steps) {
    if (step === "all") return "all";
    if (pricedDaysIn(Number(step)) >= 2) return step;
  }
  return range;
}
