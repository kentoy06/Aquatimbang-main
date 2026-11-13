import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { askConfirm } from "./ConfirmDialog.jsx";

/**
 * Fish saved twice under different spellings (e.g. "Anduhaw" and
 * "Andohaw"). Each pair can be merged in one click: the fish with fewer
 * prices moves into the other, and its spelling is kept as another name so
 * later imports match it automatically.
 *
 *   <SimilarFishNames notify={notify} refreshKey={species.length} onMerged={reload} />
 */
export default function SimilarFishNames({ notify, refreshKey, onMerged }) {
  const [pairs, setPairs] = useState([]);
  const [busy, setBusy] = useState(null);
  const [hidden, setHidden] = useState(false);

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

  if (!pairs.length || hidden) return null;
  return (
    <div className="similar-names">
      <div className="similar-names-head">
        <div>
          <strong>⚠ {pairs.length} possible duplicate name{pairs.length === 1 ? "" : "s"}</strong>
          <p>These look like the same fish spelled differently. Merge them so all their prices count as one fish.</p>
        </div>
        <button type="button" className="text-btn" onClick={() => setHidden(true)}>Hide</button>
      </div>
      <ul>
        {pairs.map((pair) => {
          const id = `${pair.keep.id}-${pair.other.id}`;
          return (
            <li key={id}>
              <span>
                <b>{pair.keep.name}</b> <small>({pair.keep.prices} price{pair.keep.prices === 1 ? "" : "s"})</small>
                {" "}and{" "}
                <b>{pair.other.name}</b> <small>({pair.other.prices} price{pair.other.prices === 1 ? "" : "s"})</small>
              </span>
              <span className="similar-names-actions">
                <button type="button" className="secondary-btn" disabled={busy === id} onClick={() => merge(pair, false)}>
                  Keep {pair.keep.name}
                </button>
                <button type="button" className="secondary-btn" disabled={busy === id} onClick={() => merge(pair, true)}>
                  Keep {pair.other.name}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="similar-names-note">Different fish with similar names? Leave them as they are.</p>
    </div>
  );
}
