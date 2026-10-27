import React, { useState, useEffect } from "react";
import "./App.css";
import "./Admin.css";


// Read-only audit records supplied by Django. This endpoint enforces role visibility.
function useDjangoActivityLogs() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("authToken");
        if (!token) throw new Error("Please log in again to view activity logs.");
        let next = "http://127.0.0.1:8000/api/activity-logs/";
        const all = [];
        const visited = new Set();
        while (next && !visited.has(next)) {
          visited.add(next);
          const response = await fetch(next, { headers: { Authorization: `Token ${token}` } });
          if (!response.ok) throw new Error(`Unable to load activity logs (HTTP ${response.status}).`);
          const data = await response.json();
          if (Array.isArray(data)) {
            all.push(...data);
            next = null;
          } else if (Array.isArray(data.results)) {
            all.push(...data.results);
            next = data.next ? new URL(data.next, next).href : null;
          } else {
            throw new Error("Unexpected activity logs response.");
          }
        }
        if (!cancelled) setRecords(all);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);
  return { records, loading, error, refresh: () => setRefreshKey(k => k + 1) };
}

function formatAuditTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}
function formatAuditDetails(details) {
  if (!details || (typeof details === "object" && Object.keys(details).length === 0)) return "—";
  if (typeof details === "string") return details;
  return Object.entries(details).map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

// Presentation-only helpers; the audit records remain unchanged in Django.
function auditLabel(key) {
  return String(key).replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}
function auditValue(value) {
  if (value === true) return "Active";
  if (value === false) return "Inactive";
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(auditValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function auditDetailLines(details) {
  if (!details) return [];
  if (typeof details === "string") return [{ key: "Details", value: details }];
  return Object.entries(details).flatMap(([key, value]) => {
    if (key === "changes" && value && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(value).map(([field, change]) => ({
        key: auditLabel(field),
        value: change && typeof change === "object" && ("from" in change || "to" in change)
          ? `${auditValue(change.from)} → ${auditValue(change.to)}` : auditValue(change),
      }));
    }
    return [{ key: auditLabel(key), value: auditValue(value) }];
  });
}
function auditSummary(log) {
  const lines = auditDetailLines(log.details);
  return lines.length ? lines.slice(0, 2).map(item => `${item.key}: ${item.value}`).join(" · ") : "No additional details";
}
function AuditActionBadge({ action }) {
  const type = String(action || "").toLowerCase();
  const palette = type.includes("deactivat") || type.includes("delet") || type.includes("reject")
    ? { bg: "#fff1f2", fg: "#be123c", border: "#fecdd3" }
    : type.includes("activat") || type.includes("creat") || type.includes("approv")
      ? { bg: "#dcfce7", fg: "#166534", border: "#86efac" }
      : { bg: "#e0f2fe", fg: "#075985", border: "#7dd3fc" };
  return <span style={{ display: "inline-block", padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`, whiteSpace: "nowrap" }}>{auditLabel(action || "Unknown")}</span>;
}
function auditModule(log) {
  const type = String(log.target_type || "").toLowerCase().replaceAll("_", " ");
  if (type.includes("price")) return "Price Records";
  if (type.includes("species") || type.includes("fishspecies")) return "Fish Species";
  if (type.includes("user") || type.includes("profile") || type.includes("account")) return "User Management";
  if (type.includes("municipality") || type.includes("market")) return "Municipality & Market";
  if (type.includes("suggestion")) return "Fisherfolk Suggestions";
  if (type.includes("announcement")) return "System Announcements";
  return log.target_type ? auditLabel(log.target_type) : "Other";
}

function AuditDetailsDialog({ log, onClose }) {
  useEffect(() => {
    if (!log) return;
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [log, onClose]);
  if (!log) return null;
  const items = auditDetailLines(log.details);
  return <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,.6)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
    <section role="dialog" aria-modal="true" aria-labelledby="audit-detail-heading" style={{ background: "#fff", color: "#172033", borderRadius: 16, width: "min(100%, 560px)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 65px rgba(0,0,0,.24)", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div><h3 id="audit-detail-heading" style={{ margin: "0 0 10px" }}>Activity Details</h3><AuditActionBadge action={log.action}/></div>
        <button type="button" onClick={onClose} aria-label="Close activity details" style={{ border: "1px solid #d5dce5", borderRadius: 8, background: "#fff", padding: "6px 12px", cursor: "pointer", color: "#172033" }}>✕</button>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(100px, 140px) minmax(0, 1fr)", gap: "12px 16px", marginTop: 24, overflowWrap: "anywhere" }}>
        {[["Date & Time", formatAuditTimestamp(log.created_at)], ["User", log.actor_username || "—"], ["Role", log.actor_role || "—"], ["Module", auditModule(log)], ["Record Type", log.target_type || "—"], ["Affected Record", log.target_name || "—"], ...items.map(item => [item.key, item.value])].map(([key, value], index) => <React.Fragment key={`${key}-${index}`}><dt style={{ color: "#64748b", fontWeight: 600 }}>{key}</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{value}</dd></React.Fragment>)}
      </dl>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}><button type="button" className="secondary-btn" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}

function exportAuditCsv(records, filename) {
  const cols = ["Date", "User", "Role", "Module", "Action", "Affected Record", "Details"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = records.map(l => [formatAuditTimestamp(l.created_at), l.actor_username, l.actor_role, auditModule(l), l.action, l.target_name, formatAuditDetails(l.details)]);
  const csv = "\uFEFF" + [cols, ...rows].map(row => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================================================================
   CONSTANTS & MOCK DATA GENERATORS
   ================================================================ */

const SPECIES_LIST = ["Galunggong", "Tulingan", "Bolinaw", "Tamarong", "Anduhaw"];

const BASE_PRICES = {
  Galunggong: 180, Tulingan: 160, Bolinaw: 120, Tamarong: 150, Anduhaw: 170,
};

const MARKET_NAMES = ["Pasil Fish Market", "Carbon Public Market"];

const peso = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const mapDatabaseSpecies = (fish) => ({
  id: fish.id,
  name: fish.name,
  scientific: fish.scientific_name || "",
  description: fish.description || "",
  status: fish.is_active ? "Active" : "Inactive",
  dateAdded: fish.created_at
    ? new Date(fish.created_at).toLocaleDateString("en-PH")
    : "—",
});

const fmtDate = (isoStr) => {
  const d = new Date(isoStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric" });
};

function buildPriceRecords() {
  const TODAY = new Date(2026, 8, 16); // Sep 16, 2026 — matches the rest of the app
  const enterers = ["L. Fernandez", "Anna Smith"];
  const records = [];
  let id = 1;

  for (let d = 29; d >= 0; d--) {
    const date = new Date(TODAY);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);

    SPECIES_LIST.forEach((sp) => {
      MARKET_NAMES.forEach((mk) => {
        // simulate a gap: Tamarong at Carbon Public Market missing the last 3 days
        if (sp === "Tamarong" && mk === "Carbon Public Market" && d < 3) return;

        const base = BASE_PRICES[sp];
        const pseudo = Math.abs(Math.sin(id * 12.9898) * 10000) % 1;
        const variance = (pseudo - 0.5) * 14;
        const price = Math.max(40, Number((base + variance).toFixed(2)));

        records.push({
          id: id,
          date: dateStr,
          species: sp,
          municipality: mk === "Pasil Fish Market" ? "Cebu City" : "Cebu City",
          market: mk,
          price,
          enteredBy: enterers[id % 2],
          status: "Active",
          previousPrice: null,
          correctedBy: null,
          correctedDate: null,
        });
        id++;
      });
    });
  }

  // mark a few as corrected (price fixed after an error)
  [6, 42, 81].forEach((i) => {
    const rec = records[i];
    if (rec) {
      records[i] = {
        ...rec,
        status: "Corrected",
        previousPrice: Number((rec.price - 9).toFixed(2)),
        correctedBy: "System Admin",
        correctedDate: rec.date,
      };
    }
  });

  // mark a couple as deleted (kept for audit trail, hidden from active views)
  [16, 61].forEach((i) => {
    const rec = records[i];
    if (rec) records[i] = { ...rec, status: "Deleted" };
  });

  return records.reverse(); // most recent first
}

function generateRecommendations(records) {
  const active = records.filter((r) => r.status !== "Deleted");
  const today = active.length ? active[0].date : null;
  if (!today) return [];

  const weekAgo = new Date(today + "T00:00:00");
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(today + "T00:00:00");
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const avgFor = (species, from, to) => {
    const rows = active.filter(
      (r) => r.species === species && r.date >= from && r.date < to
    );
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + r.price, 0) / rows.length;
  };

  const recs = [];
  SPECIES_LIST.forEach((sp) => {
    const thisWeek = avgFor(sp, weekAgo.toISOString().slice(0, 10), today);
    const lastWeek = avgFor(
      sp,
      twoWeeksAgo.toISOString().slice(0, 10),
      weekAgo.toISOString().slice(0, 10)
    );
    if (thisWeek === null || lastWeek === null) return;

    const pct = ((thisWeek - lastWeek) / lastWeek) * 100;

    if (pct >= 5) {
      recs.push({
        species: sp, type: "rising", pct,
        message: `${sp} is up ${pct.toFixed(1)}% this week — worth flagging to vendors and checking for a supply shortage.`,
      });
    } else if (pct <= -5) {
      recs.push({
        species: sp, type: "falling", pct,
        message: `${sp} eased ${Math.abs(pct).toFixed(1)}% this week — a good window for buyers, and worth confirming supply has recovered.`,
      });
    }
  });

  if (recs.length === 0) {
    recs.push({
      species: "All species", type: "stable", pct: 0,
      message: "Prices across all tracked species are stable this week — no unusual movement detected.",
    });
  }

  return recs.slice(0, 3);
}

function buildSuggestions() {
  const vendors = ["Marites Abellana", "Ronald Ceniza", "Juan Dela Cruz", "Pedro Santos", "Maria Garcia"];
  const statuses = ["Pending Review", "Reviewed", "Adopted", "Rejected"];
  const suggestions = [];
  let id = 1;

  for (let d = 13; d >= 0; d--) {
    const date = new Date(2026, 8, 16);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);

    const perDay = 2 + (id % 3);
    for (let i = 0; i < perDay; i++) {
      const sp = SPECIES_LIST[(id + i) % SPECIES_LIST.length];
      const base = BASE_PRICES[sp];
      const pseudo = Math.abs(Math.sin((id + i) * 7.77) * 10000) % 1;
      const price = Math.max(40, Number((base + (pseudo - 0.5) * 20).toFixed(2)));

      suggestions.push({
        id,
        species: sp,
        municipality: "Cebu City",
        market: MARKET_NAMES[id % MARKET_NAMES.length],
        suggestedPrice: price,
        submittedBy: vendors[id % vendors.length],
        date: dateStr,
        status: d < 2 ? "Pending Review" : statuses[id % statuses.length],
      });
      id++;
    }
  }

  return suggestions.reverse();
}

function suggestionStats(suggestions, species, from, to) {
  const rows = suggestions.filter(
    (s) => (species === "All Species" || s.species === species) && s.date >= from && s.date <= to
  );
  if (!rows.length) {
    return { count: 0, avg: null, min: null, max: null, participants: 0 };
  }
  const prices = rows.map((r) => r.suggestedPrice);
  return {
    count: rows.length,
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    participants: new Set(rows.map((r) => r.submittedBy)).size,
  };
}

const MIN_RECORDS_FOR_FORECAST = 20;

function buildForecastSeries(priceRecords, speciesName, market, periodDays) {
  const rows = priceRecords
    .filter((r) => r.species === speciesName && r.status !== "Deleted" && (market === "All Markets" || r.market === market))
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const sufficientData = rows.length >= MIN_RECORDS_FOR_FORECAST;
  if (!rows.length) return { sufficientData, historical: [], predicted: [] };

  const last = rows[rows.length - 1];
  const weekAgoIdx = Math.max(0, rows.length - 8);
  const trendPerDay = (last.price - rows[weekAgoIdx].price) / Math.max(1, rows.length - 1 - weekAgoIdx);

  const historical = rows.slice(-14).map((r) => ({ date: r.date, price: r.price }));

  const predicted = [];
  let cursor = last.price;
  const lastDate = new Date(last.date + "T00:00:00");
  for (let i = 1; i <= periodDays; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i);
    cursor = cursor + trendPerDay * 0.8;
    predicted.push({
      date: d.toISOString().slice(0, 10),
      price: Math.max(40, Number(cursor.toFixed(2))),
    });
  }

  return { sufficientData, historical, predicted, lastActual: last.price };
}

function buildNotifications(users, priceRecords, species, markets, forecasts, announcements) {
  const notifs = [];
  let nid = 1;

  const pending = users.filter((u) => u.status === "Pending");
  if (pending.length > 0) {
    notifs.push({
      id: nid++, type: "warning", page: "User Management",
      title: `${pending.length} pending user registration${pending.length > 1 ? "s" : ""}`,
      detail: pending.map((u) => u.name).join(", "),
    });
  }

  const flagged = priceRecords.filter((r) => r.status === "Corrected");
  if (flagged.length > 0) {
    notifs.push({
      id: nid++, type: "info", page: "Price Records",
      title: `${flagged.length} price record${flagged.length > 1 ? "s" : ""} corrected recently`,
      detail: flagged.slice(0, 3).map((r) => r.species).join(", "),
    });
  }

  const activeSpecies = species.filter((s) => s.status === "Active");
  const activeMarkets = markets.filter((m) => m.status === "Active");
  const activeRecords = priceRecords.filter((r) => r.status !== "Deleted");
  const today = activeRecords.length ? activeRecords[0].date : null;
  let missingCount = 0;
  if (today) {
    activeSpecies.forEach((sp) => {
      activeMarkets.forEach((mk) => {
        const has = priceRecords.some(
          (r) => r.species === sp.name && r.market === mk.name && r.date === today && r.status !== "Deleted"
        );
        if (!has) missingCount++;
      });
    });
  }
  if (missingCount > 0) {
    notifs.push({
      id: nid++, type: "danger", page: "Price Records",
      title: `${missingCount} missing price record${missingCount > 1 ? "s" : ""} for today`,
      detail: "No entry logged by any LGU officer yet.",
    });
  }

  const activeAnnouncements = announcements.filter((a) => a.status === "Active");
  if (activeAnnouncements.length > 0) {
    notifs.push({
      id: nid++, type: "info", page: "System Announcements",
      title: `${activeAnnouncements.length} active announcement${activeAnnouncements.length > 1 ? "s" : ""}`,
      detail: activeAnnouncements.map((a) => a.title).join(", "),
    });
  }

  return notifs;
}


/* ================================================================
   ROOT ADMIN COMPONENT
   ================================================================ */

function Admin({ onLogout }) {
  const [activePage, setActivePage] = useState("Dashboard");
  const [toast, setToast] = useState("");

  // Tracks whether user accounts are loading from Django.
  const [usersLoading, setUsersLoading] = useState(false);

    // Pending registrations retrieved from Django.
  const [pendingRegistrations, setPendingRegistrations] = useState([]);

  // Stores registered users retrieved from Django.
  const [databaseUsers, setDatabaseUsers] = useState([]);

  // Tracks loading and errors for registered users.
  const [databaseUsersLoading, setDatabaseUsersLoading] = useState(false);
  const [databaseUsersError, setDatabaseUsersError] = useState("");

  // Stores any error while loading pending accounts.
  const [usersError, setUsersError] = useState("");

    // Load pending registrations from the Django backend.
  useEffect(() => {
    const fetchPendingRegistrations = async () => {
      const token = localStorage.getItem("authToken");

      if (!token) {
        setUsersError("Administrator session not found. Please log in again.");
        return;
      }

      setUsersLoading(true);
      setUsersError("");

      try {
        const response = await fetch(
          "http://127.0.0.1:8000/api/auth/users/pending/",
          {
            method: "GET",
            headers: {
              Authorization: `Token ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? "Administrator access is required."
              : response.status === 401
              ? "Your session has expired. Please log in again."
              : "Failed to load pending registrations."
          );
        }

               const data = await response.json();

        // Django may return a paginated response.
        const users = Array.isArray(data)
          ? data
          : data.results;

        if (!Array.isArray(users)) {
          throw new Error(
            "The server returned an unexpected registration format."
          );
        }

        setPendingRegistrations(users);
        setUsersError("");

        console.log(
          "Pending registrations loaded:",
          users.length
        );
      } catch (err) {
        setUsersError(err.message);
        console.error("Pending registrations error:", err);
      } finally {
        setUsersLoading(false);
      }
    };

    fetchPendingRegistrations();
  }, []);

  // Load registered AquaTimbang users from Django.
