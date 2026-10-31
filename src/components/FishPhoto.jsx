import React, { useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { checkUpload, compressImage } from "../api/images.js";
import "./FishPhoto.css";

// Fish photos are public, so a plain <img> can load (and cache) them.
const photoUrl = (fish) =>
  fish?.id && (fish.has_photo ?? fish.hasPhoto)
    ? apiUrl(`/fish-species/${fish.id}/photo/?v=${encodeURIComponent(fish.updated_at || fish.photoVersion || "")}`)
    : "";

const initialsOf = (fish) => String(fish?.name || "?").slice(0, 2).toUpperCase();

// Small square picture of a fish, or its initials when there is no photo.
export function FishThumb({ fish, size = 40 }) {
  const url = photoUrl(fish);
  const [failed, setFailed] = useState("");
  const style = {
    width: size, height: size, flex: `0 0 ${size}px`, borderRadius: 10, overflow: "hidden",
    display: "grid", placeItems: "center", background: "#e0f2f4", color: "#0e7c86",
    fontWeight: 700, fontSize: Math.round(size * 0.34),
  };
  return (
    <span style={style} aria-hidden="true">
      {url && failed !== url
        ? <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initialsOf(fish)}
    </span>
  );
}

// Large picture for a details window.
export function FishPicture({ fish, alt, emptyText = "No photo yet. An LGU Officer or Administrator can add one in Fish Species." }) {
  const url = photoUrl(fish);
  if (!url) return <div className="fish-picture fish-picture-empty">{emptyText}</div>;
  return (
    <figure className="fish-picture-figure">
      <div className="fish-picture">
        <img src={url} alt={alt || fish.name} />
      </div>
      {fish.photo_credit && <figcaption className="fish-credit">Photo: {fish.photo_credit}</figcaption>}
    </figure>
  );
}

/**
 * Choose a fish from a dropdown; the chosen fish's photo, name and
 * scientific name appear in a separate box on the right.
 *
 * species: [{ id, name, has_photo, updated_at, scientific_name, photo_credit }]
 * myFish:  ids of fish the vendor sells (marked with ★ and listed first by the caller)
 */
export function FishPicker({ species, value, onChange, myFish = [], disabled = false, labels = {}, id }) {
  const selected = species.find((fish) => String(fish.id) === String(value));
  if (!species.length) return <div className="locked-field">{labels.empty || "No fish species registered"}</div>;
  const url = photoUrl(selected);
  return (
    <div className="fish-picker-box">
      <div className="fish-picker">
        <select
          id={id}
          className="fish-picker-select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={labels.group || "Fish species"}
        >
          {species.map((fish) => (
            <option key={fish.id} value={String(fish.id)}>
              {myFish.includes(String(fish.id)) ? "★ " : ""}{fish.name}
            </option>
          ))}
        </select>
        {selected && (
          <div className="fish-preview">
            <div className="fish-preview-photo">
              {url ? <img src={url} alt={selected.name} /> : <span>{labels.noPhoto || "No photo yet"}</span>}
            </div>
            <strong>{selected.name}</strong>
            {selected.scientific_name && <em>{selected.scientific_name}</em>}
            {myFish.includes(String(selected.id)) && <span className="badge success">{labels.yours || "Your fish"}</span>}
            {selected.photo_credit && url && <small className="fish-credit">{labels.credit || "Photo"}: {selected.photo_credit}</small>}
          </div>
        )}
      </div>
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
export function FishPhotoInput({ fish, file, onChange, credit, onCreditChange }) {
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
      {onCreditChange && (
        <input
          type="text"
          maxLength={200}
          value={credit || ""}
          onChange={(event) => onCreditChange(event.target.value)}
          placeholder="Photo credit, e.g. “Juan Dela Cruz, CC BY-SA 4.0, Wikimedia Commons” or “AquaTimbang team”"
          style={{ marginTop: 8, width: "100%" }}
        />
      )}
    </div>
  );
}
