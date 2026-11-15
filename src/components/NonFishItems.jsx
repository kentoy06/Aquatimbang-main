import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { askConfirm } from "./ConfirmDialog.jsx";

/**
 * Items in Fish Species that are not fish (squid, shrimp, crabs, shellfish,
 * seaweed...), found by name. All are ticked; one click removes them and
 * their prices so only fish stay in AquaTimbang.
 *
 *   <NonFishItems notify={notify} refreshKey={species.length} onRemoved={reload} />
 */
export default function NonFishItems({ notify, refreshKey, onRemoved }) {
  const [items, setItems] = useState([]);
  const [keep, setKeep] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch(apiUrl("/fish-species/non-fish/"), { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { setItems(Array.isArray(rows) ? rows : []); setKeep(new Set()); })
      .catch(() => {});
  };
  useEffect(load, [refreshKey]);

  if (!items.length) return null;
  const chosen = items.filter((item) => !keep.has(item.id));
  const prices = chosen.reduce((sum, item) => sum + item.prices, 0);
  const toggle = (id) => setKeep((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const remove = async () => {
    if (!chosen.length) return;
    if (!(await askConfirm(
      `Remove ${chosen.length} item${chosen.length === 1 ? "" : "s"} that ${chosen.length === 1 ? "is" : "are"} not fish?\n\n${chosen.map((i) => `• ${i.name} (${i.prices} price${i.prices === 1 ? "" : "s"})`).join("\n")}\n\nTheir ${prices.toLocaleString()} price${prices === 1 ? "" : "s"} are removed too. The Audit Log keeps a record of what was removed.`,
      { confirmLabel: "Remove", danger: true },
    ))) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/fish-species/remove-non-fish/"), {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chosen.map((i) => i.id) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.ids || "Could not remove them.");
      notify?.(data.message);
      load();
      onRemoved?.();
    } catch (error) {
      notify?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="non-fish">
      <div className="non-fish-head">
        <span className="non-fish-icon" aria-hidden="true">🦐</span>
        <span className="non-fish-text">
          <strong>{items.length} item{items.length === 1 ? " is" : "s are"} not fish</strong>
          <small>AquaTimbang tracks fish only. Untick anything you want to keep.</small>
        </span>
        <button type="button" className="confirm-danger-btn" disabled={busy || !chosen.length} onClick={remove}>
          {busy ? "Removing…" : `Remove ${chosen.length} not fish`}
        </button>
      </div>
      <div className="non-fish-list">
        {items.map((item) => (
          <label key={item.id} className={keep.has(item.id) ? "kept" : ""}>
            <input type="checkbox" checked={!keep.has(item.id)} onChange={() => toggle(item.id)} />
            <b>{item.name}</b><small>{item.prices.toLocaleString()} price{item.prices === 1 ? "" : "s"}</small>
          </label>
        ))}
      </div>
    </div>
  );
}