useEffect(() => {
  const fetchDatabaseUsers = async () => {
    const token = localStorage.getItem("authToken");

    if (!token) {
      setDatabaseUsersError("Administrator session not found.");
      return;
    }

    setDatabaseUsersLoading(true);
    setDatabaseUsersError("");

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/auth/users/",
        {
          method: "GET",
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Administrator access is required."
            : response.status === 401
            ? "Your session has expired."
            : "Failed to load registered users."
        );
      }

      const data = await response.json();

      // Supports both plain arrays and paginated responses.
      const accounts = Array.isArray(data)
        ? data
        : data.results;

      if (!Array.isArray(accounts)) {
        throw new Error("Unexpected user list format.");
      }

      setDatabaseUsers(accounts);

      console.log("Registered users loaded:", accounts.length);
      console.log("Registered user list:", accounts);

    } catch (error) {
      console.error("Registered users error:", error);
      setDatabaseUsersError(error.message);

    } finally {
      setDatabaseUsersLoading(false);
    }
  };

  fetchDatabaseUsers();
}, []);

  /* ---------- SHARED STATE ---------- */

  const [users, setUsers] = useState([
    { id: 1, name: "Juan Dela Cruz", email: "juan@email.com", username: "juan_fisher", contact: "0917 234 5561", role: "Fish Vendor", municipality: "Cebu City", status: "Pending", registeredDate: "09/14/2026", approvedDate: "", lastLogin: "Never", loginCount: 0, logoutCount: 0, online: false },
    { id: 2, name: "Pedro Santos", email: "pedro@email.com", username: "pedro_fish", contact: "0918 445 2290", role: "Fish Vendor", municipality: "Cebu City", status: "Pending", registeredDate: "09/15/2026", approvedDate: "", lastLogin: "Never", loginCount: 0, logoutCount: 0, online: false },
    { id: 3, name: "Maria Garcia", email: "maria@email.com", username: "maria_vendor", contact: "0920 118 7734", role: "Fish Vendor", municipality: "Cebu City", status: "Pending", registeredDate: "09/15/2026", approvedDate: "", lastLogin: "Never", loginCount: 0, logoutCount: 0, online: false },
    { id: 9, name: "Carlos Reyes", email: "carlos.reyes@cebucity.gov.ph", username: "carlos_lgu", contact: "0919 610 4482", role: "LGU Personnel", municipality: "Cebu City", status: "Pending", registeredDate: "09/16/2026", approvedDate: "", lastLogin: "Never", loginCount: 0, logoutCount: 0, online: false },
    { id: 4, name: "Anna Smith", email: "anna@email.com", username: "anna_lgu", contact: "0917 700 1123", role: "LGU Personnel", municipality: "Cebu City", status: "Active", registeredDate: "03/02/2026", approvedDate: "03/03/2026", lastLogin: "09/16/2026 07:10 AM", loginCount: 118, logoutCount: 114, online: true },
    { id: 5, name: "Liza Fernandez", email: "liza@cebucity.gov.ph", username: "liza_lgu", contact: "0917 555 8820", role: "LGU Personnel", municipality: "Cebu City", status: "Active", registeredDate: "02/20/2026", approvedDate: "02/21/2026", lastLogin: "09/16/2026 06:02 AM", loginCount: 142, logoutCount: 139, online: true },
    { id: 6, name: "Marites Abellana", email: "marites@email.com", username: "marites_v", contact: "0917 555 0198", role: "Fish Vendor", municipality: "Cebu City", status: "Active", registeredDate: "01/18/2026", approvedDate: "01/19/2026", lastLogin: "09/16/2026 07:45 AM", loginCount: 96, logoutCount: 93, online: true },
    { id: 7, name: "Ronald Ceniza", email: "ronald@email.com", username: "ronald_v", contact: "0918 302 4471", role: "Fish Vendor", municipality: "Mandaue City", status: "Inactive", registeredDate: "01/22/2026", approvedDate: "01/23/2026", lastLogin: "08/29/2026 09:12 AM", loginCount: 41, logoutCount: 41, online: false },
    { id: 8, name: "System Admin", email: "admin@aquatimbang.ph", username: "sysadmin", contact: "0917 000 0001", role: "System Administrator", municipality: "Cebu City", status: "Active", registeredDate: "01/01/2026", approvedDate: "01/01/2026", lastLogin: "09/16/2026 08:55 AM", loginCount: 210, logoutCount: 205, online: true },
  ]);

  const [species, setSpecies] = useState([]);

