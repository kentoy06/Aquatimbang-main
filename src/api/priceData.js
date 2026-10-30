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
