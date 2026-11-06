// AquaTimbang - fish scanner phase 1: labelled fish photos.

import { apiUrl, authHeaders, fetchAll } from "./config.js";
import { compressImage } from "./images.js";

async function readJson(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object"
      ? data.message || data.detail || Object.values(data).flat().map(String).join(" ")
      : "";
    throw new Error(message || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

export async function uploadScan(file, speciesId) {
  const body = new FormData();
  body.append("image", await compressImage(file));
  body.append("fish_species", speciesId);
  return readJson(await fetch(apiUrl("/fish-scans/"), { method: "POST", headers: authHeaders(), body }));
}

export function listScans({ status, species } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (species) params.set("species", species);
  return fetchAll(`/fish-scans/${params.toString() ? `?${params}` : ""}`);
}

export async function getScanSummary() {
  return readJson(await fetch(apiUrl("/fish-scans/summary/"), { headers: authHeaders() }));
}

export async function reviewScan(id, { status, fishSpecies, note }) {
  return readJson(await fetch(apiUrl(`/fish-scans/${id}/review/`), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status, fish_species: fishSpecies, note: note || "" }),
  }));
}

export async function deleteScan(id) {
  const response = await fetch(apiUrl(`/fish-scans/${id}/`), { method: "DELETE", headers: authHeaders() });
  if (!response.ok) await readJson(response);
}

// Download the approved photos as a ZIP (one folder per fish).
export async function downloadScanZip() {
  const response = await fetch(apiUrl("/fish-scans/export/"), { headers: authHeaders() });
  if (!response.ok) await readJson(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aquatimbang_fish_photos_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