// LOAD FISH SPECIES FROM DJANGO DATABASE
useEffect(() => {
  const loadFishSpecies = async () => {
    try {
      const token = localStorage.getItem("authToken");

      const response = await fetch(
        "http://127.0.0.1:8000/api/fish-species/",
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load fish species (${response.status})`);
      }

      const data = await response.json();

      const records = Array.isArray(data)
        ? data
        : data.results;

      if (!Array.isArray(records)) {
        throw new Error("Unexpected fish species response.");
      }

      setSpecies(records.map(mapDatabaseSpecies));
    } catch (error) {
      console.error("Fish species loading error:", error);
    }
  };

  loadFishSpecies();
}, []);

  const [municipalities, setMunicipalities] = useState([
    { id: 1, name: "Cebu City", status: "Active" },
    { id: 2, name: "Mandaue City", status: "Active" },
    { id: 3, name: "Lapu-Lapu City", status: "Inactive" },
  ]);

  const [markets, setMarkets] = useState([
    { id: 1, name: "Pasil Fish Market", municipality: "Cebu City", status: "Active" },
    { id: 2, name: "Carbon Public Market", municipality: "Cebu City", status: "Active" },
    { id: 3, name: "Mandaue City Market", municipality: "Mandaue City", status: "Active" },
    { id: 4, name: "Opon Public Market", municipality: "Lapu-Lapu City", status: "Inactive" },
  ]);

  const [priceRecords, setPriceRecords] = useState(() => buildPriceRecords());

  const [logs, setLogs] = useState([
    { id: 1, date: "09/16/2026 10:15 AM", user: "System Admin", role: "Administrator", action: "Approved user account", module: "User Management", status: "Success" },
    { id: 2, date: "09/16/2026 09:42 AM", user: "System Admin", role: "Administrator", action: "Updated fish species", module: "Fish Species", status: "Success" },
    { id: 3, date: "09/16/2026 09:20 AM", user: "System Admin", role: "Administrator", action: "Changed price validation bounds", module: "Configuration", status: "Success" },
    { id: 4, date: "09/16/2026 08:55 AM", user: "System Admin", role: "Administrator", action: "Logged in", module: "Authentication", status: "Success" },
  ]);

  const [config, setConfig] = useState({
    minPrice: 50,
    maxPrice: 1000,
    horizon: "7",
    method: "SARIMAX",
    retention: "5",
    keepLogs: true,
    lockout: true,
    sessionTimeout: true,
  });

  const [suggestions, setSuggestions] = useState(() => buildSuggestions());
  const [forecasts, setForecasts] = useState([]);
  const [announcements, setAnnouncements] = useState([
    { id: 1, title: "Scheduled maintenance — Sept 20", message: "AquaTimbang will be briefly unavailable on Sept 20, 12:00 AM–2:00 AM for maintenance.", date: "09/15/2026", status: "Active" },
    { id: 2, title: "New species added: Anduhaw", message: "Anduhaw has been added to the tracked species list.", date: "02/03/2026", status: "Expired" },
  ]);
  const [dismissedNotifs, setDismissedNotifs] = useState([]);
  const [adminProfile, setAdminProfile] = useState({
    name: "System Admin",
    email: "admin@aquatimbang.ph",
    username: "sysadmin",
    role: "System Administrator",
    lastLogin: "09/16/2026 08:55 AM",
  });

  /* ---------- HELPERS ---------- */

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  };

  const addLog = (action, module) => {
    setLogs((prev) => [
      {
        id: Date.now(),
        date: new Date().toLocaleString("en-PH", {
          month: "2-digit", day: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }),
        user: "System Admin",
        role: "Administrator",
        action,
        module,
        status: "Success",
      },
      ...prev,
    ]);
  };

  const menuGroups = [
    {
      label: "ADMINISTRATION",
      items: [
        { name: "Dashboard", icon: "▦" },
        { name: "User Management", icon: "♙" },
        { name: "Fish Species", icon: "🐟" },
        { name: "Municipality & Market", icon: "⚑" },
        { name: "Price Records", icon: "₱" },
        { name: "System Configuration", icon: "⚙" },
      ],
    },
    {
      label: "MONITORING",
      items: [
        { name: "Fisherfolk Suggestions", icon: "💬" },
        { name: "Predictive Analytics", icon: "📈" },
        { name: "Data Monitoring", icon: "🗄" },
        { name: "Notifications", icon: "🔔" },
      ],
    },
    {
      label: "REPORTS",
      items: [
        { name: "Reports Management", icon: "📄" },
        { name: "Activity Logs", icon: "◷" },
      ],
    },
    {
      label: "SYSTEM",
      items: [
        { name: "System Announcements", icon: "📢" },
        { name: "Admin Profile", icon: "👤" },
      ],
    },
  ];

  const notifications = buildNotifications(users, priceRecords, species, markets, forecasts, announcements);
  const unreadNotifs = notifications.filter((n) => !dismissedNotifs.includes(n.id));

  const renderPage = () => {
    switch (activePage) {
      case "User Management":
       return (
  <UserManagement
    users={users}
    setUsers={setUsers}
    notify={notify}
    addLog={addLog}
    logs={logs}
    pendingRegistrations={pendingRegistrations}
    usersLoading={usersLoading} 
    usersError={usersError}
    setPendingRegistrations={setPendingRegistrations}
    databaseUsers={databaseUsers}
    setDatabaseUsers={setDatabaseUsers}
    databaseUsersLoading={databaseUsersLoading}
    databaseUsersError={databaseUsersError}
  />
);
      case "Fish Species":
        return (
          <FishSpecies
            species={species} setSpecies={setSpecies}
            priceRecords={priceRecords}
            notify={notify} addLog={addLog}
          />
        );
      case "Municipality & Market":
        return (
          <MunicipalityMarket
            municipalities={municipalities} setMunicipalities={setMunicipalities}
            markets={markets} setMarkets={setMarkets}
            notify={notify} addLog={addLog}
          />
        );
      case "Price Records":
        return (
          <PriceRecords
            priceRecords={priceRecords} setPriceRecords={setPriceRecords}
            species={species} markets={markets}
            notify={notify} addLog={addLog}
          />
        );
      case "System Configuration":
        return <SystemConfiguration config={config} setConfig={setConfig} notify={notify} addLog={addLog} />;
      case "Fisherfolk Suggestions":
        return (
          <FisherfolkSuggestions
            suggestions={suggestions} setSuggestions={setSuggestions}
            notify={notify} addLog={addLog}
          />
        );
      case "Predictive Analytics":
        return (
          <PredictiveAnalytics
            species={species} markets={markets} priceRecords={priceRecords}
            forecasts={forecasts} setForecasts={setForecasts}
            notify={notify} addLog={addLog}
          />
        );
      case "Data Monitoring":
        return (
          <DataMonitoring
            species={species} markets={markets} priceRecords={priceRecords}
            goTo={setActivePage}
          />
        );
      case "Notifications":
        return (
          <Notifications
            notifications={notifications} dismissedNotifs={dismissedNotifs}
            setDismissedNotifs={setDismissedNotifs} goTo={setActivePage}
          />
        );
      case "Reports Management":
        return (
          <ReportsManagement
            users={users} species={species} logs={logs} priceRecords={priceRecords}
            notify={notify}
          />
        );
      case "Activity Logs":
        return <ActivityLogs logs={logs} notify={notify} />;
      case "System Announcements":
        return (
          <SystemAnnouncements
            announcements={announcements} setAnnouncements={setAnnouncements}
            notify={notify} addLog={addLog}
          />
        );
      case "Admin Profile":
        return (
          <AdminProfilePage
            profile={adminProfile} setProfile={setAdminProfile}
            notify={notify} addLog={addLog}
          />
        );
      default:
      return (
  <Dashboard
    users={users}
    species={species}
    priceRecords={priceRecords}
    markets={markets}
    logs={logs}
    goTo={setActivePage}
    pendingRegistrations={pendingRegistrations}
    usersLoading={usersLoading}
    usersError={usersError}
    databaseUsers={databaseUsers}
  />
);
    }
  };

  return (
    <div className="app">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">🐟</div>
          <div>
            <h2>AquaTimbang</h2>
            <span>Fish Price Transparency</span>
          </div>
        </div>

        <div className="admin-label">ADMINISTRATION</div>

        <nav>
          {menuGroups.map((group, gi) => (
            <React.Fragment key={group.label}>
              {gi > 0 && <div className="admin-label group-label">{group.label}</div>}
              {group.items.map((item) => (
                <button
                  key={item.name}
                  className={`nav-item ${activePage === item.name ? "active" : ""}`}
                  onClick={() => setActivePage(item.name)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.name}</span>
                  {item.name === "Notifications" && unreadNotifs.length > 0 && (
                    <span className="nav-badge">{unreadNotifs.length}</span>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="admin-profile">
            <div className="avatar">SA</div>
            <div>
              <strong>System Admin</strong>
              <small>Administrator</small>
            </div>
          </div>

          <button className="logout-btn" onClick={onLogout}>
            ↪ Logout
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">

        <header className="topbar">
          <div>
            <h1>{activePage}</h1>
            <p>Manage and monitor the AquaTimbang system</p>
          </div>

          <div className="topbar-right">
            <button
              className="notification"
              onClick={() => setActivePage("Notifications")}
            >
              🔔
              {unreadNotifs.length > 0 && <span className="notif-dot"></span>}
            </button>
            <div className="top-profile">
              <div className="avatar small">SA</div>
              <div>
                <strong>System Admin</strong>
                <span>Administrator</span>
              </div>
            </div>
          </div>
        </header>

        <section className="content">{renderPage()}</section>

      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ================================================================
   DASHBOARD
   ================================================================ */

function Dashboard({
  users,
  species,
  priceRecords,
  markets,
  logs,
  goTo,
  pendingRegistrations,
  databaseUsers,
  usersLoading,
  usersError,
}) {
  const pending = users.filter((u) => u.status === "Pending");
  const activeUsers = users.filter((u) => u.status === "Active");
  const onlineUsers = activeUsers.filter((u) => u.online);
  const offlineUsers = activeUsers.filter((u) => !u.online);
  const activeSpecies = species.filter((s) => s.status === "Active");
  const activeMarkets = markets.filter((m) => m.status === "Active");

  const activeRecords = priceRecords.filter((r) => r.status !== "Deleted");
  const today = activeRecords.length ? activeRecords[0].date : null;

  const todayRecords = activeRecords.filter((r) => r.date === today);
  const highestToday = todayRecords.length
    ? todayRecords.reduce((a, b) => (b.price > a.price ? b : a))
    : null;

  const weekAgo = today ? new Date(today + "T00:00:00") : null;
  if (weekAgo) weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = today ? new Date(today + "T00:00:00") : null;
  if (monthAgo) monthAgo.setDate(monthAgo.getDate() - 30);

  const weekRecords = today
    ? activeRecords.filter((r) => r.date >= weekAgo.toISOString().slice(0, 10))
    : [];
  const monthRecords = activeRecords;

  const highestWeek = weekRecords.length
    ? weekRecords.reduce((a, b) => (b.price > a.price ? b : a))
    : null;
  const highestMonth = monthRecords.length
    ? monthRecords.reduce((a, b) => (b.price > a.price ? b : a))
    : null;

  const speciesWithPrices = new Set(activeRecords.map((r) => r.species)).size;

  const recommendations = generateRecommendations(priceRecords);

  return (
    <>
      <div className="welcome-card">
        <div>
          <span className="eyebrow">SYSTEM ADMINISTRATOR</span>
          <h2>Welcome back, Administrator</h2>
          <p>Monitor AquaTimbang users, fish species, prices, and system activity.</p>
        </div>
        <div className="welcome-fish">🐟</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card clickable" onClick={() => goTo("User Management")}>
          <div className="stat-icon blue">♙</div>
          <div>
            <span>Total Users</span>
            <h2>{databaseUsers.length}</h2>
            <small>Registered accounts</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("User Management")}>
  <div className="stat-icon orange">⏳</div>
  <div>
    <span>Pending Approvals</span>
    <h2>{usersLoading ? "..." : usersError ? "—" : pendingRegistrations.length}</h2>
    <small>Awaiting review</small>
  </div>
</div>

        <div className="stat-card clickable" onClick={() => goTo("User Management")}>
          <div className="stat-icon green">●</div>
          <div>
            <span>Online Now</span>
            <h2>{onlineUsers.length}</h2>
            <small>{offlineUsers.length} offline · {activeUsers.length} active total</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Fish Species")}>
          <div className="stat-icon purple">🐟</div>
          <div>
            <span>Species With Prices</span>
            <h2>{speciesWithPrices}</h2>
            <small>of {activeSpecies.length} active species</small>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card clickable" onClick={() => goTo("Price Records")}>
          <div className="stat-icon blue">₱</div>
          <div>
            <span>Highest Price Today</span>
            <h2>{highestToday ? peso(highestToday.price) : "—"}</h2>
            <small>{highestToday ? `${highestToday.species} · ${highestToday.market}` : "No records today"}</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Price Records")}>
          <div className="stat-icon orange">📈</div>
          <div>
            <span>Highest This Week</span>
            <h2>{highestWeek ? peso(highestWeek.price) : "—"}</h2>
            <small>{highestWeek ? `${highestWeek.species} · ${fmtDate(highestWeek.date)}` : "—"}</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Price Records")}>
          <div className="stat-icon green">📊</div>
          <div>
            <span>Highest This Month</span>
            <h2>{highestMonth ? peso(highestMonth.price) : "—"}</h2>
            <small>{highestMonth ? `${highestMonth.species} · ${fmtDate(highestMonth.date)}` : "—"}</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Municipality & Market")}>
          <div className="stat-icon purple">⚑</div>
          <div>
            <span>Active Markets</span>
            <h2>{activeMarkets.length}</h2>
            <small>Across {municipalitiesCount(markets)} municipalities</small>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Price Recommendations</h3>
              <p>Auto-generated from this week's price movement</p>
            </div>
          </div>

          <div className="recommend-list">
            {recommendations.map((r, i) => (
              <div className="recommend-item" key={i}>
                <div className={`recommend-icon ${r.type}`}>
                  {r.type === "rising" ? "▲" : r.type === "falling" ? "▼" : "●"}
                </div>
                <p>{r.message}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Login Activity</h3>
              <p>Sessions across all users</p>
            </div>
            <button className="text-button" onClick={() => goTo("User Management")}>
              View Users →
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th>USER</th>
                <th>ROLE</th>
                <th>LOGINS</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {users.filter((u) => u.status === "Active").slice(0, 5).map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.role}</td>
                  <td>{u.loginCount}</td>
                  <td>
                    <span className={`badge ${u.online ? "success" : "inactive"}`}>
                      {u.online ? "Online" : "Offline"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Pending User Registrations</h3>
              <p>Users waiting for administrator approval</p>
            </div>
            <button className="text-button" onClick={() => goTo("User Management")}>
              View All →
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>USERNAME</th>
                <th>MUNICIPALITY</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-row">No pending registrations.</td>
                </tr>
              ) : (
                pending.slice(0, 3).map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.username}</td>
                    <td>{u.municipality}</td>
                    <td><span className="badge pending">Pending</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Recent Activities</h3>
              <p>Latest administrator activities</p>
            </div>
          </div>

          {logs.slice(0, 3).map((l) => (
            <div className="activity" key={l.id}>
              <div className="activity-icon blue-bg">◷</div>
              <div>
                <strong>{l.action}</strong>
                <p>{l.module}</p>
                <small>{l.date}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function municipalitiesCount(markets) {
  return new Set(markets.filter((m) => m.status === "Active").map((m) => m.municipality)).size;
}

/* ================================================================
   USER MANAGEMENT
   ================================================================ */

function UserManagement({
  users,
  setUsers,
  notify,
  addLog,
  logs,
  pendingRegistrations,
  setPendingRegistrations,
  databaseUsers,
  setDatabaseUsers,
  databaseUsersLoading,
  databaseUsersError,
  usersLoading,
  usersError,
}) {
  const [tab, setTab] = useState("Pending");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [reviewingUser, setReviewingUser] = useState(null);
  const [reviewAction, setReviewAction] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const openVerificationDocument = async (userId, documentType) => {
  const token = localStorage.getItem("authToken");

  if (!token) {
    notify("Please log in again.");
    return;
  }

  // Open a blank tab immediately so browsers don't block it.
  const newTab = window.open("", "_blank");

  if (!newTab) {
    notify("Please allow pop-ups to view verification documents.");
    return;
  }

  newTab.document.title = "Loading verification document";
  newTab.document.body.textContent = "Loading document securely...";

  setDocumentLoading(true);

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/api/auth/users/${userId}/verification/${documentType}/`,
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    );

    if (!response.ok) {
  let errorMessage = `Document request failed (HTTP ${response.status}).`;

  if (response.status === 401) {
    errorMessage = "Your login session is invalid or has expired.";
  } else if (response.status === 403) {
    errorMessage = "Administrator permission denied.";
  } else if (response.status === 404) {
    errorMessage = "Verification document or API endpoint not found.";
  } else if (response.status === 500) {
    errorMessage = "Django encountered a server error while opening the document.";
  }

  throw new Error(errorMessage);
}

    const blob = await response.blob();
    const fileUrl = URL.createObjectURL(blob);

    newTab.location.replace(fileUrl);

    // Allow the browser time to load the document.
    setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
  } catch (error) {
    newTab.close();
    notify(error.message);
  } finally {
    setDocumentLoading(false);
  }
};
  const [form, setForm] = useState({
    name: "", email: "", username: "", password: "", contact: "",
    role: "Fish Vendor", municipality: "Cebu City",
  });

  // Convert Django pending registrations into the format
  // expected by the existing User Management table.
  const databasePendingUsers = pendingRegistrations.map((account) => ({
    id: account.id,
    name: `${account.first_name || ""} ${account.last_name || ""}`.trim(),
    username: account.username,
    email: account.email,
    role: account.role === "LGU Officer" ? "LGU Personnel" : account.role,
    municipality: account.municipality || "",
    contact: account.contact_number || "",
    status: "Pending",
    online: false,
    source: "database",
    verification: account.verification,
    registeredDate: account.registered_at
    ? new Date(account.registered_at).toLocaleDateString("en-PH")
    : "—",
    lastLogin: "Never",
  }));

  // Keep sample users available in the other tabs for now,
  // but exclude their sample pending registrations.
  const combinedUsers = databaseUsers.map((account) => ({
  id: account.id,
  name: `${account.first_name || ""} ${account.last_name || ""}`.trim(),
  username: account.username,
  email: account.email,
  role: account.role === "LGU Officer"
    ? "LGU Personnel"
    : account.role,
  municipality: account.municipality || "",
  contact: account.contact_number || "",
  status:
  account.account_status === "rejected"
    ? "Rejected"
    : account.account_status === "pending"
    ? "Pending"
    : account.account_status === "approved"
    ? "Active"
    : account.is_active
    ? "Active"
    : "Pending",
  online: false,
  source: "database",
  verification: account.verification,
  registeredDate: account.registered_at
  ? new Date(account.registered_at).toLocaleDateString("en-PH")
  : "—",
  lastLogin: account.last_login
  ? new Date(account.last_login).toLocaleString("en-PH")
  : "Never",
  accountStatus: account.account_status,
  rejectionReason: account.rejection_reason || "",
  reviewedAt: account.reviewed_at || null,
  reviewedBy: account.reviewed_by || null,
}));

  const pendingCount = pendingRegistrations.length;
  const onlineCount = users.filter((u) => u.online).length;
  const offlineCount = users.filter((u) => u.status === "Active" && !u.online).length;

  const visible = (
  tab === "Pending"
    ? databasePendingUsers
    : tab === "Inactive"
    ? combinedUsers.filter(
        (u) => u.status === "Inactive" || u.status === "Rejected"
      )
    : combinedUsers
)
    .filter((u) => roleFilter === "All Roles" || u.role === roleFilter)
    .filter((u) =>
      [u.name, u.username, u.email, u.municipality].join(" ").toLowerCase().includes(search.toLowerCase())
    );

    const approve = (u) => {
  setReviewingUser(u);
  setReviewAction("approve");
  setReviewConfirmed(false);
  setRejectionReason("");
};

const reject = (u) => {
  setReviewingUser(u);
  setReviewAction("reject");
  setRejectionReason("");
};

const submitReview = async () => {
  if (!reviewingUser || reviewSaving) return;

  const reason = rejectionReason.trim();

  if (reviewAction === "approve" && !reviewConfirmed) {
  notify("Please confirm that you reviewed the applicant's verification documents.");
  return;
}

  if (reviewAction === "reject" && !reason) {
    notify("Please provide a reason for rejection.");
    return;
  }

  const token = localStorage.getItem("authToken");

  if (!token) {
    notify("Your session has expired. Please log in again.");
    return;
  }

  setReviewSaving(true);

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/api/auth/users/${reviewingUser.id}/${reviewAction}/`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          reviewAction === "reject"
            ? { reason: reason }
            : { verification_confirmed: true }
        ),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      notify(
        data.message ||
        data.detail ||
        `Unable to ${reviewAction} this account.`
      );
      return;
    }

    setPendingRegistrations((prev) =>
      prev.filter((account) => account.id !== reviewingUser.id)
    );

    setDatabaseUsers((prev) =>
      prev.map((account) =>
        account.id === reviewingUser.id
          ? {
              ...account,
              is_active: reviewAction === "approve",
              account_status:
                reviewAction === "approve" ? "approved" : "rejected",
              rejection_reason:
                reviewAction === "reject" ? reason : "",
                reviewed_at: data.reviewed_at || null,
            }
          : account
      )
    );

    addLog(
      `${reviewAction === "approve" ? "Approved" : "Rejected"} user: ${reviewingUser.name}`,
      "User Management"
    );

    notify(
      `${reviewingUser.name} ${
        reviewAction === "approve" ? "approved" : "rejected"
      } successfully.`
    );

    setReviewingUser(null);
    setReviewAction("");
    setRejectionReason("");
    setReviewConfirmed(false);
  } catch (error) {
    console.error("Account review failed:", error);
    notify("Unable to connect to the Django server.");
  } finally {
    setReviewSaving(false);
  }
};
  const toggleStatus = (u) => {
    const next = u.status === "Active" ? "Inactive" : "Active";

    if (next === "Inactive" &&
      !window.confirm(
        `Deactivate ${u.name}'s account? They will immediately lose access and won't be able to log in until reactivated.`
      )
    ) return;

    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, status: next, online: next === "Active" ? x.online : false } : x))
    );
    addLog(`${next === "Active" ? "Activated" : "Deactivated"} user: ${u.name}`, "User Management");
    notify(`${u.name} is now ${next.toLowerCase()}.`);
  };

  const remove = (u) => {
    if (!window.confirm(`Delete the account of ${u.name}? This cannot be undone.`)) return;
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    addLog(`Deleted user: ${u.name}`, "User Management");
    notify(`${u.name} deleted.`);
  };

  const resetPassword = (u) => {
    if (!window.confirm(`Send a password reset link to ${u.name} (${u.email})?`)) return;
    addLog(`Reset password for user: ${u.name}`, "User Management");
    notify(`Password reset link sent to ${u.name}.`);
  };

  const userHistory = (u) =>
    logs.filter((l) => l.action.toLowerCase().includes(u.name.toLowerCase()));

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", email: "", username: "", password: "", contact: "", role: "Fish Vendor", municipality: "Cebu City" });
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ ...u, password: "" });
    setShowForm(true);
  };

  const save = () => {
    if (!form.name.trim() || !form.username.trim()) {
      notify("Name and username are required.");
      return;
    }

    if (editing) {
      const roleChanged = editing.role !== form.role;

      if (roleChanged &&
        !window.confirm(
          `Change ${editing.name}'s role from ${editing.role} to ${form.role}? ` +
          `Starting with their next login, they will only have ${form.role} access and functions — ` +
          `their old ${editing.role} permissions will no longer apply.`
        )
      ) return;

      const { password, ...rest } = form;
      setUsers((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...rest } : x)));
      addLog(
        roleChanged
          ? `Changed role for ${form.name}: ${editing.role} → ${form.role}`
          : `Updated user: ${form.name}`,
        "User Management"
      );
      notify(roleChanged ? `${form.name}'s role updated to ${form.role}.` : "User updated.");
    } else {
      if (!form.password.trim() || !form.contact.trim() || !form.email.trim()) {
        notify("Password, contact, and email are required for a new account.");
        return;
      }
      const { password, ...rest } = form;
      setUsers((prev) => [
        ...prev,
        {
          ...rest,
          id: Date.now(),
          status: "Active",
          registeredDate: new Date().toLocaleDateString("en-PH"),
          approvedDate: new Date().toLocaleDateString("en-PH"),
          lastLogin: "Never",
          loginCount: 0,
          logoutCount: 0,
          online: false,
        },
      ]);
      addLog(`Created user: ${form.name}`, "User Management");
      notify("User created.");
    }

    setShowForm(false);
  };

  const initials = (name) => name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const roleClass = (role) => (role === "Fish Vendor" ? "vendor" : role === "LGU Personnel" ? "lgu" : "admin");

  return (
    <>
      <div className="page-title">
        <div>
          <h2>User Management</h2>
          <p>Manage user accounts, approvals, roles, and access.</p>
        </div>
        <button className="primary-btn" onClick={openAdd}>+ Add User</button>
      </div>

      <div className="log-summary">
        <div className="mini-stat">
          <span>Total Users</span>
          <strong>{databaseUsers.length}</strong>
        </div>
        <div className="mini-stat">
          <span>Pending Approval</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="mini-stat">
          <span>Online Now</span>
          <strong>{onlineCount}</strong>
        </div>
        <div className="mini-stat">
          <span>Offline</span>
          <strong>{offlineCount}</strong>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="notice">
          <div className="notice-icon">!</div>
          <div>
            <strong>{pendingCount} pending registrations</strong>
            <p>Review requested roles carefully — LGU Officer requests must be identity-verified before you approve them.</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing ? "Edit User" : "Add New User"}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Full Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Username</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>

            {!editing && (
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={form.password}
                  placeholder="Set an initial password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            )}

            <div className="form-group">
              <label>Email Address</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Contact Number</label>
              <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option>Fish Vendor</option>
                <option>LGU Personnel</option>
                <option>System Administrator</option>
              </select>
            </div>

            <div className="form-group">
              <label>Municipality</label>
              <select value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })}>
                <option>Cebu City</option>
                <option>Mandaue City</option>
              </select>
            </div>

            {!editing && (
              <div className="info-box">
                New accounts created here are activated immediately. Self-registered
                Fish Vendor accounts instead land in "Pending" until approved.
              </div>
            )}

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primary-btn" onClick={save}>
                {editing ? "Save Changes" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

{reviewingUser && (
  <div
    className="modal-backdrop"
    onClick={() => !reviewSaving && setReviewingUser(null)}
  >
    <div
      className="modal"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-head">
        <h3>
          {reviewAction === "approve"
            ? "Approve Registration"
            : "Reject Registration"}
        </h3>

        <button
          className="modal-close"
          disabled={reviewSaving}
          onClick={() => setReviewingUser(null)}
        >
          ✕
        </button>
      </div>

      <p>
        <strong>{reviewingUser.name}</strong>
      </p>

      <p>
        {reviewingUser.role} · {reviewingUser.municipality}
      </p>

      {reviewAction === "approve" ? (
        <div className="info-box">
  <label
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      cursor: "pointer",
    }}
  >
    <input
      type="checkbox"
      checked={reviewConfirmed}
      onChange={(e) => setReviewConfirmed(e.target.checked)}
      disabled={reviewSaving}
      style={{
        width: "18px",
        height: "18px",
        flexShrink: 0,
        marginTop: "2px",
        accentColor: "#087f8c",
      }}
    />

    <span>
      I confirm that I have reviewed the applicant's
      identity, registration details, and required
      verification documents.
    </span>
  </label>
</div>
      ) : (
        <div className="form-group">
          <label>Reason for Rejection *</label>

          <textarea
            value={rejectionReason}
            onChange={(e) =>
              setRejectionReason(e.target.value)
            }
            placeholder="Explain why this registration is being rejected..."
            rows={4}
            disabled={reviewSaving}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>
      )}

      <div className="button-row">
        <button
          className="secondary-btn"
          disabled={reviewSaving}
          onClick={() => setReviewingUser(null)}
        >
          Cancel
        </button>

        <button
          className="primary-btn"
          disabled={
            reviewSaving ||
            (reviewAction === "approve" && !reviewConfirmed) ||
            (reviewAction === "reject" && !rejectionReason.trim())
          }
          onClick={submitReview}
        >
          {reviewSaving
            ? "Saving..."
            : reviewAction === "approve"
            ? "Confirm Approval"
            : "Confirm Rejection"}
        </button>
      </div>
    </div>
  </div>
)}

      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>User Profile</h3>
              <button className="modal-close" onClick={() => setViewing(null)}>✕</button>
            </div>

            <div className="profile-head">
              <div className="table-avatar profile-avatar">{initials(viewing.name)}</div>
              <div>
                <strong>{viewing.name}</strong>
                <p>{viewing.email}</p>
                <div className="profile-badges">
                  <span className={`role ${roleClass(viewing.role)}`}>{viewing.role}</span>
                  <span className={`badge ${viewing.status.toLowerCase()}`}>{viewing.status}</span>
                  <span className={`badge ${viewing.online ? "success" : "inactive"}`}>
                    {viewing.online ? "Online" : "Offline"}
                  </span>
                </div>
              </div>
            </div>

            <div className="profile-grid">
              <div className="profile-field">
                <span>Username</span>
                <strong>{viewing.username}</strong>
              </div>
              <div className="profile-field">
                <span>Contact</span>
                <strong>{viewing.contact}</strong>
              </div>
              <div className="profile-field">
                <span>Municipality</span>
                <strong>{viewing.municipality}</strong>
              </div>
              <div className="profile-field">
                <span>Registered Date</span>
                <strong>{viewing.registeredDate}</strong>
              </div>
              <div className="profile-field">
                <span>Approved Date</span>
                <strong>{viewing.approvedDate || "—"}</strong>
              </div>
              <div className="profile-field">
                <span>Last Login</span>
                <strong>{viewing.lastLogin}</strong>
              </div>
              <div className="profile-field">
                <span>Total Logins</span>
                <strong>{viewing.loginCount}</strong>
              </div>
              <div className="profile-field">
                <span>Total Logouts</span>
                <strong>{viewing.logoutCount}</strong>
              </div>
            </div>

