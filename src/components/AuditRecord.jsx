import React, { useEffect, useState } from "react";
import { fetchAll } from "../api/config.js";
import { FishThumb } from "./FishPhoto.jsx";

// Detail keys shown in their own columns, so they are left out of the summary text.
export const RECORD_DETAIL_KEYS = ["fish", "fish_id", "municipality", "price_per_kg", "recorded_date"];

const peso = (value) =>
  `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Split a log entry into fish, municipality, price and date.
 * New price logs carry these in their details; older ones only have
 * "Fish - Municipality" as the record name.
 */
export function logRecordParts(log) {
  const details = log?.details && typeof log.details === "object" ? log.details : {};
  const type = String(log?.target_type || "");
  const name = String(log?.target_name || "");
  const none = { fish: "", fishId: null, municipality: "", price: null, date: "" };
  // Logs about many records at once (imports, ZIP downloads) name no single fish.
  if (Number(log?.target_id) === 0) return none;
  if (type === "PriceRecord") {
    const cut = name.lastIndexOf(" - ");
    if (!details.fish && cut <= 0) return none;
    return {
      fish: details.fish || name.slice(0, cut),
      fishId: details.fish_id ?? null,
      municipality: details.municipality || (cut > 0 ? name.slice(cut + 3) : ""),
      price: details.price_per_kg ?? null,
      date: details.recorded_date || "",
    };
  }
  if (type === "VendorPriceSuggestion") {
    return { ...none, fish: name, municipality: details.municipality || "", price: details.suggested_price ?? null };
  }
  if (type === "FishSpecies" || type === "FishScanPhoto") {
    return { ...none, fish: details.fish || name, fishId: details.fish_id ?? null };
  }
  return none;
}

// All fish species once, to show their photos next to log entries.
export function useFishLookup() {
  const [lookup, setLookup] = useState({ byId: {}, byName: {} });
  useEffect(() => {
    let cancelled = false;
    fetchAll("/fish-species/")
      .then((rows) => {
        if (cancelled) return;
        const byId = {};
        const byName = {};
        rows.forEach((fish) => { byId[fish.id] = fish; byName[String(fish.name).toLowerCase()] = fish; });
        setLookup({ byId, byName });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return lookup;
}

export function FishCell({ parts, lookup }) {
  if (!parts.fish) return <span className="audit-muted">—</span>;
  const fish = (parts.fishId && lookup.byId[parts.fishId]) || lookup.byName[parts.fish.toLowerCase()] || { name: parts.fish };
  return (
    <span className="audit-fish">
      <FishThumb fish={fish} size={34} />
      <span>{parts.fish}</span>
    </span>
  );
}

export function PriceCell({ parts }) {
  if (parts.price === null || parts.price === undefined || parts.price === "") return <span className="audit-muted">—</span>;
  return (
    <span className="audit-price">
      <strong>{peso(parts.price)}</strong>
      {parts.date && <small>for {parts.date}</small>}
    </span>
  );
}
