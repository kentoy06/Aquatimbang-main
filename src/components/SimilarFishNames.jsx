import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { askConfirm } from "./ConfirmDialog.jsx";

/**
 * Fish saved twice under different spellings (e.g. "Anduhaw" and
 * "Andohaw"). Each pair can be merged in one click: the fish with fewer
 * prices moves into the other, and its spelling is kept as another name so
 * later imports match it automatically.
 *
 * Each pair is rated from the names and the published prices: the same fish
 * has a similar price and is never priced twice on the same day in the same
 * market. "Very likely" pairs can all be merged at once.
 *
 *   <SimilarFishNames notify={notify} refreshKey={species.length} onMerged={reload} />
 */
const CONFIDENCE = { high: "Very likely", medium: "Check", low: "Probably different" };

export default function SimilarFishNames({ notify, refreshKey, onMerged }) {
  const [pairs, setPairs] = useState([]);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 6;

  const load = () => {
    fetch(apiUrl("/fish-species/similar-names/"), { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setPairs(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  };
  useEffect(load, [refreshKey]);

  const merge = async (pair, swap) => {
    const keep = swap ? pair.other : pair.keep;
    const other = swap ? pair.keep : pair.other;
    if (!(await askConfirm(
      `Merge ${other.name} into ${keep.name}?\n\n${other.name}'s ${other.prices} price${other.prices === 1 ? "" : "s"} move to ${keep.name}, and "${other.name}" is kept as another name of ${keep.name}, so imports that use that spelling go to ${keep.name}.`,
      { confirmLabel: "Merge" },
    ))) return;
    setBusy(`${pair.keep.id}-${pair.other.id}`);
    try {
      const r = await fetch(apiUrl(`/fish-species/${other.id}/merge/`), {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ into: keep.id, reason: "Same fish, different spelling" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.into || "Could not merge.");
      notify?.(`${other.name} was merged into ${keep.name}.`);
      load();
      onMerged?.();
    } catch (error) {
      notify?.(error.message);
    } finally {
      setBusy(null);
    }
  };

  const likely = pairs.filter((pair) => pair.confidence === "high");

  const mergeLikely = async () => {
    const names = likely.slice(0, 8).map((p) => `• ${p.other.name} → ${p.keep.name}`).join("\n");
    if (!(await askConfirm(
      `Merge all ${likely.length} likely duplicate${likely.length === 1 ? "" : "s"}?\n\nThese names are spelled the same after the spelling rules, have similar prices, and were never priced on the same day:\n${names}${likely.length > 8 ? `\n…and ${likely.length - 8} more` : ""}\n\nThe fish with fewer prices moves into the other, and its spelling is kept as another name.`,
      { confirmLabel: "Merge all" },
    ))) return;
    setBusy("all");
    try {
      const r = await fetch(apiUrl("/fish-species/merge-likely/"), {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: "{}",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || "Could not merge.");
      notify?.(data.message);
      load();
      onMerged?.();
    } catch (error) {
      notify?.(error.message);
    } finally {
      setBusy(null);
    }
  };

  if (!pairs.length) return null;
  const shown = pairs.filter((pair) => `${pair.keep.name} ${pair.other.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const plural = (n) => `${n} price${n === 1 ? "" : "s"}`;

  return (
    <div className={`similar-names${open ? " open" : ""}`}>
      <button type="button" className="similar-names-bar" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="similar-names-icon" aria-hidden="true">⚠</span>
        <span className="similar-names-text">
          <strong>{pairs.length} possible duplicate name{pairs.length === 1 ? "" : "s"}{likely.length ? ` · ${likely.length} very likely` : ""}</strong>
          <small>The same fish saved under two spellings. Merge them so their prices count as one fish.</small>
        </span>
        <span className="similar-names-toggle">{open ? "Hide ▴" : "Review ▾"}</span>
      </button>

      {open && (
        <div className="similar-names-body">
          <div className="similar-names-tools">
            <input type="search" placeholder="Search a name…" value={query} aria-label="Search duplicate names"
              onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
            <span className="muted-text">Pick the spelling to keep. The other becomes another name of it.</span>
            {likely.length > 0 && (
              <button type="button" className="primary-btn similar-names-all" disabled={busy !== null} onClick={mergeLikely}>
                {busy === "all" ? "Merging…" : `Merge all ${likely.length} likely duplicate${likely.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
          <p className="similar-names-legend">
            <span className="dup-badge high">Very likely</span> same spelling, similar prices, never priced on the same day ·{" "}
            <span className="dup-badge medium">Check</span> some signs match ·{" "}
            <span className="dup-badge low">Probably different</span> priced side by side or very different prices
          </p>
          <div className="similar-names-table" role="table" aria-label="Possible duplicate fish names">
            <div className="similar-names-row head" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Looks like</span>
              <span role="columnheader">How sure?</span>
              <span role="columnheader">Keep which spelling?</span>
            </div>
            {rows.map((pair) => {
              const id = `${pair.keep.id}-${pair.other.id}`;
              return (
                <div className="similar-names-row" role="row" key={id}>
                  <span role="cell"><b>{pair.keep.name}</b><small>{plural(pair.keep.prices)}</small></span>
                  <span role="cell"><b>{pair.other.name}</b><small>{plural(pair.other.prices)}</small></span>
                  <span role="cell" className="similar-names-why">
                    <span className={`dup-badge ${pair.confidence || "medium"}`}>{CONFIDENCE[pair.confidence] || "Check"}</span>
                    {(pair.reasons || []).map((reason) => <small key={reason}>{reason}</small>)}
                  </span>
                  <span role="cell" className="similar-names-actions">
                    <button type="button" className="secondary-btn" disabled={busy === id || busy === "all"} onClick={() => merge(pair, false)}>Keep {pair.keep.name}</button>
                    <button type="button" className="secondary-btn" disabled={busy === id || busy === "all"} onClick={() => merge(pair, true)}>Keep {pair.other.name}</button>
                  </span>
                </div>
              );
            })}
            {rows.length === 0 && <div className="similar-names-row empty">No duplicate names match "{query}".</div>}
          </div>
          <div className="similar-names-foot">
            <span className="muted-text">Different fish with similar names? Leave them as they are.</span>
            {pages > 1 && (
              <span className="similar-names-pager">
                <button type="button" className="secondary-btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹ Previous</button>
                <span>Page {current} of {pages}</span>
                <button type="button" className="secondary-btn" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next ›</button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