{viewing.verification?.type && (
  <>
    <div className="mini-head">Registration Verification</div>

    <div className="profile-grid">
      {Object.entries(viewing.verification.details || {}).map(
        ([key, value]) => (
          <div className="profile-field" key={key}>
            <span>
              {key.replaceAll("_", " ").replace(/\b\w/g, (c) =>
                c.toUpperCase()
              )}
            </span>
            <strong>{value || "Not provided"}</strong>
          </div>
        )
      )}
    </div>

    <div className="mini-head">Submitted Documents</div>

    <div className="button-row">
      {viewing.verification.documents?.permit && (
        <button
          className="secondary-btn"
          disabled={documentLoading}
          onClick={() =>
            openVerificationDocument(viewing.id, "vendor-permit")
          }
        >
          View Vendor Permit
        </button>
      )}

      {viewing.verification.documents?.stall_photo && (
        <button
          className="secondary-btn"
          disabled={documentLoading}
          onClick={() =>
            openVerificationDocument(viewing.id, "vendor-stall")
          }
        >
          View Stall Photo
        </button>
      )}

      {viewing.verification.documents?.authorization && (
        <button
          className="secondary-btn"
          disabled={documentLoading}
          onClick={() =>
            openVerificationDocument(viewing.id, "lgu-authorization")
          }
        >
          View LGU Authorization
        </button>
      )}
    </div>

    {!Object.values(viewing.verification.documents || {}).some(Boolean) && (
      <p>No verification documents were uploaded.</p>
    )}
  </>
)}

