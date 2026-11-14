import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders, fetchAll } from "../api/config.js";
import { FishThumb } from "./FishPhoto.jsx";

const peso = (n) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Fix a price record: the fish, the price, or both.
 * Published records need a reason, and the original stays in the history;
 * unpublished ones are simply edited.
 *
 * record: { id, fishId, fishName, municipality, date, price, published }
 */
export default function CorrectRecordDialog({ record, onClose, onSaved }) {
  const [species, setSpecies] = useState([]);
  const [fishId, setFishId] = useState(String(record.fishId ?? ""));
  const [price, setPrice] = useState(String(Number(record.price).toFixed(2)));
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAll("/fish-species/")
      .then((rows) => setSpecies(rows.filter((s) => s.is_active !== false).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = species.find((s) => String(s.id) === fishId);
  const fishChanged = fishId !== "" && fishId !== String(record.fishId ?? "");
  const priceChanged = Number(price) !== Number(record.price);

  const save = async () => {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter a price greater than zero."); return; }
    if (!fishChanged && !priceChanged) { setError("Nothing changed. Choose a different fish or enter a different price."); return; }
    if (record.published && !category) { setError("Choose why this published price must be changed."); return; }
    if (record.published && reason.trim().length < 30) { setError("Explain the change in at least 30 characters: what was wrong and where the correct price came from."); return; }
    setSaving(true);
    setError("");
    try {
      const body = record.published
        ? { price_per_kg: value.toFixed(2), reason: reason.trim(), reason_category: category, ...(fishChanged ? { fish_species: Number(fishId) } : {}) }
        : { price_per_kg: value.toFixed(2), ...(fishChanged ? { fish_species: Number(fishId) } : {}) };
      const response = await fetch(apiUrl(record.published ? `/prices/${record.id}/correct/` : `/prices/${record.id}/`), {
        method: record.published ? "POST" : "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data && typeof data === "object"
          ? data.message || data.detail || Object.values(data).flat().map(String).join(" ")
          : "";
        throw new Error(message || "Could not save the correction.");
      }
      const what = [fishChanged && `fish → ${chosen?.name || "new fish"}`, priceChanged && `price → ${peso(value)}`].filter(Boolean).join(", ");
      onSaved(record.published ? `Corrected (${what}). The original is kept in the history.` : `Updated (${what}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm-box with-input correct-box" role="dialog" aria-modal="true" aria-labelledby="correct-title">
        <h3 id="correct-title">{record.published ? "Correct published record" : "Edit record"}</h3>
        <p className="correct-original">
          Now: <strong>{record.fishName}</strong> · {peso(record.price)}/kg · {record.municipality} · {record.date}
        </p>

        <div className="form-group">
          <label htmlFor="correct-fish">Fish</label>
          <div className="correct-fish">
            <FishThumb fish={chosen || { name: record.fishName }} size={40} />
            <select id="correct-fish" value={fishId} onChange={(e) => setFishId(e.target.value)}>
              {!species.some((s) => String(s.id) === fishId) && <option value={fishId}>{record.fishName}</option>}
              {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {fishChanged && <small className="correct-note">Fish changes from {record.fishName} to {chosen?.name}.</small>}
        </div>

        <div className="form-group">
          <label htmlFor="correct-price">Price per kg</label>
          <div className="confirm-input-unit">
            <span>₱</span>
            <input id="correct-price" type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            <span>/ kg</span>
          </div>
        </div>

        {record.published && (
          <>
          <div className="form-group">
            <label htmlFor="correct-category">Reason for changing a published price</label>
            <select id="correct-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Choose why</option>
              <option value="encoding_error">Encoding error (wrong digit or decimal)</option>
              <option value="wrong_fish">Recorded under the wrong fish</option>
              <option value="wrong_market_or_date">Wrong market or date</option>
              <option value="dvmf_correction">Corrected by the DVMF official record</option>
              <option value="market_change">Market price changed sharply the same day</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="correct-reason">Explain the change (at least 30 characters)</label>
            <textarea
              id="correct-reason"
              className="confirm-textarea"
              rows={2}
              maxLength={500}
              value={reason}
              placeholder="e.g. Encoded under the wrong fish; the price was for Bangus."
              onChange={(e) => setReason(e.target.value)}
            />
            <small className="correct-note">{reason.trim().length}/30 · The original fish and price, and this reason, stay in the correction history and the Audit Log.</small>
          </div>
          </>
        )}

        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="confirm-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="primary-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
