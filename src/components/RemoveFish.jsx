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
 *   price history is lost, or (for something that should not be here at
 *   all) delete it with everything under it after typing its name.
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
  const [mode, setMode] = useState("merge"); // "merge" | "delete"
  const [typed, setTyped] = useState("");

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
      setInto(""); setReason(""); setTyped(""); setMode("merge");
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

  const deleteAll = async () => {
    const { fish, usage } = merging;
    if (typed.trim().toLowerCase() !== fish.name.trim().toLowerCase()) return;
    if (!(await askConfirm(`Delete ${fish.name} and its ${usage.prices} price${usage.prices === 1 ? "" : "s"}?\n\nThis cannot be undone. The audit log keeps a note of what was removed.`, { confirmLabel: "Delete everything", danger: true }))) return;
    setBusy(true);
    try {
      const result = await call(`/fish-species/${fish.id}/delete-everything/`, "POST", { confirm_name: typed.trim(), reason });
      notify?.(result.message);
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
          {" "}What do you want to do?
        </p>
        <div className="remove-mode" role="radiogroup" aria-label="How to remove">
          <label className={mode === "merge" ? "on" : ""}>
            <input type="radio" name="remove-mode" checked={mode === "merge"} onChange={() => setMode("merge")} disabled={busy} />
            <span><strong>Merge into the correct fish</strong><small>For a misspelling or a duplicate. The prices are kept.</small></span>
          </label>
          <label className={mode === "delete" ? "on danger" : "danger"}>
            <input type="radio" name="remove-mode" checked={mode === "delete"} onChange={() => setMode("delete")} disabled={busy} />
            <span><strong>Delete it completely</strong><small>For something that should not be here at all. Its prices are deleted too.</small></span>
          </label>
        </div>
        {mode === "merge" ? (
          <div className="form-group">
            <label htmlFor="merge-into">Merge into</label>
            <select id="merge-into" value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">Choose the correct fish…</option>
              {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="delete-confirm">Type <strong>{merging.fish.name}</strong> to confirm</label>
            <input id="delete-confirm" autoComplete="off" value={typed} placeholder={merging.fish.name} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label htmlFor="merge-reason">Reason <span className="optional">(optional)</span></label>
          <input id="merge-reason" maxLength={300} value={reason}
            placeholder={mode === "merge" ? "e.g. Misspelled; the correct name is Anduhaw" : "e.g. Not a fish; imported by mistake"}
            onChange={(e) => setReason(e.target.value)} />
        </div>
        <p className="muted-text" style={{ fontSize: 12.5 }}>
          {mode === "merge"
            ? "If both fish have a price for the same day, the correct fish's price is kept."
            : "Deleting cannot be undone. The audit log keeps a note of what was removed."}
          {" "}If this fish is real but no longer sold, close this and use Deactivate instead.
        </p>
        <div className="button-row">
          <button className="secondary-btn" onClick={() => setMerging(null)} disabled={busy}>Cancel</button>
          {mode === "merge" ? (
            <button className="primary-btn" onClick={merge} disabled={!into || busy}>{busy ? "Merging…" : "Merge and remove"}</button>
          ) : (
            <button className="confirm-danger-btn remove-delete-btn" onClick={deleteAll}
              disabled={busy || typed.trim().toLowerCase() !== merging.fish.name.trim().toLowerCase()}>
              {busy ? "Deleting…" : "Delete completely"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );

  return { start, dialog };
}
