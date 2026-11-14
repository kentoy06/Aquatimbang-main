import React from "react";

/**
 * Status filter (All / Active / Inactive) and sort order for fish lists.
 *
 *   <SpeciesFilterBar status={status} onStatus={setStatus} sort={sort} onSort={setSort}
 *     counts={{ all: 20, Active: 18, Inactive: 2 }} />
 */
export default function SpeciesFilterBar({ status, onStatus, sort, onSort, counts = {}, showPrices = true }) {
  const options = [["all", "All"], ["Active", "Active"], ["Inactive", "Inactive"]];
  return (
    <div className="species-filter-bar">
      <div className="segmented" role="group" aria-label="Show fish">
        {options.map(([value, label]) => (
          <button key={value} type="button" className={status === value ? "active" : ""} onClick={() => onStatus(value)}>
            {label}{counts[value] !== undefined && <small>{counts[value]}</small>}
          </button>
        ))}
      </div>
      <label className="sort-select">
        <span>Sort</span>
        <select value={sort} onChange={(e) => onSort(e.target.value)} aria-label="Sort fish">
          <option value="name">Name (A–Z)</option>
          <option value="newest">Newest added</option>
          <option value="oldest">Oldest added</option>
          {showPrices && <option value="prices">Most price records</option>}
        </select>
      </label>
    </div>
  );
}

/** Sort a fish list. `get` gives the name, the date added, and the price count of an item. */
export function sortSpecies(list, sort, get) {
  const rows = [...list];
  const byName = (a, b) => String(get.name(a)).localeCompare(String(get.name(b)));
  if (sort === "newest") return rows.sort((a, b) => String(get.created(b)).localeCompare(String(get.created(a))) || byName(a, b));
  if (sort === "oldest") return rows.sort((a, b) => String(get.created(a)).localeCompare(String(get.created(b))) || byName(a, b));
  if (sort === "prices") return rows.sort((a, b) => get.prices(b) - get.prices(a) || byName(a, b));
  return rows.sort(byName);
}
