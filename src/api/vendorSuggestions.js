// AquaTimbang - Vendor Price Suggestions API

import { API_BASE_URL as API_BASE } from "./config.js";

const STATUS_LABELS = {
  pending: "Pending Review",
  reviewed: "Reviewed",
  adopted: "Adopted",
  rejected: "Rejected",
};

// Get the token saved when the user logs in.
function getToken() {
  return localStorage.getItem("authToken");
}

// Send authenticated requests to Django.
async function apiRequest(path, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("Please log in first.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.message ||
      (data ? JSON.stringify(data) : `Request failed: ${response.status}`)
    );
  }

  return data;
}

// Convert Django's field names into the format
// used by the AquaTimbang dashboards.
export function normalizeSuggestion(item) {
  return {
    id: item.id,
    vendorId: item.vendor,
    submittedBy: item.submitted_by,
    fishSpeciesId: item.fish_species,
    species: item.species,
    municipalityId: item.municipality,
    municipality: item.municipality_name,
    suggestedPrice: Number(item.suggested_price),
    comment: item.comment || "",
    status: STATUS_LABELS[item.status] || item.status,
    lguFeedback: item.lgu_feedback || "",
    date: item.created_at
      ? item.created_at.slice(0, 10)
      : "",
    createdAt: item.created_at,
    reviewedAt: item.reviewed_at,
  };
}

// Fetch suggestions from Django/MySQL.
export async function listVendorSuggestions() {
  const data = await apiRequest("/vendor-suggestions/");

  const results = Array.isArray(data)
    ? data
    : data?.results || [];

  return results.map(normalizeSuggestion);
}

// Submit a new suggested price as a Fish Vendor.
export async function createVendorSuggestion(data) {
  const payload = {
    fish_species: data.fish_species ?? data.fishSpeciesId,
    municipality: data.municipality ?? data.municipalityId,
    suggested_price: data.suggested_price ?? data.suggestedPrice,
    comment: data.comment ?? "",
  };

  const result = await apiRequest("/vendor-suggestions/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeSuggestion(result);
}

// Review a suggestion as an LGU Officer or Administrator.
export async function reviewVendorSuggestion(
  suggestionId,
  decision,
  feedback = ""
) {
  const allowedDecisions = [
    "reviewed",
    "adopted",
    "rejected",
  ];

  const normalizedDecision = decision.toLowerCase();

  if (!allowedDecisions.includes(normalizedDecision)) {
    throw new Error("Invalid review decision.");
  }

  const data = await apiRequest(
    `/vendor-suggestions/${suggestionId}/review/`,
    {
      method: "POST",
      body: JSON.stringify({
        status: normalizedDecision,
        lgu_feedback: feedback,
      }),
    }
  );

  return normalizeSuggestion(data);
}