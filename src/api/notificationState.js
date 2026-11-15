// AquaTimbang - which notifications and announcements the user has read.
//
// Kept on the server (per user) so a notification read on one phone or
// browser stays read everywhere, and cached in this browser so the badge
// is right before the server answers.

import { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "./config.js";

const KINDS = ["seen", "dismissed", "announcements"];

function currentUser() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.username || String(user.id ?? "");
  } catch { return ""; }
}

const cacheKey = (user) => `aquatimbang:notification-state:${user}`;

// Lists saved by older versions in this browser, so nothing read is lost.
function legacyLists(user) {
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
  let id = "";
  try { id = String(JSON.parse(localStorage.getItem("user") || "{}").id ?? ""); } catch { /* ignore */ }
  return {
    seen: read(`aquatimbang:seenNotifs:${user}`),
    dismissed: read(`aquatimbang:dismissedNotifs:${user}`),
    announcements: read(`aquatimbang-seen-announcements-${id}`).map(String),
  };
}

let owner = null;      // user the state belongs to
let state = null;      // { seen: [], dismissed: [], announcements: [] }
let loaded = false;
let pending = { seen: [], dismissed: [], announcements: [], clear: [] };
let timer = null;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(state));
const union = (a, b) => [...new Set([...(a || []), ...(b || []).map(String)])].slice(-500);
const saveCache = () => { try { localStorage.setItem(cacheKey(owner), JSON.stringify(state)); } catch { /* storage unavailable */ } };

function ensure() {
  const user = currentUser();
  if (owner === user && state) return;
  owner = user;
  loaded = false;
  let cached = {};
  try { cached = JSON.parse(localStorage.getItem(cacheKey(user)) || "{}"); } catch { /* ignore */ }
  const legacy = legacyLists(user);
  state = Object.fromEntries(KINDS.map((k) => [k, union(cached[k], legacy[k])]));
  // Send what this browser already knew, so other devices learn it too.
  KINDS.forEach((k) => { pending[k] = union(pending[k], state[k]); });
  load();
}

function load() {
  if (!localStorage.getItem("authToken")) return;
  const user = owner;
  fetch(apiUrl("/auth/notification-state/"), { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : null))
    .then((server) => {
      if (!server || user !== owner) return;
      state = Object.fromEntries(KINDS.map((k) => [k, union(state[k], server[k])]));
      loaded = true;
      saveCache();
      notify();
      flushSoon();
    })
    .catch(() => {});
}

function flushSoon() {
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

function flush() {
  const body = pending;
  if (!KINDS.some((k) => body[k].length) && !body.clear.length) return;
  if (!localStorage.getItem("authToken")) return;
  pending = { seen: [], dismissed: [], announcements: [], clear: [] };
  fetch(apiUrl("/auth/notification-state/"), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    // Try again with the next change.
    KINDS.forEach((k) => { pending[k] = union(pending[k], body[k]); });
    pending.clear = [...new Set([...pending.clear, ...body.clear])];
  });
}

/** Mark notifications (kind "seen" / "dismissed") or announcements (kind "announcements") as read. */
export function addToState(kind, values) {
  ensure();
  const fresh = values.map(String).filter((v) => !state[kind].includes(v));
  if (!fresh.length) return;
  state = { ...state, [kind]: union(state[kind], fresh) };
  pending[kind] = union(pending[kind], fresh);
  saveCache();
  notify();
  if (loaded) flushSoon(); // otherwise sent once the server state is in
}

/** Empty one list on purpose (e.g. "Restore dismissed"). */
export function clearState(kind) {
  ensure();
  state = { ...state, [kind]: [] };
  pending[kind] = [];
  pending.clear = [...new Set([...pending.clear, kind])];
  saveCache();
  notify();
  flushSoon();
}

/** The read state of the signed-in user; updates when it changes on this page. */
export function useNotificationStore() {
  ensure();
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    ensure();
    setSnapshot(state);
    listeners.add(setSnapshot);
    return () => listeners.delete(setSnapshot);
  }, []);
  return snapshot;
}
