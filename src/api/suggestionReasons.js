// Reasons a vendor can give for a suggested price (same values as the server).
export const SUGGESTION_REASONS = [
  ["fuel_price", "Higher fuel (diesel) price"],
  ["weather", "Bad weather, fewer boats went out"],
  ["low_catch", "Low catch or fewer fish arriving"],
  ["high_demand", "More buyers (holiday, fiesta, weekend)"],
  ["transport_ice", "Higher transport or ice cost"],
  ["closed_season", "Closed fishing season"],
  ["quality_size", "Size or quality of the fish"],
  ["oversupply", "Too much supply, fish not selling"],
  ["other", "Other reason"],
];

export const reasonLabel = (value) => (SUGGESTION_REASONS.find(([v]) => v === value) || [value, value])[1];
