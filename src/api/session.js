// AquaTimbang - login session handling: server logout, expired sessions
// and automatic logout after inactivity (Tables 24 and 41).

import { useEffect } from "react";
import { API_BASE_URL, apiUrl, authHeaders } from "./config.js";

export const SESSION_ENDED_EVENT = "aquatimbang:session-ended";

const DEFAULT_IDLE_MINUTES = 30;

function clearSavedLogin() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("user");
  localStorage.removeItem("sessionIdleMinutes");
}

// Tell the app the session is over; App returns to the login page.
function endSession(message) {
  clearSavedLogin();
  window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: { message } }));
}

/**
 * Watch every API response. When the server rejects the saved login
 * (expired after inactivity, logged out elsewhere, account disabled),
 * end the session once instead of letting each page show an error.
 */
export function installSessionGuard() {
  if (window.__aquatimbangSessionGuard) return;
  window.__aquatimbangSessionGuard = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = typeof input === "string" ? input : input?.url || "";
    const isAuthRequest = /\/auth\/(login|register|logout)\//.test(url);
    if (response.status === 401 && url.startsWith(API_BASE_URL) && !isAuthRequest && localStorage.getItem("authToken")) {
      const data = await response.clone().json().catch(() => null);
      endSession(data?.detail || "Your session has ended. Please log in again.");
    }
    return response;
  };
}

// End the session on the server too (best effort), then forget it here.
export async function logout() {
  if (localStorage.getItem("authToken")) {
    try {
      await fetch(apiUrl("/auth/logout/"), { method: "POST", headers: authHeaders() });
    } catch {
      // Offline: the server session still expires on its own.
    }
  }
  clearSavedLogin();
}

/**
 * While `enabled`, log out after the server's idle limit without any
 * mouse, keyboard or touch activity in this tab.
 */
export function useIdleLogout(enabled, onTimeout) {
  useEffect(() => {
    if (!enabled) return undefined;
    const minutes = Number(localStorage.getItem("sessionIdleMinutes")) || DEFAULT_IDLE_MINUTES;
    let lastActivity = Date.now();
    const touch = () => { lastActivity = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));

    const timer = setInterval(async () => {
      if (Date.now() - lastActivity >= minutes * 60 * 1000) {
        clearInterval(timer);
        await logout();
        onTimeout(`You were logged out after ${minutes} minutes of inactivity.`);
      }
    }, 15000);

    return () => {
      clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, touch));
    };
  }, [enabled, onTimeout]);
}
