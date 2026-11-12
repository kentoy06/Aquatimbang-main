import React, { useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl, authHeaders } from "../api/config.js";
import { askConfirm } from "./ConfirmDialog.jsx";

async function call(path, method = "GET", body) {
  const r = await fetch(apiUrl(path), {
    method,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.message || data.into || "Something went wrong.");
  return data;
}

/**
 * Remove a fish added by mistake.
 * - Nothing recorded under it: delete it after a confirmation.
 * - It has prices or other records: merge it into the correct fish, so no
 *   price history is lost.
 *
 *   const remover = useRemoveFish({ notify, species, onDone });
 *   <button onClick={() => remover.start(fish)}>Remove</button>
 *   {remover.dialog}
 */
export function useRemoveFish({ notify, species = [], onDone }) {
  const [merging, setMerging] = useState(null); // { fish, usage }
  const [into, setInto] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async (fish) => {
    try {
      const usage = await call(`/fish-species/${fish.id}/usage/`);
      const used = usage.prices + usage.suggestions + usage.calculations;
      if (!used) {
        if (!(await askConfirm(`Delete ${fish.name}?\n\nNothing is recorded under it yet, so it can be removed completely.`))) return;
        await call(`/fish-species/${fish.id}/`, "DELETE");
        notify?.(`${fish.name} was deleted.`);
        onDone?.();
        return;
      }
      setInto(""); setReason("");
      setMerging({ fish, usage });
    } catch (error) {
      notify?.(error.message);
    }
  };

  const merge = async () => {
    if (!into) return;
    const target = species.find((s) => String(s.id) === String(into));
    if (!(await askConfirm(`Merge ${merging.fish.name} into ${target?.name}?\n\nIts prices and records move to ${target?.name}, and ${merging.fish.name} is deleted. This cannot be undone.`, { confirmLabel: "Merge", danger: true }))) return;
    setBusy(true);
    try {
      const result = await call(`/fish-species/${merging.fish.id}/merge/`, "POST", { into: Number(into), reason });
      notify?.(`${result.message} ${result.prices_moved} price${result.prices_moved === 1 ? "" : "s"} moved${result.duplicate_prices_removed ? `, ${result.duplicate_prices_removed} duplicate${result.duplicate_prices_removed === 1 ? "" : "s"} removed` : ""}.`);
      setMerging(null);
      onDone?.();
    } catch (error) {
      notify?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  const others = species
    .filter((s) => merging && s.id !== merging.fish.id && (s.is_active ?? s.status !== "Inactive"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const dialog = merging && createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setMerging(null); }}>
      <div className="modal merge-modal" role="dialog" aria-modal="true" aria-labelledby="merge-title">
        <div className="modal-head">
          <h3 id="merge-title">Remove {merging.fish.name}</h3>
          <button className="modal-close" onClick={() => setMerging(null)} aria-label="Close" disabled={busy}>✕</button>
        </div>
        <p>
          <strong>{merging.fish.name}</strong> already has {merging.usage.prices} price{merging.usage.prices === 1 ? "" : "s"}
          {merging.usage.suggestions ? `, ${merging.usage.suggestions} vendor suggestion${merging.usage.suggestions === 1 ? "" : "s"}` : ""}
          {merging.usage.calculations ? ` and ${merging.usage.calculations} saved calculation${merging.usage.calculations === 1 ? "" : "s"}` : ""}.
          {" "}If it was added by mistake (a misspelling or a duplicate), merge it into the correct fish so nothing is lost.
        </p>
        <div className="form-group">
          <label htmlFor="merge-into">Merge into</label>
          <select id="merge-into" value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">Choose the correct fish…</option>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="merge-reason">Reason <span className="optional">(optional)</span></label>
          <input id="merge-reason" maxLength={300} value={reason} placeholder="e.g. Misspelled; the correct name is Anduhaw" onChange={(e) => setReason(e.target.value)} />
        </div>
        <p className="muted-text" style={{ fontSize: 12.5 }}>
          If both fish have a price for the same municipality and day, the correct fish's price is kept.
          If this fish is real but no longer sold, close this and use Deactivate instead.
        </p>
        <div className="button-row">
          <button className="secondary-btn" onClick={() => setMerging(null)} disabled={busy}>Cancel</button>
          <button className="primary-btn" onClick={merge} disabled={!into || busy}>{busy ? "Merging…" : "Merge and remove"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );

  return { start, dialog };
}