{viewing.status === "Rejected" && (
  <>
    <div className="mini-head">Rejection Details</div>

    <div className="profile-grid">
      <div className="profile-field">
        <span>Rejection Reason</span>
        <strong>
          {viewing.rejectionReason || "Not provided"}
        </strong>
      </div>
    </div>
  </>
)}

            <div className="mini-head">Account History</div>
            <div className="history-list">
              {userHistory(viewing).length === 0 ? (
                <p className="empty-row">No recorded activity for this account yet.</p>
              ) : (
                userHistory(viewing).map((l) => (
                  <div className="history-item" key={l.id}>
                    <div>
                      <strong>{l.action}</strong>
                      <p>{l.module}</p>
                    </div>
                    <small>{l.date}</small>
                  </div>
                ))
              )}
            </div>

            <div className="button-row">
              <button
  className="secondary-btn"
  disabled
  title="Database-backed user editing is not implemented yet"
>
  Edit User (Coming Soon)
</button>
              <button className="primary-btn" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="tabs">
          {["Pending", "All Users", "Inactive"].map((t) => (
            <button
              key={t}
              className={tab === t ? "tab active-tab" : "tab"}
              onClick={() => setTab(t)}
            >
              {t === "Pending" ? "Pending Approval" : t}
              {t === "Pending" && pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
            </button>
          ))}
        </div>

        <div className="table-tools">
          <div className="search-box">
            🔍
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option>All Roles</option>
            <option>Fish Vendor</option>
            <option>LGU Personnel</option>
            <option>System Administrator</option>
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>USER</th>
              <th>USERNAME</th>
              <th>ROLE</th>
              <th>MUNICIPALITY</th>
              <th>LAST LOGIN</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-row">No users found.</td>
              </tr>
            ) : (
              visible.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <div className="table-avatar">{initials(u.name)}</div>
                      <div>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{u.username}</td>
                  <td>
                    <span className={`role ${roleClass(u.role)}`}>{u.role}</span>
                    {u.status === "Pending" && u.role === "LGU Personnel" && (
                      <small className="verify-flag">⚠ Needs identity verification</small>
                    )}
                  </td>
                  <td>{u.municipality}</td>
                  <td>{u.lastLogin}</td>
                  <td>
                    <span className={`badge ${u.status.toLowerCase()}`}>{u.status}</span>
                  </td>
                  <td>
                    {u.status === "Pending" ? (
                      <div className="action-buttons">
                        <button className="approve" onClick={() => approve(u)}>Approve</button>
                        <button className="reject" onClick={() => reject(u)}>Reject</button>
                        <div className="action-icons inline-icons">
                          <button title="View Profile" onClick={() => setViewing(u)}>👁</button>
                        </div>
                      </div>
                    ) : (
                      <div className="action-icons">
                        <button title="View Profile" onClick={() => setViewing(u)}>👁</button>
                        <button title="Edit" onClick={() => openEdit(u)}>✎</button>
                        <button title="Reset Password" onClick={() => resetPassword(u)}>🔑</button>
                        <button
                          title={u.status === "Active" ? "Deactivate" : "Activate"}
                          onClick={() => toggleStatus(u)}
                        >
                          ◉
                        </button>
                        <button title="Delete" onClick={() => remove(u)}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   FISH SPECIES
   ================================================================ */

function FishSpecies({ species, setSpecies, priceRecords, notify, addLog }) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({ name: "", scientific: "", description: "" });
  const [speciesSaving, setSpeciesSaving] = useState(false);
  const visible = species.filter((s) =>
    [s.name, s.scientific, s.description].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const recordsFor = (name) => priceRecords.filter((r) => r.species === name && r.status !== "Deleted");

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", scientific: "", description: "" });
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({ ...s });
    setShowForm(true);
  };

  const speciesRequest = async (url, method, body = null) => {
  const token = localStorage.getItem("authToken");

  if (!token) {
    throw new Error("Your session has expired. Please log in again.");
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Token ${token}`,
      ...(body !== null ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });

  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }

  let details = null;

  try {
    details = await response.json();
  } catch {
    // The server may return an HTML error page.
  }

  const message =
    details?.message ||
    details?.detail ||
    (details && Object.entries(details)
      .map(([field, errors]) =>
        `${field}: ${Array.isArray(errors) ? errors.join(", ") : errors}`
      )
      .join("; ")) ||
    `Request failed (${response.status}).`;

  throw new Error(message);
};

  const save = async () => {
  if (speciesSaving) return;

  const name = form.name.trim();

  if (!name) {
    notify("Species name is required.");
    return;
  }

  const payload = {
    name,
    scientific_name: form.scientific.trim(),
    description: form.description.trim(),
  };

  setSpeciesSaving(true);

  try {
    const url = editing
      ? `http://127.0.0.1:8000/api/fish-species/${editing.id}/`
      : "http://127.0.0.1:8000/api/fish-species/";

    const result = await speciesRequest(
      url,
      editing ? "PATCH" : "POST",
      payload
    );

    const updated = mapDatabaseSpecies(result);

    setSpecies((prev) =>
      editing
        ? prev.map((item) =>
            item.id === editing.id ? updated : item
          )
        : [...prev, updated]
    );

    addLog(
      `${editing ? "Updated" : "Added"} species: ${updated.name}`,
      "Fish Species"
    );

    notify(editing ? "Species updated successfully." : "Species added successfully.");
    setShowForm(false);
    setEditing(null);
  } catch (error) {
    console.error("Fish species save error:", error);
    notify(error.message);
  } finally {
    setSpeciesSaving(false);
  }
};

const toggleStatus = async (s) => {
  if (speciesSaving) return;

  const nextActive = s.status !== "Active";

  if (
    !nextActive &&
    !window.confirm(`Deactivate ${s.name}? It will no longer be available for new price entries.`)
  ) {
    return;
  }

  setSpeciesSaving(true);

  try {
    const result = await speciesRequest(
      `http://127.0.0.1:8000/api/fish-species/${s.id}/`,
      "PATCH",
      { is_active: nextActive }
    );

    const updated = mapDatabaseSpecies(result);

    setSpecies((prev) =>
      prev.map((item) => item.id === s.id ? updated : item)
    );

    addLog(
      `${nextActive ? "Reactivated" : "Deactivated"} species: ${s.name}`,
      "Fish Species"
    );

    notify(`${s.name} is now ${nextActive ? "active" : "inactive"}.`);
  } catch (error) {
    console.error("Species status error:", error);
    notify(error.message);
  } finally {
    setSpeciesSaving(false);
  }
};

 const remove = async (s) => {
  if (speciesSaving) return;

  if (recordsFor(s.name).length > 0) {
    notify("This species has price records. Deactivate it instead of deleting.");
    return;
  }

  if (!window.confirm(
    `Permanently delete ${s.name}? This action cannot be undone.`
  )) {
    return;
  }

  setSpeciesSaving(true);

  try {
    await speciesRequest(
      `http://127.0.0.1:8000/api/fish-species/${s.id}/`,
      "DELETE"
    );

    setSpecies((prev) => prev.filter((item) => item.id !== s.id));

    addLog(`Deleted species: ${s.name}`, "Fish Species");
    notify(`${s.name} deleted successfully.`);
  } catch (error) {
    console.error("Species deletion error:", error);
    notify(error.message);
  } finally {
    setSpeciesSaving(false);
  }
};

  const initials = (name) => name.slice(0, 2).toUpperCase();

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Fish Species</h2>
          <p>Manage the list of fish species tracked by the system.</p>
        </div>
        <button className="primary-btn" onClick={openAdd}>+ Add Species</button>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing ? "Edit Species" : "Add New Species"}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Common Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Scientific Name</label>
              <input value={form.scientific} onChange={(e) => setForm({ ...form, scientific: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primary-btn" onClick={save} disabled={speciesSaving}>{speciesSaving ? "Saving..." : editing ? "Save Changes" : "Add Species"}</button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Species Details</h3>
              <button className="modal-close" onClick={() => setViewing(null)}>✕</button>
            </div>

            <div className="profile-head">
              <div className="table-avatar profile-avatar">{initials(viewing.name)}</div>
              <div>
                <strong>{viewing.name}</strong>
                <p>{viewing.scientific}</p>
                <div className="profile-badges">
                  <span className={`badge ${viewing.status === "Active" ? "success" : "inactive"}`}>
                    {viewing.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="info-box">{viewing.description}</div>

            <div className="profile-grid" style={{ marginTop: 14 }}>
              <div className="profile-field">
                <span>Date Added</span>
                <strong>{viewing.dateAdded}</strong>
              </div>
              <div className="profile-field">
                <span>Price Records</span>
                <strong>{recordsFor(viewing.name).length}</strong>
              </div>
            </div>

            <div className="mini-head">Recent Price History</div>
            <div className="history-list">
              {recordsFor(viewing.name).slice(0, 6).length === 0 ? (
                <p className="empty-row">No price records for this species yet.</p>
              ) : (
                recordsFor(viewing.name).slice(0, 6).map((r) => (
                  <div className="history-item" key={r.id}>
                    <div>
                      <strong>{peso(r.price)} / kg</strong>
                      <p>{r.market}{r.status === "Corrected" ? " · corrected" : ""}</p>
                    </div>
                    <small>{fmtDate(r.date)}</small>
                  </div>
                ))
              )}
            </div>

            <div className="button-row">
              <button className="secondary-btn" onClick={() => { setViewing(null); openEdit(viewing); }}>
                Edit Species
              </button>
              <button className="primary-btn" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="table-tools">
          <div className="search-box">
            🔍
            <input
              type="text"
              placeholder="Search species..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>SPECIES</th>
              <th>DESCRIPTION</th>
              <th>DATE ADDED</th>
              <th>PRICE RECORDS</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-row">No species found.</td>
              </tr>
            ) : (
              visible.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="species-cell">
                      <div className="fish-avatar">{initials(s.name)}</div>
                      <div>
                        <strong>{s.name}</strong>
                        <small>{s.scientific}</small>
                      </div>
                    </div>
                  </td>
                  <td>{s.description}</td>
                  <td>{s.dateAdded}</td>
                  <td>{recordsFor(s.name).length}</td>
                  <td><span className={`badge ${s.status === "Active" ? "success" : "inactive"}`}>{s.status}</span></td>
                  <td>
                    <div className="action-icons">
                      <button title="View Details" onClick={() => setViewing(s)}>👁</button>
                      <button title="Edit" onClick={() => openEdit(s)}>✎</button>
                      <button
                        title={s.status === "Active" ? "Deactivate" : "Reactivate"}
                        onClick={() => toggleStatus(s)}
                      >
                        ◉
                      </button>
                      <button title="Delete" onClick={() => remove(s)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   MUNICIPALITY & MARKET MANAGEMENT
   ================================================================ */

function MunicipalityMarket({ municipalities, setMunicipalities, markets, setMarkets, notify, addLog }) {
  const [muniForm, setMuniForm] = useState({ name: "" });
  const [showMuniForm, setShowMuniForm] = useState(false);
  const [editingMuni, setEditingMuni] = useState(null);

  const [marketForm, setMarketForm] = useState({ name: "", municipality: municipalities[0]?.name || "" });
  const [showMarketForm, setShowMarketForm] = useState(false);
  const [editingMarket, setEditingMarket] = useState(null);

  const activeMunicipalities = municipalities.filter((m) => m.status === "Active");

  /* ---- municipalities ---- */

  const openAddMuni = () => {
    setEditingMuni(null);
    setMuniForm({ name: "" });
    setShowMuniForm(true);
  };

  const openEditMuni = (m) => {
    setEditingMuni(m);
    setMuniForm({ name: m.name });
    setShowMuniForm(true);
  };

  const saveMuni = () => {
    if (!muniForm.name.trim()) {
      notify("Municipality name is required.");
      return;
    }

    if (editingMuni) {
      setMunicipalities((prev) =>
        prev.map((x) => (x.id === editingMuni.id ? { ...x, name: muniForm.name } : x))
      );
      addLog(`Renamed municipality to: ${muniForm.name}`, "Municipality & Market");
      notify("Municipality updated.");
    } else {
      setMunicipalities((prev) => [...prev, { id: Date.now(), name: muniForm.name, status: "Active" }]);
      addLog(`Added municipality: ${muniForm.name}`, "Municipality & Market");
      notify("Municipality added.");
    }

    setShowMuniForm(false);
  };

  const toggleMuni = (m) => {
    const next = m.status === "Active" ? "Inactive" : "Active";
    setMunicipalities((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
    addLog(`${next === "Active" ? "Reactivated" : "Deactivated"} municipality: ${m.name}`, "Municipality & Market");
    notify(`${m.name} is now ${next.toLowerCase()}.`);
  };

  /* ---- markets ---- */

  const openAddMarket = () => {
    setEditingMarket(null);
    setMarketForm({ name: "", municipality: activeMunicipalities[0]?.name || "" });
    setShowMarketForm(true);
  };

  const openEditMarket = (m) => {
    setEditingMarket(m);
    setMarketForm({ name: m.name, municipality: m.municipality });
    setShowMarketForm(true);
  };

  const saveMarket = () => {
    if (!marketForm.name.trim()) {
      notify("Market name is required.");
      return;
    }

    if (editingMarket) {
      setMarkets((prev) =>
        prev.map((x) => (x.id === editingMarket.id ? { ...x, ...marketForm } : x))
      );
      addLog(`Updated market: ${marketForm.name}`, "Municipality & Market");
      notify("Market updated.");
    } else {
      setMarkets((prev) => [...prev, { ...marketForm, id: Date.now(), status: "Active" }]);
      addLog(`Added market: ${marketForm.name}`, "Municipality & Market");
      notify("Market added.");
    }

    setShowMarketForm(false);
  };

  const toggleMarket = (m) => {
    const next = m.status === "Active" ? "Inactive" : "Active";
    setMarkets((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
    addLog(`${next === "Active" ? "Reactivated" : "Deactivated"} market: ${m.name}`, "Municipality & Market");
    notify(`${m.name} is now ${next.toLowerCase()}.`);
  };

  const removeMarket = (m) => {
    if (m.status === "Active") {
      notify("Only inactive markets can be removed. Deactivate it first.");
      return;
    }
    if (!window.confirm(`Permanently remove ${m.name}? This cannot be undone.`)) return;
    setMarkets((prev) => prev.filter((x) => x.id !== m.id));
    addLog(`Removed inactive market: ${m.name}`, "Municipality & Market");
    notify(`${m.name} removed.`);
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Municipality &amp; Market Management</h2>
          <p>Manage municipalities and the markets that report prices under them.</p>
        </div>
      </div>

      {showMuniForm && (
        <div className="modal-backdrop" onClick={() => setShowMuniForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingMuni ? "Edit Municipality" : "Add Municipality"}</h3>
              <button className="modal-close" onClick={() => setShowMuniForm(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Municipality Name</label>
              <input value={muniForm.name} onChange={(e) => setMuniForm({ name: e.target.value })} />
            </div>

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setShowMuniForm(false)}>Cancel</button>
              <button className="primary-btn" onClick={saveMuni}>
                {editingMuni ? "Save Changes" : "Add Municipality"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMarketForm && (
        <div className="modal-backdrop" onClick={() => setShowMarketForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingMarket ? "Edit Market" : "Add Market"}</h3>
              <button className="modal-close" onClick={() => setShowMarketForm(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Market Name</label>
              <input value={marketForm.name} onChange={(e) => setMarketForm({ ...marketForm, name: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Municipality</label>
              <select
                value={marketForm.municipality}
                onChange={(e) => setMarketForm({ ...marketForm, municipality: e.target.value })}
              >
                {activeMunicipalities.map((m) => <option key={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setShowMarketForm(false)}>Cancel</button>
              <button className="primary-btn" onClick={saveMarket}>
                {editingMarket ? "Save Changes" : "Add Market"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="config-grid">

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">⚑</div>
            <div>
              <h3>Municipalities</h3>
              <p>Areas covered by AquaTimbang</p>
            </div>
          </div>

          <table className="inner-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {municipalities.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  <td><span className={`badge ${m.status === "Active" ? "success" : "inactive"}`}>{m.status}</span></td>
                  <td>
                    <div className="action-icons">
                      <button title="Edit" onClick={() => openEditMuni(m)}>✎</button>
                      <button
                        title={m.status === "Active" ? "Deactivate" : "Reactivate"}
                        onClick={() => toggleMuni(m)}
                      >
                        ◉
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="primary-btn full-btn" onClick={openAddMuni}>+ Add Municipality</button>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">▤</div>
            <div>
              <h3>Markets</h3>
              <p>Individual markets under each municipality</p>
            </div>
          </div>

          <table className="inner-table">
            <thead>
              <tr>
                <th>MARKET</th>
                <th>MUNICIPALITY</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  <td>{m.municipality}</td>
                  <td><span className={`badge ${m.status === "Active" ? "success" : "inactive"}`}>{m.status}</span></td>
                  <td>
                    <div className="action-icons">
                      <button title="Edit" onClick={() => openEditMarket(m)}>✎</button>
                      <button
                        title={m.status === "Active" ? "Deactivate" : "Reactivate"}
                        onClick={() => toggleMarket(m)}
                      >
                        ◉
                      </button>
                      {m.status === "Inactive" && (
                        <button title="Remove permanently" onClick={() => removeMarket(m)}>✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="primary-btn full-btn" onClick={openAddMarket}>+ Add Market</button>

          <div className="info-box" style={{ marginTop: 14 }}>
            Only inactive markets can be permanently removed — deactivate a market
            first if it's closing for good.
          </div>
        </div>

      </div>
    </>
  );
}

/* ================================================================
   PRICE RECORDS
   ================================================================ */

function PriceRecords({ priceRecords, setPriceRecords, species, markets, notify, addLog }) {
  const [tab, setTab] = useState("Current");
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("All Species");
  const [marketFilter, setMarketFilter] = useState("All Markets");
  const [dateFilter, setDateFilter] = useState("");

  const activeSpecies = species.filter((s) => s.status === "Active");
  const activeMarkets = markets.filter((m) => m.status === "Active");

  const today = priceRecords.length
    ? priceRecords.filter((r) => r.status !== "Deleted")[0]?.date
    : null;

  const base = priceRecords.filter((r) => {
    if (tab === "Current") return r.date === today && r.status !== "Deleted";
    if (tab === "Historical") return r.status !== "Deleted";
    if (tab === "Corrected") return r.status === "Corrected";
    if (tab === "Deleted") return r.status === "Deleted";
    return true;
  });

  const visible = base
    .filter((r) => speciesFilter === "All Species" || r.species === speciesFilter)
    .filter((r) => marketFilter === "All Markets" || r.market === marketFilter)
    .filter((r) => !dateFilter || r.date === dateFilter)
    .filter((r) =>
      [r.species, r.market, r.enteredBy].join(" ").toLowerCase().includes(search.toLowerCase())
    );

  const missing = [];
  if (today) {
    activeSpecies.forEach((sp) => {
      activeMarkets.forEach((mk) => {
        const has = priceRecords.some(
          (r) => r.species === sp.name && r.market === mk.name && r.date === today && r.status !== "Deleted"
        );
        if (!has) missing.push({ species: sp.name, market: mk.name });
      });
    });
  }

  const deleteRecord = (r) => {
    if (!window.confirm(`Mark this ${r.species} record (${peso(r.price)}) as deleted?`)) return;
    setPriceRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "Deleted" } : x)));
    addLog(`Deleted price record: ${r.species} · ${peso(r.price)} · ${fmtDate(r.date)}`, "Price Records");
    notify("Record marked as deleted.");
  };

  const restoreRecord = (r) => {
    setPriceRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "Active" } : x)));
    addLog(`Restored price record: ${r.species} · ${peso(r.price)} · ${fmtDate(r.date)}`, "Price Records");
    notify("Record restored.");
  };

  const correctRecord = (r) => {
    const input = window.prompt(`Correct the price for ${r.species} on ${fmtDate(r.date)}:`, r.price);
    if (input === null) return;

    const newPrice = parseFloat(input);
    if (isNaN(newPrice) || newPrice <= 0) {
      notify("Invalid price entered.");
      return;
    }

    setPriceRecords((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? {
              ...x,
              status: "Corrected",
              previousPrice: x.price,
              price: newPrice,
              correctedBy: "System Admin",
              correctedDate: new Date().toLocaleDateString("en-PH"),
            }
          : x
      )
    );

    addLog(`Corrected price record: ${r.species} ${peso(r.price)} → ${peso(newPrice)}`, "Price Records");
    notify("Record corrected.");
  };

  const exportCSV = () => {
    const header = "Date,Species,Municipality,Market,Price,Entered By,Status\n";
    const body = visible
      .map((r) => `"${r.date}","${r.species}","${r.municipality}","${r.market}","${r.price.toFixed(2)}","${r.enteredBy}","${r.status}"`)
      .join("\n");

    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "price_records.csv";
    a.click();
    URL.revokeObjectURL(url);

    notify("Price records exported.");
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Records</h2>
          <p>View, filter, and audit every price entry logged in the system.</p>
        </div>
        <button className="secondary-btn" onClick={exportCSV}>↓ Export CSV</button>
      </div>

      {missing.length > 0 && (
        <div className="notice">
          <div className="notice-icon">!</div>
          <div>
            <strong>{missing.length} missing price record{missing.length > 1 ? "s" : ""} for today</strong>
            <p>
              {missing.map((m) => `${m.species} at ${m.market}`).join(", ")} —
              not yet encoded by any LGU officer.
            </p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="tabs">
          {["Current", "Historical", "Corrected", "Deleted"].map((t) => (
            <button
              key={t}
              className={tab === t ? "tab active-tab" : "tab"}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="table-tools">
          <div className="search-box">
            🔍
            <input
              type="text"
              placeholder="Search species, market, or encoder..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)}>
            <option>All Species</option>
            {species.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>

          <select value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}>
            <option>All Markets</option>
            {markets.map((m) => <option key={m.id}>{m.name}</option>)}
          </select>

          <input
            className="date-input"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>

        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>SPECIES</th>
              <th>MARKET</th>
              <th>PRICE / KG</th>
              <th>ENTERED BY</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-row">No records match these filters.</td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td><strong>{r.species}</strong></td>
                  <td>{r.market}</td>
                  <td>
                    <strong>{peso(r.price)}</strong>
                    {r.status === "Corrected" && (
                      <small className="muted-text"> (was {peso(r.previousPrice)})</small>
                    )}
                  </td>
                  <td>{r.enteredBy}</td>
                  <td>
                    <span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                  <td>
                    <div className="action-icons">
                      {r.status !== "Deleted" ? (
                        <>
                          <button title="Correct price" onClick={() => correctRecord(r)}>✎</button>
                          <button title="Delete" onClick={() => deleteRecord(r)}>✕</button>
                        </>
                      ) : (
                        <button title="Restore" onClick={() => restoreRecord(r)}>↺</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   SYSTEM CONFIGURATION
   ================================================================ */

function SystemConfiguration({ config, setConfig, notify, addLog }) {
  const [draft, setDraft] = useState(config);

  const update = (key, value) => setDraft({ ...draft, [key]: value });

  const save = () => {
    if (Number(draft.minPrice) >= Number(draft.maxPrice)) {
      notify("Minimum price must be lower than maximum price.");
      return;
    }
    setConfig(draft);
    addLog("Updated system configuration", "Configuration");
    notify("Configuration saved.");
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>System Configuration</h2>
          <p>Configure validation rules, forecasting settings, and data retention.</p>
        </div>
        <button className="primary-btn" onClick={save}>Save Changes</button>
      </div>

      <div className="config-grid">

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">₱</div>
            <div>
              <h3>Price Validation</h3>
              <p>Configure acceptable fish price ranges.</p>
            </div>
          </div>

          <div className="form-group">
            <label>Minimum Price per KG</label>
            <div className="input-with-unit">
              <span>₱</span>
              <input type="number" value={draft.minPrice} onChange={(e) => update("minPrice", e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Maximum Price per KG</label>
            <div className="input-with-unit">
              <span>₱</span>
              <input type="number" value={draft.maxPrice} onChange={(e) => update("maxPrice", e.target.value)} />
            </div>
          </div>

          <div className="info-box">
            Prices outside ₱{draft.minPrice} – ₱{draft.maxPrice} will trigger a
            validation warning during price entry.
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon purple">◔</div>
            <div>
              <h3>Forecast Settings</h3>
              <p>Configure short-term forecasting parameters.</p>
            </div>
          </div>

          <div className="form-group">
            <label>Forecast Horizon</label>
            <select value={draft.horizon} onChange={(e) => update("horizon", e.target.value)}>
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="30">30 Days</option>
            </select>
          </div>

          <div className="form-group">
            <label>Forecast Method</label>
            <select value={draft.method} onChange={(e) => update("method", e.target.value)}>
              <option>Moving Average</option>
              <option>SARIMAX</option>
            </select>
          </div>

          <div className="info-box purple-info">
            Currently using <strong>{draft.method}</strong> over a <strong>{draft.horizon}-day</strong> horizon.
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">▣</div>
            <div>
              <h3>Data Management</h3>
              <p>Configure historical data retention.</p>
            </div>
          </div>

          <div className="form-group">
            <label>Data Retention Period</label>
            <select value={draft.retention} onChange={(e) => update("retention", e.target.value)}>
              <option value="1">1 Year</option>
              <option value="3">3 Years</option>
              <option value="5">5 Years</option>
              <option value="10">10 Years</option>
            </select>
          </div>

          <div className="toggle-row">
            <div>
              <strong>Keep Activity Logs</strong>
              <p>Preserve administrator activity records.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={draft.keepLogs} onChange={(e) => update("keepLogs", e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon green">🔒</div>
            <div>
              <h3>Security Settings</h3>
              <p>Manage basic system security controls.</p>
            </div>
          </div>

          <div className="toggle-row">
            <div>
              <strong>Account Lockout</strong>
              <p>Lock account after repeated failed attempts.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={draft.lockout} onChange={(e) => update("lockout", e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <strong>Session Timeout</strong>
              <p>Automatically end inactive sessions.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={draft.sessionTimeout} onChange={(e) => update("sessionTimeout", e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>
        </div>

      </div>
    </>
  );
}

/* ================================================================
   ACTIVITY LOGS
   ================================================================ */

function ActivityLogs({ notify }) {
  const [selectedLog, setSelectedLog] = useState(null);
  const { records, loading, error, refresh } = useDjangoActivityLogs();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("All Actions");
  const [role, setRole] = useState("All Roles");
  const [moduleFilter, setModuleFilter] = useState("All Modules");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const actions = [...new Set(records.map(l => l.action).filter(Boolean))].sort();
  const roles = [...new Set(records.map(l => l.actor_role).filter(Boolean))].sort();
  const modules = [...new Set(records.map(auditModule))].sort();
  const visible = records.filter(l => {
    const day = l.created_at ? l.created_at.slice(0, 10) : "";
    return (action === "All Actions" || l.action === action)
      && (role === "All Roles" || l.actor_role === role)
      && (moduleFilter === "All Modules" || auditModule(l) === moduleFilter)
      && (!from || day >= from) && (!to || day <= to)
      && [l.actor_username, l.actor_role, auditModule(l), l.action, l.target_name, l.target_type, formatAuditDetails(l.details)]
        .join(" ").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Activity Logs</h2>
          <p>Permanent activity records from Django for supported AquaTimbang modules.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="secondary-btn" onClick={refresh} disabled={loading}>↻ Refresh</button>
          <button className="secondary-btn" disabled={!visible.length} onClick={() => {
            exportAuditCsv(visible, "aquatimbang_activity_logs.csv");
            notify("Activity logs exported.");
          }}>↓ Export CSV</button>
        </div>
      </div>
      <div className="log-summary">
        <div className="mini-stat"><span>Recorded Events</span><strong>{records.length}</strong></div>
        <div className="mini-stat"><span>Showing</span><strong>{visible.length}</strong></div>
        <div className="mini-stat"><span>Users</span><strong>{new Set(records.map(l => l.actor_username).filter(Boolean)).size}</strong></div>
      </div>
      <div className="panel">
        <div className="table-tools" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="search-box">🔍 <input placeholder="Search user, module, record, or details..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
            <option>All Modules</option>{modules.map(m => <option key={m}>{m}</option>)}
          </select>
          <select value={action} onChange={e => setAction(e.target.value)}>
            <option>All Actions</option>{actions.map(a => <option key={a}>{a}</option>)}
          </select>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option>All Roles</option>{roles.map(r => <option key={r}>{r}</option>)}
          </select>
          <label>From <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
          <label>To <input type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
        {loading && <p style={{ padding: 20 }}>Loading activity logs from Django...</p>}
        {error && <p role="alert" style={{ padding: 20, color: "#b91c1c" }}>{error}</p>}
        {!loading && !error && <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>DATE &amp; TIME</th><th>USER</th><th>ROLE</th><th>MODULE</th><th>ACTION</th><th>AFFECTED RECORD</th><th>DETAILS</th></tr></thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan="7" className="empty-row">No recorded activity matches your filters.</td></tr>
                : visible.map(l => <tr key={l.id}>
                    <td>{formatAuditTimestamp(l.created_at)}</td>
                    <td><strong>{l.actor_username || "—"}</strong></td>
                    <td>{l.actor_role || "—"}</td>
                    <td>{auditModule(l)}</td>
                    <td><AuditActionBadge action={l.action} /></td>
                    <td>{l.target_name || "—"}</td>
                    <td style={{ maxWidth: 360, overflowWrap: "anywhere" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                        <span>{auditSummary(l)}</span>
                        <button type="button" className="secondary-btn" onClick={() => setSelectedLog(l)} style={{ padding: "5px 10px", fontSize: 12 }}>View Details</button>
                      </div>
                    </td>
                  </tr>)}
            </tbody>
          </table>
        </div>}
      </div>
      <AuditDetailsDialog log={selectedLog} onClose={() => setSelectedLog(null)} />
    </>
  );
}

/* ================================================================
   FISHERFOLK SUGGESTED PRICE MONITORING
   ================================================================ */

function FisherfolkSuggestions({ suggestions, setSuggestions, notify, addLog }) {
  const [speciesFilter, setSpeciesFilter] = useState("All Species");
  const [from, setFrom] = useState("2026-09-01");
  const [to, setTo] = useState("2026-09-16");
  const [search, setSearch] = useState("");

  const stats = suggestionStats(suggestions, speciesFilter, from, to);

  const visible = suggestions
    .filter((s) => speciesFilter === "All Species" || s.species === speciesFilter)
    .filter((s) => s.date >= from && s.date <= to)
    .filter((s) =>
      [s.species, s.submittedBy, s.market].join(" ").toLowerCase().includes(search.toLowerCase())
    );

  const setStatus = (s, status) => {
    setSuggestions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status } : x)));
    addLog(`Marked suggestion as ${status}: ${s.species} by ${s.submittedBy}`, "Fisherfolk Suggestions");
    notify(`Suggestion marked as ${status}.`);
  };

  const statusClass = (s) => {
    if (s === "Adopted") return "success";
    if (s === "Rejected") return "deleted";
    if (s === "Reviewed") return "approved";
    return "pending";
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Fisherfolk Suggested Price Monitoring</h2>
          <p>Review prices suggested by fisherfolk and compare them against official rates.</p>
        </div>
      </div>

      <div className="page-title" style={{ marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 15 }}>Price Suggestion Statistics</h2>
          <p>Filtered by species and date range below</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">📥</div>
          <div>
            <span>Number of Submissions</span>
            <h2>{stats.count}</h2>
            <small>In selected range</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">₱</div>
          <div>
            <span>Average Suggested Price</span>
            <h2>{stats.avg !== null ? peso(stats.avg) : "—"}</h2>
            <small>Per kilogram</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">↓</div>
          <div>
            <span>Minimum Suggested</span>
            <h2>{stats.min !== null ? peso(stats.min) : "—"}</h2>
            <small>Lowest submitted</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">↑</div>
          <div>
            <span>Maximum Suggested</span>
            <h2>{stats.max !== null ? peso(stats.max) : "—"}</h2>
            <small>{stats.participants} participating fisherfolk</small>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="table-tools">
          <div className="search-box">
            🔍
            <input
              type="text"
              placeholder="Search species or submitter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)}>
            <option>All Species</option>
            {SPECIES_LIST.map((s) => <option key={s}>{s}</option>)}
          </select>

          <input className="date-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="date-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <table>
          <thead>
            <tr>
              <th>SUBMISSION DATE</th>
              <th>SPECIES</th>
              <th>SUGGESTED PRICE</th>
              <th>SUBMITTED BY</th>
              <th>MARKET</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-row">No submissions match these filters.</td>
              </tr>
            ) : (
              visible.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.date)}</td>
                  <td><strong>{s.species}</strong></td>
                  <td><strong>{peso(s.suggestedPrice)}</strong></td>
                  <td>{s.submittedBy}</td>
                  <td>{s.market}</td>
                  <td><span className={`badge ${statusClass(s.status)}`}>{s.status}</span></td>
                  <td>
                    <div className="action-icons">
                      <button title="Mark Reviewed" onClick={() => setStatus(s, "Reviewed")}>👁</button>
                      <button title="Adopt" onClick={() => setStatus(s, "Adopted")}>✔</button>
                      <button title="Reject" onClick={() => setStatus(s, "Rejected")}>✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   PREDICTIVE ANALYTICS MONITORING
   ================================================================ */

function PredictiveAnalytics({ species, markets, priceRecords, forecasts, setForecasts, notify, addLog }) {
  const activeSpecies = species.filter((s) => s.status === "Active");
  const activeMarkets = markets.filter((m) => m.status === "Active");

  const [speciesName, setSpeciesName] = useState(activeSpecies[0]?.name || "");
  const [market, setMarket] = useState("All Markets");
  const [period, setPeriod] = useState("14");
  const [generating, setGenerating] = useState(false);
  const [selectedForecastId, setSelectedForecastId] = useState(null);

  const preview = buildForecastSeries(priceRecords, speciesName, market, Number(period));

  const generate = () => {
    if (!preview.sufficientData) {
      notify(`Not enough historical data for ${speciesName} yet — need at least ${MIN_RECORDS_FOR_FORECAST} price records.`);
      return;
    }

    setGenerating(true);
    setTimeout(() => {
      const entry = {
        id: Date.now(),
        species: speciesName,
        market,
        period: Number(period),
        generatedDate: new Date().toLocaleString("en-PH", {
          month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
        ...preview,
      };
      setForecasts((prev) => [entry, ...prev]);
      setSelectedForecastId(entry.id);
      setGenerating(false);
      addLog(`Generated forecast: ${speciesName} · ${period}-day horizon`, "Predictive Analytics");
      notify("Forecast generated.");
    }, 600);
  };

  const rerun = (f) => {
    const fresh = buildForecastSeries(priceRecords, f.species, f.market, f.period);
    setForecasts((prev) =>
      prev.map((x) =>
        x.id === f.id
          ? {
              ...x,
              ...fresh,
              generatedDate: new Date().toLocaleString("en-PH", {
                month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
              }),
            }
          : x
      )
    );
    addLog(`Re-ran forecast: ${f.species} · ${f.period}-day horizon`, "Predictive Analytics");
    notify("Forecast re-run with latest data.");
  };

  const selected = forecasts.find((f) => f.id === selectedForecastId) || forecasts[0] || null;
  const barsFor = (series, cls) =>
    series.map((p, i) => {
      const max = Math.max(...series.map((s) => s.price), 1);
      const h = 25 + (p.price / max) * 65;
      return <div key={i} className={`bar ${cls}`} style={{ height: `${h}%` }} title={`${fmtDate(p.date)} — ${peso(p.price)}`}></div>;
    });

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Predictive Analytics Monitoring</h2>
          <p>Generate and review SARIMAX-based price forecasts across species and markets.</p>
        </div>
      </div>

      <div className="config-grid">

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">📈</div>
            <div>
              <h3>Generate a Forecast</h3>
              <p>Select the parameters, then generate</p>
            </div>
          </div>

          <div className="form-group">
            <label>Fish Species</label>
            <select value={speciesName} onChange={(e) => setSpeciesName(e.target.value)}>
              {activeSpecies.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Municipality / Market</label>
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option>All Markets</option>
              {activeMarkets.map((m) => <option key={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Forecast Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="30">30 Days</option>
            </select>
          </div>

          {!preview.sufficientData ? (
            <div className="warn-box">
              ⚠ Only {preview.historical.length} recent records found for {speciesName}. At least{" "}
              {MIN_RECORDS_FOR_FORECAST} historical price records are needed before a reliable
              forecast can be generated.
            </div>
          ) : (
            <div className="info-box">
              Sufficient historical data found ({preview.historical.length} recent records) — ready to forecast.
            </div>
          )}

          <button className="primary-btn full-btn" onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "Generate Forecast"}
          </button>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon purple">👁</div>
            <div>
              <h3>{selected ? `${selected.species} — Forecast Graph` : "No Forecast Selected"}</h3>
              <p>{selected ? `${selected.market} · ${selected.period}-day horizon · generated ${selected.generatedDate}` : "Generate a forecast to see it here"}</p>
            </div>
          </div>

          {selected ? (
            <>
              <div className="chart-placeholder">
                <div className="bars">
                  {barsFor(selected.historical, "bar")}
                  {barsFor(selected.predicted, "bar forecast-bar")}
                </div>
                <p className="chart-note">Blue bars are historical prices, orange bars are the forecast.</p>
              </div>

              <div className="profile-grid" style={{ marginTop: 14 }}>
                <div className="profile-field">
                  <span>Last Historical Price</span>
                  <strong>{peso(selected.lastActual)}</strong>
                </div>
                <div className="profile-field">
                  <span>Predicted End Price</span>
                  <strong>{peso(selected.predicted[selected.predicted.length - 1]?.price)}</strong>
                </div>
              </div>

              <button className="secondary-btn full-btn" style={{ marginTop: 14 }} onClick={() => rerun(selected)}>
                ↻ Re-run This Forecast
              </button>
            </>
          ) : (
            <p className="empty-row">Nothing generated yet.</p>
          )}
        </div>

      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <div>
            <h3>Forecast History</h3>
            <p>All previously generated forecasts</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>SPECIES</th>
              <th>MARKET</th>
              <th>PERIOD</th>
              <th>PREDICTED END PRICE</th>
              <th>GENERATED ON</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-row">No forecasts generated yet.</td>
              </tr>
            ) : (
              forecasts.map((f) => (
                <tr key={f.id}>
                  <td><strong>{f.species}</strong></td>
                  <td>{f.market}</td>
                  <td>{f.period} days</td>
                  <td>{peso(f.predicted[f.predicted.length - 1]?.price)}</td>
                  <td>{f.generatedDate}</td>
                  <td>
                    <div className="action-icons">
                      <button title="View" onClick={() => setSelectedForecastId(f.id)}>👁</button>
                      <button title="Re-run" onClick={() => rerun(f)}>↻</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   DATA MONITORING
   ================================================================ */

function DataMonitoring({ species, markets, priceRecords, goTo }) {
  const activeSpecies = species.filter((s) => s.status === "Active");
  const activeMarkets = markets.filter((m) => m.status === "Active");
  const [speciesName, setSpeciesName] = useState(activeSpecies[0]?.name || "");

  const activeRecords = priceRecords.filter((r) => r.status !== "Deleted");
  const today = activeRecords.length ? activeRecords[0].date : null;

  const expectedToday = activeSpecies.length * activeMarkets.length;
  const presentToday = today
    ? activeSpecies.reduce((sum, sp) => {
        return sum + activeMarkets.filter((mk) =>
          priceRecords.some((r) => r.species === sp.name && r.market === mk.name && r.date === today && r.status !== "Deleted")
        ).length;
      }, 0)
    : 0;
  const completeness = expectedToday ? Math.round((presentToday / expectedToday) * 100) : 0;

  const speciesHistory = priceRecords
    .filter((r) => r.species === speciesName && r.status !== "Deleted")
    .slice(0, 12);

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Data Monitoring</h2>
          <p>Track overall data health and review species-level price history.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card clickable" onClick={() => goTo("Price Records")}>
          <div className="stat-icon blue">▤</div>
          <div>
            <span>Total Price Records</span>
            <h2>{priceRecords.length}</h2>
            <small>{activeRecords.length} active</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✔</div>
          <div>
            <span>Today's Completeness</span>
            <h2>{completeness}%</h2>
            <small>{presentToday} of {expectedToday} expected entries</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">⚠</div>
          <div>
            <span>Corrected Records</span>
            <h2>{priceRecords.filter((r) => r.status === "Corrected").length}</h2>
            <small>Audit-flagged corrections</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">✕</div>
          <div>
            <span>Deleted Records</span>
            <h2>{priceRecords.filter((r) => r.status === "Deleted").length}</h2>
            <small>Removed but retained for audit</small>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Species Price History</h3>
            <p>Most recent 12 records for the selected species</p>
          </div>
          <select value={speciesName} onChange={(e) => setSpeciesName(e.target.value)}>
            {activeSpecies.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>MARKET</th>
              <th>PRICE / KG</th>
              <th>ENTERED BY</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {speciesHistory.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-row">No records for this species yet.</td>
              </tr>
            ) : (
              speciesHistory.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.market}</td>
                  <td><strong>{peso(r.price)}</strong></td>
                  <td>{r.enteredBy}</td>
                  <td><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   NOTIFICATIONS
   ================================================================ */

function Notifications({ notifications, dismissedNotifs, setDismissedNotifs, goTo }) {
  const dismiss = (id) => setDismissedNotifs((prev) => [...prev, id]);
  const restore = () => setDismissedNotifs([]);

  const iconFor = (type) => (type === "danger" ? "⚠" : type === "warning" ? "⏳" : "ℹ");
  const bgFor = (type) => (type === "danger" ? "purple-bg" : type === "warning" ? "blue-bg" : "green-bg");

  const visible = notifications.filter((n) => !dismissedNotifs.includes(n.id));

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Notifications</h2>
          <p>System alerts that need administrator attention.</p>
        </div>
        {dismissedNotifs.length > 0 && (
          <button className="secondary-btn" onClick={restore}>Restore Dismissed</button>
        )}
      </div>

      <div className="panel">
        {visible.length === 0 ? (
          <p className="empty-row">You're all caught up — no active notifications.</p>
        ) : (
          visible.map((n) => (
            <div className="activity" key={n.id}>
              <div className={`activity-icon ${bgFor(n.type)}`}>{iconFor(n.type)}</div>
              <div style={{ flex: 1 }}>
                <strong>{n.title}</strong>
                <p>{n.detail}</p>
              </div>
              <div className="action-icons" style={{ alignSelf: "center" }}>
                <button title="View" onClick={() => goTo(n.page)}>👁</button>
                <button title="Dismiss" onClick={() => dismiss(n.id)}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ================================================================
   REPORTS MANAGEMENT
   ================================================================ */

function ReportsManagement({ users, species, logs, priceRecords, notify }) {
  const [reportType, setReportType] = useState("User Report");

  const rowsFor = () => {
    if (reportType === "User Report") return users;
    if (reportType === "Fish Species Report") return species;
    if (reportType === "System Activity Report") return logs;
    return priceRecords.filter((r) => r.status !== "Deleted");
  };

  const columnsFor = () => {
    if (reportType === "User Report") return ["Name", "Username", "Role", "Municipality", "Status"];
    if (reportType === "Fish Species Report") return ["Name", "Scientific Name", "Status", "Date Added"];
    if (reportType === "System Activity Report") return ["User", "Role", "Module", "Action", "Date"];
    return ["Date", "Species", "Market", "Price", "Entered By", "Status"];
  };

  const cellsFor = (row) => {
    if (reportType === "User Report") return [row.name, row.username, row.role, row.municipality, row.status];
    if (reportType === "Fish Species Report") return [row.name, row.scientific, row.status, row.dateAdded];
    if (reportType === "System Activity Report") return [row.user, row.role, row.module, row.action, row.date];
    return [fmtDate(row.date), row.species, row.market, peso(row.price), row.enteredBy, row.status];
  };

  const exportCSV = () => {
    const rows = rowsFor();
    const header = columnsFor().join(",") + "\n";
    const body = rows.map((r) => cellsFor(r).map((c) => `"${c}"`).join(",")).join("\n");

    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType.toLowerCase().replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    notify(`${reportType} exported as CSV.`);
  };

  const exportPDF = () => {
    notify("Opening print dialog — choose 'Save as PDF'.");
    setTimeout(() => window.print(), 400);
  };

  const rows = rowsFor();
  const columns = columnsFor();

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Reports Management</h2>
          <p>Generate reports across users, species, system activity, and price data.</p>
        </div>
        <div className="filter-row">
          <button className="secondary-btn" onClick={exportCSV}>↓ Export CSV</button>
          <button className="primary-btn" onClick={exportPDF}>↓ Export PDF</button>
        </div>
      </div>

      <div className="panel">
        <div className="tabs">
          {["User Report", "Fish Species Report", "System Activity Report", "Price Data Report"].map((t) => (
            <button key={t} className={reportType === t ? "tab active-tab" : "tab"} onClick={() => setReportType(t)}>
              {t}
            </button>
          ))}
        </div>

        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c.toUpperCase()}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty-row">No data available for this report.</td>
              </tr>
            ) : (
              rows.slice(0, 50).map((r, i) => (
                <tr key={r.id || i}>
                  {cellsFor(r).map((c, ci) => (
                    <td key={ci}>{ci === 0 ? <strong>{c}</strong> : c}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {rows.length > 50 && (
          <p className="empty-row">Showing the first 50 of {rows.length} rows — export for the full report.</p>
        )}
      </div>
    </>
  );
}

/* ================================================================
   SYSTEM ANNOUNCEMENTS
   ================================================================ */

function SystemAnnouncements({ announcements, setAnnouncements, notify, addLog }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", message: "" });

  const openAdd = () => {
    setEditing(null);
    setForm({ title: "", message: "" });
    setShowForm(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({ title: a.title, message: a.message });
    setShowForm(true);
  };

  const save = () => {
    if (!form.title.trim() || !form.message.trim()) {
      notify("Title and message are required.");
      return;
    }

    if (editing) {
      setAnnouncements((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...form } : x)));
      addLog(`Updated announcement: ${form.title}`, "System Announcements");
      notify("Announcement updated.");
    } else {
      setAnnouncements((prev) => [
        { ...form, id: Date.now(), date: new Date().toLocaleDateString("en-PH"), status: "Active" },
        ...prev,
      ]);
      addLog(`Posted announcement: ${form.title}`, "System Announcements");
      notify("Announcement posted.");
    }

    setShowForm(false);
  };

  const toggleStatus = (a) => {
    const next = a.status === "Active" ? "Expired" : "Active";
    setAnnouncements((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    addLog(`Marked announcement as ${next}: ${a.title}`, "System Announcements");
    notify(`Announcement marked as ${next.toLowerCase()}.`);
  };

  const remove = (a) => {
    if (!window.confirm(`Delete the announcement "${a.title}"?`)) return;
    setAnnouncements((prev) => prev.filter((x) => x.id !== a.id));
    addLog(`Deleted announcement: ${a.title}`, "System Announcements");
    notify("Announcement deleted.");
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>System Announcements</h2>
          <p>Post updates and notices visible to LGU Officers and Fish Vendors.</p>
        </div>
        <button className="primary-btn" onClick={openAdd}>+ New Announcement</button>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing ? "Edit Announcement" : "New Announcement"}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Message</label>
              <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primary-btn" onClick={save}>{editing ? "Save Changes" : "Post Announcement"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>TITLE</th>
              <th>MESSAGE</th>
              <th>DATE</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {announcements.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-row">No announcements yet.</td>
              </tr>
            ) : (
              announcements.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.title}</strong></td>
                  <td>{a.message}</td>
                  <td>{a.date}</td>
                  <td><span className={`badge ${a.status === "Active" ? "success" : "inactive"}`}>{a.status}</span></td>
                  <td>
                    <div className="action-icons">
                      <button title="Edit" onClick={() => openEdit(a)}>✎</button>
                      <button title={a.status === "Active" ? "Mark Expired" : "Reactivate"} onClick={() => toggleStatus(a)}>◉</button>
                      <button title="Delete" onClick={() => remove(a)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   ADMIN PROFILE
   ================================================================ */

function AdminProfilePage({ profile, setProfile, notify, addLog }) {
  const [draft, setDraft] = useState(profile);

  const update = (key, value) => setDraft({ ...draft, [key]: value });

  const save = () => {
    if (!draft.name.trim() || !draft.email.trim()) {
      notify("Name and email are required.");
      return;
    }
    setProfile(draft);
    addLog("Updated own profile details", "Admin Profile");
    notify("Profile saved.");
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Admin Profile</h2>
          <p>Your own account details.</p>
        </div>
        <button className="primary-btn" onClick={save}>Save Changes</button>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">👤</div>
            <div>
              <h3>Profile Information</h3>
              <p>Editable account details</p>
            </div>
          </div>

          <div className="form-group">
            <label>Full Name</label>
            <input value={draft.name} onChange={(e) => update("name", e.target.value)} />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input value={draft.email} onChange={(e) => update("email", e.target.value)} />
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon purple">🔒</div>
            <div>
              <h3>Account Details</h3>
              <p>Read-only system information</p>
            </div>
          </div>

          <div className="profile-grid">
            <div className="profile-field">
              <span>Username</span>
              <strong>{draft.username}</strong>
            </div>
            <div className="profile-field">
              <span>Role</span>
              <strong>{draft.role}</strong>
            </div>
            <div className="profile-field" style={{ gridColumn: "1 / -1" }}>
              <span>Last Login</span>
              <strong>{draft.lastLogin}</strong>
            </div>
          </div>

          <div className="info-box" style={{ marginTop: 14 }}>
            Username and role can only be changed by another administrator, from
            User Management.
          </div>
        </div>
      </div>
    </>
  );
}

export default Admin;