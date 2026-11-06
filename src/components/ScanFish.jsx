import React, { useEffect, useState } from "react";
import { PhotoSourceButtons } from "./CameraCapture.jsx";
import { checkUpload } from "../api/images.js";
import { getScanSummary, uploadScan } from "../api/fishScans.js";

/**
 * Fish scanner, phase 1: the vendor photographs a fish and says which
 * fish it is. The labelled photo goes to the LGU for review and is used
 * later to train the scanner. `species` is [{ id, name }].
 */
function ScanFishModal({ t, species, defaultSpeciesId, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [fishId, setFishId] = useState(defaultSpeciesId || species[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null); // { fishName, count, target, total }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (picked) => {
    const problem = checkUpload(picked, { image: true });
    if (problem) { setError(problem); return; }
    setError("");
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const save = async () => {
    if (!file || !fishId) return;
    setSaving(true);
    setError("");
    try {
      const scan = await uploadScan(file, fishId);
      const summary = await getScanSummary().catch(() => null);
      const row = summary?.species.find((s) => String(s.id) === String(fishId));
      setSaved({
        fishName: scan.fish_name,
        count: row ? row.approved + row.pending : null,
        target: summary?.target ?? 30,
        total: summary?.my_photos ?? null,
      });
      onSaved?.(String(fishId));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const another = () => { setFile(null); setPreview(""); setSaved(null); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal scan-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="scan-title">
        <div className="modal-head">
          <h3 id="scan-title">📷 {t("Scan Fish")}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t("Close")}>✕</button>
        </div>

        {saved ? (
          <div className="scan-done">
            <div className="scan-done-icon" aria-hidden="true">✓</div>
            <h4>{t("Photo saved. Thank you!")}</h4>
            <p>{t("Your {fish} photo will be checked by the LGU and used to teach the AquaTimbang fish scanner.", { fish: saved.fishName })}</p>
            {saved.count !== null && (
              <div className="scan-meter" aria-label={t("{fish}: {count} of {target} photos", { fish: saved.fishName, count: saved.count, target: saved.target })}>
                <div className="scan-meter-bar"><span style={{ width: `${Math.min(100, (saved.count / saved.target) * 100)}%` }} /></div>
                <small>{t("{fish}: {count} of {target} photos", { fish: saved.fishName, count: saved.count, target: saved.target })}</small>
              </div>
            )}
            {saved.total !== null && <p className="scan-muted">{t("Fish photos you have shared: {n}", { n: saved.total })}</p>}
            <div className="button-row">
              <button className="secondary-btn" onClick={another}>{t("Scan another fish")}</button>
              <button className="primary-btn" onClick={onClose}>{t("Done")}</button>
            </div>
          </div>
        ) : (
          <>
            <p className="scan-muted">
              {t("Take a clear photo of the fish only, with no people in it. Then choose which fish it is. Your photos help build a scanner that will recognize fish automatically.")}
            </p>

            {preview ? (
              <div className="camera-view scan-preview"><img src={preview} alt={t("Your fish photo")} /></div>
            ) : (
              <div className="scan-empty">
                <span aria-hidden="true">🐟</span>
                <p>{t("Lay the fish flat, fill the photo with it, and use good light.")}</p>
              </div>
            )}

            <PhotoSourceButtons
              onFile={choose}
              facing="environment"
              disabled={saving}
              takeLabel={preview ? t("Retake Photo") : t("Take Photo")}
              albumLabel={t("Choose from Album")}
              cameraTitle={t("Scan Fish")}
            />

            <div className="form-group" style={{ marginTop: 14 }}>
              <label htmlFor="scan-fish">{t("Which fish is this?")}</label>
              <select id="scan-fish" value={fishId} onChange={(e) => setFishId(e.target.value)}>
                {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {error && <div className="error-box" role="alert">{error}</div>}
            <div className="button-row">
              <button className="secondary-btn" onClick={onClose}>{t("Cancel")}</button>
              <button className="primary-btn" onClick={save} disabled={!file || !fishId || saving}>
                {saving ? t("Saving…") : t("Save Photo")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The "Scan fish" button shown next to the fish picker.
export function ScanFishButton({ t, species, selectedId, onPicked }) {
  const [open, setOpen] = useState(false);
  if (!species.length) return null;
  return (
    <>
      <button type="button" className="secondary-btn scan-btn" onClick={() => setOpen(true)}>
        📷 {t("Scan fish")}
      </button>
      {open && (
        <ScanFishModal
          t={t}
          species={species}
          defaultSpeciesId={selectedId}
          onClose={() => setOpen(false)}
          onSaved={onPicked}
        />
      )}
    </>
  );
}
