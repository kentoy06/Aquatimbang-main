// AquaTimbang - logged-in user's profile and own activity.

import { useEffect, useState } from "react";
import { apiUrl, authHeaders, fetchAll } from "./config.js";

// Format an ISO timestamp for display ("—" when missing).
export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-PH", { dateStyle: "medium" });
}

// Display name for an API profile ("First Last", falling back to username).
export function fullName(profile) {
  if (!profile) return "";
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.username || "";
}

// Load GET /auth/me/. Returns { profile, loading, error, reload, save }.
export function useMyProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(apiUrl("/auth/me/"), { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || data?.detail || `Unable to load your profile (HTTP ${response.status}).`);
        if (!cancelled) setProfile(data);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // PATCH /auth/me/ with { first_name, last_name, email, contact_number }.
  const save = async (changes) => {
    const response = await fetch(apiUrl("/auth/me/"), {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(changes),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data && typeof data === "object"
        ? Object.values(data).flat().map(String).join(" ")
        : "";
      throw new Error(message || `Unable to save your profile (HTTP ${response.status}).`);
    }
    setProfile(data);
    // Keep the name shown in the sidebar in sync with the saved profile.
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, first_name: data.first_name, last_name: data.last_name, email: data.email }));
    } catch { /* ignore invalid storage */ }
    return data;
  };

  return { profile, loading, error, reload: () => setReloadKey((k) => k + 1), save };
}

// Load the logged-in user's own activity log entries.
export function useMyActivity() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchAll("/activity-logs/")
      .then((rows) => { if (!cancelled) setActivity(rows); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  return { activity, loading, error, reload: () => setReloadKey((k) => k + 1) };
}

// One-line description of an activity log entry.
export function describeActivity(log) {
  const action = String(log.action || "").replaceAll("_", " ");
  const target = log.target_name ? ` ${log.target_name}` : "";
  const type = log.target_type ? ` (${String(log.target_type).replace(/([a-z])([A-Z])/g, "$1 $2")})` : "";
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}${target}${type}`;
}
