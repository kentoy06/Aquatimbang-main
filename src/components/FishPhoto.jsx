import React, { useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { checkUpload, compressImage, useProtectedImage } from "../api/images.js";
import "./FishPhoto.css";

const photoPath = (fish) =>
  fish?.id && (fish.has_photo ?? fish.hasPhoto)
    ? `/fish-species/${fish.id}/photo/?v=${encodeURIComponent(fish.updated_at || fish.photoVersion || "")}`
    : "";

// Small square picture of a fish, or its initials when there is no photo.
export function FishThumb({ fish, size = 40 }) {
  const url = useProtectedImage(photoPath(fish));
  const style = {
    width: size, height: size, flex: `0 0 ${size}px`, borderRadius: 10, overflow: "hidden",
    display: "grid", placeItems: "center", background: "#e0f2f4", color: "#0e7c86",
    fontWeight: 700, fontSize: Math.round(size * 0.34),
  };
  return (
    <span style={style} aria-hidden="true">
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : String(fish?.name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

// Large picture for a details window.
export function FishPicture({ fish, alt }) {
  const path = photoPath(fish);
  const url = useProtectedImage(path);
  if (!path) {
    return <div className="fish-picture fish-picture-empty">No photo yet. An LGU Officer or Administrator can add one in Fish Species.</div>;
  }
  return (
    <div className="fish-picture">
      {url ? <img src={url} alt={alt || fish.name} /> : <span>Loading photo…</span>}
    </div>
  );
}

// Upload (or replace) a species photo. Returns the updated species.
export async function uploadSpeciesPhoto(speciesId, file) {
  const ready = await compressImage(file);
  const problem = checkUpload(ready, { image: true });
  if (problem) throw new Error(problem);
  const body = new FormData();
  body.append("photo", ready);
  const response = await fetch(apiUrl(`/fish-species/${speciesId}/`), { method: "PATCH", headers: authHeaders(), body });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" ? Object.values(data).flat().map(String).join(" ") : "";
    throw new Error(message || `Photo upload failed (HTTP ${response.status}).`);
  }
  return data;
}

// Photo picker for the species form: shows the current photo and the chosen file.
export function FishPhotoInput({ fish, file, onChange }) {
  const [error, setError] = useState("");
  return (
    <div className="form-group">
      <label>Photo</label>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {fish && !file && <FishThumb fish={fish} size={56} />}
        <input
          type="file"
          accept=".jpg,.jpeg,.png"
          onChange={(event) => {
            const chosen = event.target.files?.[0] || null;
            const problem = chosen && !/\.(jpe?g|png)$/i.test(chosen.name) ? "Only JPG or PNG photos are allowed." : "";
            setError(problem);
            onChange(problem ? null : chosen);
          }}
        />
      </div>
      <small style={{ display: "block", marginTop: 4, color: error ? "#b42318" : "#667085", fontSize: 12 }}>
        {error || "A clear photo of the whole fish helps vendors recognise it. JPG or PNG; large photos are reduced automatically."}
      </small>
    </div>
  );
}
