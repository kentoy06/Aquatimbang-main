// Address of the AquaTimbang Django API.
// Set VITE_API_BASE_URL in .env (local development) or as a GitHub
// repository variable (GitHub Pages build) instead of editing code.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

if (!API_BASE_URL) {
  console.error("VITE_API_BASE_URL is not set; API requests will fail.");
}

// Build a full API URL from a path such as "/prices/".
export const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

// Authorization header for the logged-in user's token.
export function authHeaders(extra = {}) {
  const token = localStorage.getItem("authToken");
  return token ? { ...extra, Authorization: `Token ${token}` } : { ...extra };
}

// Fetch every page of a list endpoint (works with paginated and plain array responses).
export async function fetchAll(path) {
  const all = [];
  let next = apiUrl(path);
  const visited = new Set();
  while (next && !visited.has(next)) {
    visited.add(next);
    const response = await fetch(next, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "Your session has expired. Please log in again."
          : response.status === 403
          ? "You do not have permission to view this data."
          : `Request failed (HTTP ${response.status}).`
      );
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      all.push(...data);
      next = null;
    } else if (Array.isArray(data?.results)) {
      all.push(...data.results);
      next = data.next ? new URL(data.next, next).href : null;
    } else {
      throw new Error("Unexpected response from the server.");
    }
  }
  return all;
}
