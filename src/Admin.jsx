import React, { useState, useEffect, lazy, Suspense } from "react";
import "./App.css";
import "./Admin.css";
import { API_BASE_URL, apiUrl, authHeaders, fetchAll } from "./api/config.js";
import { fullName as profileName, useMyProfile } from "./api/account.js";
import { listVendorSuggestions, reviewVendorSuggestion } from "./api/vendorSuggestions.js";
import { getForecastHistory } from "./api/forecast.js";
import AccountProfile from "./components/AccountProfile.jsx";
import ExternalFactorsPage from "./components/ExternalFactorsPage.jsx";

// Loaded only when the forecast page opens (the chart library is large).
const ForecastView = lazy(() => import("./components/ForecastView.jsx"));


// Read-only audit records supplied by Django. This endpoint enforces role visibility.
// reloadSignal: any value; the logs reload whenever it changes.
function useDjangoActivityLogs(reloadSignal) {
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
        let next = `${API_BASE_URL}/activity-logs/`;
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
  }, [refreshKey, reloadSignal]);
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
  if (type.includes("authentication")) return "Authentication";
  if (type.includes("suggestion")) return "Fisherfolk Suggestions";
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
   CONSTANTS & DATA ADAPTERS
   ================================================================ */

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

const PRICE_STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending Review",
  approved: "Approved",
  published: "Published",
  flagged: "Flagged",
  rejected: "Rejected",
};

// Django PriceRecord → row shape used by the dashboard tables.
const toPriceRow = (r) => ({
  id: r.id,
  date: r.recorded_date,
  species: r.fish_name,
  municipality: r.municipality_name,
  market: r.municipality_name,
  price: Number(r.price_per_kg),
  previousPrice: r.previous_price === null || r.previous_price === undefined ? null : Number(r.previous_price),
  enteredBy: r.recorded_by_name || "—",
  status: PRICE_STATUS_LABELS[r.status] || r.status,
  isCorrection: Boolean(r.is_correction),
  corrections: r.corrections || [],
});

// Django user (from /auth/users/) → row shape used by the dashboard tables.
const toUserRow = (account) => ({
  id: account.id,
  name: `${account.first_name || ""} ${account.last_name || ""}`.trim() || account.username,
  username: account.username,
  email: account.email,
  role: account.role,
  municipality: account.municipality || "",
  status:
    account.account_status === "rejected"
      ? "Rejected"
      : account.account_status === "pending"
      ? "Pending"
      : account.is_active
      ? "Active"
      : "Inactive",
  lastLogin: account.last_login,
});

// Django activity log → row shape used by reports.
const toLogRow = (log) => ({
  id: log.id,
  date: formatAuditTimestamp(log.created_at),
  user: log.actor_username,
  role: log.actor_role,
  module: auditModule(log),
  action: `${auditLabel(log.action)} ${log.target_name || ""}`.trim(),
});

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
  [...new Set(active.map((r) => r.species))].forEach((sp) => {
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

function buildNotifications(users, priceRecords, species, municipalities, suggestions) {
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

  const flagged = priceRecords.filter((r) => r.status === "Flagged");
  if (flagged.length > 0) {
    notifs.push({
      id: nid++, type: "info", page: "Price Records",
      title: `${flagged.length} flagged price record${flagged.length > 1 ? "s" : ""}`,
      detail: flagged.slice(0, 3).map((r) => `${r.species} · ${r.municipality}`).join(", "),
    });
  }

  const pendingSuggestions = suggestions.filter((s) => s.status === "Pending Review");
  if (pendingSuggestions.length > 0) {
    notifs.push({
      id: nid++, type: "info", page: "Fisherfolk Suggestions",
      title: `${pendingSuggestions.length} vendor suggestion${pendingSuggestions.length > 1 ? "s" : ""} awaiting review`,
      detail: pendingSuggestions.slice(0, 3).map((s) => s.species).join(", "),
    });
  }

  // Active species × municipality pairs with no price recorded today.
  const today = new Date().toLocaleDateString("en-CA");
  let missingCount = 0;
  species.filter((s) => s.status === "Active").forEach((sp) => {
    municipalities.filter((m) => m.status === "Active").forEach((mk) => {
      if (!priceRecords.some((r) => r.species === sp.name && r.municipality === mk.name && r.date === today)) missingCount++;
    });
  });
  if (missingCount > 0) {
    notifs.push({
      id: nid++, type: "danger", page: "Price Records",
      title: `${missingCount} missing price record${missingCount > 1 ? "s" : ""} for today`,
      detail: "No entry logged by any LGU officer yet.",
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
          `${API_BASE_URL}/auth/users/pending/`,
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
        `${API_BASE_URL}/auth/users/`,
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

  /* ---------- SHARED STATE (loaded from Django) ---------- */

  const account = useMyProfile();
  const adminName = (account.profile && profileName(account.profile)) || "Administrator";
  const adminInitials = adminName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  const users = databaseUsers.map(toUserRow);

  const [species, setSpecies] = useState([]);
  const [apiPriceRecords, setApiPriceRecords] = useState([]);
  const [priceRecordsError, setPriceRecordsError] = useState("");
  const [apiMunicipalities, setApiMunicipalities] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reloadData = () => setReloadKey((k) => k + 1);

  // Reload shared data whenever the admin switches pages so counts stay current.
  useEffect(() => {
    let cancelled = false;
    fetchAll("/fish-species/")
      .then((rows) => { if (!cancelled) setSpecies(rows.map(mapDatabaseSpecies)); })
      .catch((error) => console.error("Fish species loading error:", error));
    fetchAll("/prices/")
      .then((rows) => { if (!cancelled) { setApiPriceRecords(rows); setPriceRecordsError(""); } })
      .catch((error) => { if (!cancelled) setPriceRecordsError(error.message); });
    fetchAll("/municipalities/")
      .then((rows) => { if (!cancelled) setApiMunicipalities(rows); })
      .catch((error) => console.error("Municipalities loading error:", error));
    listVendorSuggestions()
      .then((rows) => { if (!cancelled) { setSuggestions(rows.map((row) => ({ ...row, market: row.municipality }))); setSuggestionsError(""); } })
      .catch((error) => { if (!cancelled) setSuggestionsError(error.message); });
    return () => { cancelled = true; };
  }, [activePage, reloadKey]);

  const priceRecords = apiPriceRecords.map(toPriceRow);
  const publishedRecords = priceRecords.filter((r) => r.status === "Published");

  const municipalities = apiMunicipalities.map((m) => ({
    id: m.id,
    name: m.name,
    province: m.province,
    status: m.is_active ? "Active" : "Inactive",
  }));

  // Markets come from the market names fish vendors gave when registering.
  const markets = [
    ...new Map(
      databaseUsers
        .filter((u) => u.verification?.details?.market_name)
        .map((u) => {
          const name = u.verification.details.market_name.trim();
          const key = `${name}|${u.municipality}`;
          return [key, { id: key, name, municipality: u.municipality || "—", status: "Active" }];
        })
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const { records: activityLogs } = useDjangoActivityLogs(`${activePage}-${reloadKey}`);
  const logs = activityLogs.map(toLogRow);

  const [dismissedNotifs, setDismissedNotifs] = useState([]);

  /* ---------- HELPERS ---------- */

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
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
        { name: "External Factors", icon: "☁" },
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

  const notifications = buildNotifications(users, priceRecords, species, municipalities, suggestions);
  const unreadNotifs = notifications.filter((n) => !dismissedNotifs.includes(n.id));

  const renderPage = () => {
    switch (activePage) {
      case "User Management":
        return (
          <UserManagement
            notify={notify}
            municipalities={municipalities.filter((m) => m.status === "Active")}
            loading={usersLoading || databaseUsersLoading}
            loadError={usersError || databaseUsersError}
            activityLogs={activityLogs}
            pendingRegistrations={pendingRegistrations}
            setPendingRegistrations={setPendingRegistrations}
            databaseUsers={databaseUsers}
            setDatabaseUsers={setDatabaseUsers}
          />
        );
      case "Fish Species":
        return (
          <FishSpecies
            species={species} setSpecies={setSpecies}
            priceRecords={priceRecords}
            notify={notify}
          />
        );
      case "Municipality & Market":
        return (
          <MunicipalityMarket
            municipalities={municipalities} markets={markets}
            onChanged={reloadData} notify={notify}
          />
        );
      case "Price Records":
        return (
          <PriceRecords
            priceRecords={priceRecords} error={priceRecordsError}
            species={species} municipalities={municipalities}
            onChanged={reloadData} notify={notify}
          />
        );
      case "System Configuration":
        return <SystemConfiguration notify={notify} />;
      case "Fisherfolk Suggestions":
        return (
          <FisherfolkSuggestions
            suggestions={suggestions} error={suggestionsError}
            onChanged={reloadData} notify={notify}
          />
        );
      case "Predictive Analytics":
        return (
          <PredictiveAnalytics
            species={species} municipalities={municipalities}
            defaultMunicipalityId={account.profile?.municipality_id}
            notify={notify}
          />
        );
      case "External Factors":
        return <ExternalFactorsPage notify={notify} />;
      case "Data Monitoring":
        return (
          <DataMonitoring
            species={species} municipalities={municipalities} priceRecords={priceRecords}
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
        return <ActivityLogs notify={notify} />;
      case "System Announcements":
        return <SystemAnnouncements />;
      case "Admin Profile":
        return <AccountProfile account={account} notify={notify} description="Your administrator account details and recent activity." />;
      default:
        return (
          <Dashboard
            users={users}
            species={species}
            publishedRecords={publishedRecords}
            municipalities={municipalities}
            logs={logs}
            goTo={setActivePage}
            adminName={adminName}
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
            <div className="avatar">{adminInitials}</div>
            <div>
              <strong>{adminName}</strong>
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
              <div className="avatar small">{adminInitials}</div>
              <div>
                <strong>{adminName}</strong>
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
  publishedRecords,
  municipalities,
  logs,
  goTo,
  adminName,
  pendingRegistrations,
  databaseUsers,
  usersLoading,
  usersError,
}) {
  const pending = users.filter((u) => u.status === "Pending");
  const activeUsers = users.filter((u) => u.status === "Active");
  const activeSpecies = species.filter((s) => s.status === "Active");
  const activeMunicipalities = municipalities.filter((m) => m.status === "Active");

  // Highest published prices for today, the last 7 days and the last 30 days.
  const today = new Date().toLocaleDateString("en-CA");
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString("en-CA");
  };
  const highestOf = (rows) => (rows.length ? rows.reduce((a, b) => (b.price > a.price ? b : a)) : null);
  const highestToday = highestOf(publishedRecords.filter((r) => r.date === today));
  const highestWeek = highestOf(publishedRecords.filter((r) => r.date >= daysAgo(7)));
  const highestMonth = highestOf(publishedRecords.filter((r) => r.date >= daysAgo(30)));

  // Most recently active accounts first.
  const recentLogins = users
    .filter((u) => u.lastLogin)
    .sort((a, b) => (a.lastLogin < b.lastLogin ? 1 : -1))
    .slice(0, 5);

  const speciesWithPrices = new Set(publishedRecords.map((r) => r.species)).size;

  const recommendations = generateRecommendations(publishedRecords);

  return (
    <>
      <div className="welcome-card">
        <div>
          <span className="eyebrow">SYSTEM ADMINISTRATOR</span>
          <h2>Welcome back, {adminName}</h2>
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
            <span>Active Accounts</span>
            <h2>{activeUsers.length}</h2>
            <small>Approved and able to log in</small>
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
            <small>{highestToday ? `${highestToday.species} · ${highestToday.municipality}` : "No published prices today"}</small>
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
            <span>Active Municipalities</span>
            <h2>{activeMunicipalities.length}</h2>
            <small>of {municipalities.length} registered</small>
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
              <p>Most recent logins across all users</p>
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
                <th>LAST LOGIN</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {recentLogins.length === 0 ? (
                <tr><td colSpan="4" className="empty-row">No logins recorded yet.</td></tr>
              ) : recentLogins.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.role}</td>
                  <td>{formatAuditTimestamp(u.lastLogin)}</td>
                  <td>
                    <span className={`badge ${u.status === "Active" ? "success" : "inactive"}`}>
                      {u.status}
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
              <p>Latest activity recorded across the system</p>
            </div>
          </div>

          {logs.length === 0 && <p className="empty-row">No activity recorded yet.</p>}
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

/* ---------------- USER ACCOUNT FORMS ---------------- */

const ACCOUNT_ROLES = ["Fish Vendor", "LGU Officer", "Administrator"];

// Send JSON to the API; throws an Error with the server's message(s).
async function sendJson(path, method, body) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.message || data?.detail ||
      (data && typeof data === "object" ? Object.values(data).flat().map(String).join(" ") : "") ||
      `Request failed (HTTP ${response.status}).`
    );
    error.fields = data && typeof data === "object" && !data.message ? data : {};
    throw error;
  }
  return data;
}

// Add or edit an account (UC-7). `account` is null when adding.
function UserFormModal({ account, municipalities, onClose, onSaved, notify }) {
  const editing = Boolean(account);
  const [form, setForm] = useState(() => ({
    first_name: account?.firstName || "",
    last_name: account?.lastName || "",
    username: account?.username || "",
    email: account?.email || "",
    contact_number: account?.contact || "",
    role: account?.role || "LGU Officer",
    municipality: account?.municipalityId ? String(account.municipalityId) : String(municipalities[0]?.id ?? ""),
    password: "",
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (editing && form.role !== account.role && !window.confirm(
      `Change ${account.name}'s role from ${account.role} to ${form.role}? They will be logged out and get ${form.role} access at their next login.`
    )) return;

    const body = {
      first_name: form.first_name,
      last_name: form.last_name,
      username: form.username,
      email: form.email,
      contact_number: form.contact_number,
      role: form.role,
      municipality: form.role === "Administrator" && !form.municipality ? null : form.municipality || null,
    };
    if (!editing) body.password = form.password;

    setSaving(true);
    setErrors({});
    try {
      const row = editing
        ? await sendJson(`/auth/users/${account.id}/`, "PATCH", body)
        : await sendJson("/auth/users/", "POST", body);
      notify(editing ? `${row.username} updated.` : `${row.username} created.`);
      onSaved(row);
    } catch (error) {
      setErrors(error.fields || {});
      if (!error.fields || !Object.keys(error.fields).length) notify(error.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div className="form-group">
      <label htmlFor={`user-${key}`}>{label}</label>
      <input id={`user-${key}`} value={form[key]} onChange={(e) => update(key, e.target.value)} {...props} />
      {errors[key] && <small className="field-error">{errors[key]}</small>}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="user-form-title">
        <div className="modal-head">
          <h3 id="user-form-title">{editing ? `Edit ${account.name}` : "Add New User"}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="form-row">
          {field("first_name", "First Name")}
          {field("last_name", "Last Name")}
        </div>
        <div className="form-row">
          {field("username", "Username", { autoComplete: "off" })}
          {field("contact_number", "Contact Number")}
        </div>
        {field("email", "Email Address", { type: "email" })}

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="user-role">Role</label>
            <select id="user-role" value={form.role} onChange={(e) => update("role", e.target.value)}>
              {ACCOUNT_ROLES.map((role) => <option key={role}>{role}</option>)}
            </select>
            {errors.role && <small className="field-error">{errors.role}</small>}
          </div>
          <div className="form-group">
            <label htmlFor="user-municipality">Municipality</label>
            <select id="user-municipality" value={form.municipality} onChange={(e) => update("municipality", e.target.value)}>
              {form.role === "Administrator" && <option value="">None</option>}
              {municipalities.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
            </select>
            {errors.municipality && <small className="field-error">{errors.municipality}</small>}
          </div>
        </div>

        {!editing && field("password", "Initial Password", { type: "password", autoComplete: "new-password", placeholder: "At least 8 characters" })}
        {!editing && <p className="muted-text" style={{ marginTop: -6, marginBottom: 12 }}>The account is active right away. Ask the user to change this password from My Profile.</p>}

        <div className="button-row">
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Account"}</button>
        </div>
      </div>
    </div>
  );
}

// Shows a temporary password once, after an Administrator resets it.
function TemporaryPasswordModal({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="temp-password-title">
        <div className="modal-head">
          <h3 id="temp-password-title">Temporary Password for {result.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="muted-text">Give this password to {result.name} privately. It is shown only once. They have been logged out and should change it from My Profile after logging in.</p>
        <div className="temp-password">
          <code>{result.password}</code>
          <button className="secondary-btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="button-row">
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   USER MANAGEMENT
   ================================================================ */

function UserManagement({
  notify,
  municipalities,
  loading,
  loadError,
  activityLogs,
  pendingRegistrations,
  setPendingRegistrations,
  databaseUsers,
  setDatabaseUsers,
}) {
  const [tab, setTab] = useState("Pending");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [viewing, setViewing] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [reviewingUser, setReviewingUser] = useState(null);
  const [reviewAction, setReviewAction] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [formAccount, setFormAccount] = useState(undefined); // undefined: closed, null: add, object: edit
  const [tempPassword, setTempPassword] = useState(null);
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
      `${API_BASE_URL}/auth/users/${userId}/verification/${documentType}/`,
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

  // Convert Django pending registrations into the format
  // expected by the existing User Management table.
  const databasePendingUsers = pendingRegistrations.map((account) => ({
    id: account.id,
    name: `${account.first_name || ""} ${account.last_name || ""}`.trim(),
    username: account.username,
    email: account.email,
    role: account.role,
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

  // Every registered account from Django.
  const combinedUsers = databaseUsers.map((account) => ({
  id: account.id,
  name: `${account.first_name || ""} ${account.last_name || ""}`.trim(),
  username: account.username,
  email: account.email,
  role: account.role,
  firstName: account.first_name || "",
  lastName: account.last_name || "",
  municipalityId: account.municipality_id,
  municipality: account.municipality || "",
  contact: account.contact_number || "",
  status:
  account.account_status === "rejected"
    ? "Rejected"
    : account.account_status === "pending"
    ? "Pending"
    : account.is_active
    ? "Active"
    : "Inactive",
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
  const activeCount = combinedUsers.filter((u) => u.status === "Active").length;
  const rejectedCount = combinedUsers.filter((u) => u.status === "Rejected" || u.status === "Inactive").length;

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
      `${API_BASE_URL}/auth/users/${reviewingUser.id}/${reviewAction}/`,
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
  // Activity log entries made by or about this account.
  const userHistory = (u) =>
    activityLogs
      .filter((l) => l.actor_username === u.username || l.target_name === u.username)
      .map((l) => ({
        id: l.id,
        action: `${auditLabel(l.action)} ${l.target_name || ""}`.trim(),
        module: `${auditModule(l)} · by ${l.actor_username}`,
        date: formatAuditTimestamp(l.created_at),
      }));

  const initials = (name) => name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const roleClass = (role) => (role === "Fish Vendor" ? "vendor" : role === "LGU Officer" ? "lgu" : "admin");

  /* ---- account actions (UC-7) ---- */

  // Your own account is changed from Admin Profile, not here.
  let currentUserId = null;
  try { currentUserId = JSON.parse(localStorage.getItem("user") || "null")?.id ?? null; } catch { /* ignore invalid storage */ }

  // Replace an account row with the server's copy (or add it).
  const upsertAccount = (row) =>
    setDatabaseUsers((prev) => (prev.some((a) => a.id === row.id) ? prev.map((a) => (a.id === row.id ? row : a)) : [row, ...prev]));

  const toggleActive = async (u) => {
    const activate = u.status !== "Active";
    if (!activate && !window.confirm(`Deactivate ${u.name}? They will be logged out and cannot log in until reactivated.`)) return;
    try {
      upsertAccount(await sendJson(`/auth/users/${u.id}/status/`, "POST", { active: activate }));
      notify(`${u.name} ${activate ? "reactivated" : "deactivated"}.`);
    } catch (error) {
      notify(error.message);
    }
  };

  const resetPassword = async (u) => {
    if (!window.confirm(`Reset ${u.name}'s password? They will be logged out and need the new temporary password to log in.`)) return;
    try {
      const data = await sendJson(`/auth/users/${u.id}/reset-password/`, "POST");
      setTempPassword({ name: u.name, password: data.temporary_password });
    } catch (error) {
      notify(error.message);
    }
  };

  const deleteAccount = async (u) => {
    if (!window.confirm(`Permanently delete ${u.name}'s account? This cannot be undone.`)) return;
    try {
      const data = await sendJson(`/auth/users/${u.id}/`, "DELETE");
      setDatabaseUsers((prev) => prev.filter((a) => a.id !== u.id));
      setViewing(null);
      notify(data.message);
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>User Management</h2>
          <p>Manage user accounts, approvals, roles, and access.</p>
        </div>
        <button className="primary-btn" onClick={() => setFormAccount(null)}>+ Add User</button>
      </div>

      {formAccount !== undefined && (
        <UserFormModal
          account={formAccount}
          municipalities={municipalities}
          notify={notify}
          onClose={() => setFormAccount(undefined)}
          onSaved={(row) => { upsertAccount(row); setFormAccount(undefined); setViewing(null); }}
        />
      )}

      {tempPassword && <TemporaryPasswordModal result={tempPassword} onClose={() => setTempPassword(null)} />}

      {loading && <div className="info-box">Loading accounts…</div>}
      {loadError && <div className="warn-box" role="alert">{loadError}</div>}

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
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="mini-stat">
          <span>Rejected / Inactive</span>
          <strong>{rejectedCount}</strong>
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
              {viewing.status !== "Pending" && viewing.status !== "Rejected" && (
                <button className="secondary-btn" onClick={() => setFormAccount(viewing)}>✎ Edit User</button>
              )}
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
            {ACCOUNT_ROLES.map((role) => <option key={role}>{role}</option>)}
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
                    {u.status === "Pending" && u.role === "LGU Officer" && (
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
                        <button title="View Profile" aria-label={`View ${u.name}`} onClick={() => setViewing(u)}>👁</button>
                        {u.id === currentUserId ? (
                          <small className="muted-text">You</small>
                        ) : u.status !== "Rejected" && (
                          <>
                            <button title="Edit" aria-label={`Edit ${u.name}`} onClick={() => setFormAccount(u)}>✎</button>
                            <button title="Reset Password" aria-label={`Reset password for ${u.name}`} onClick={() => resetPassword(u)}>🔑</button>
                            <button
                              title={u.status === "Active" ? "Deactivate" : "Activate"}
                              aria-label={`${u.status === "Active" ? "Deactivate" : "Activate"} ${u.name}`}
                              onClick={() => toggleActive(u)}
                            >
                              {u.status === "Active" ? "⏸" : "▶"}
                            </button>
                          </>
                        )}
                        {u.id !== currentUserId && (
                          <button title="Delete" aria-label={`Delete ${u.name}`} onClick={() => deleteAccount(u)}>✕</button>
                        )}
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

function FishSpecies({ species, setSpecies, priceRecords, notify }) {
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
      ? `${API_BASE_URL}/fish-species/${editing.id}/`
      : `${API_BASE_URL}/fish-species/`;

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
      `${API_BASE_URL}/fish-species/${s.id}/`,
      "PATCH",
      { is_active: nextActive }
    );

    const updated = mapDatabaseSpecies(result);

    setSpecies((prev) =>
      prev.map((item) => item.id === s.id ? updated : item)
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
      `${API_BASE_URL}/fish-species/${s.id}/`,
      "DELETE"
    );

    setSpecies((prev) => prev.filter((item) => item.id !== s.id));

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

function MunicipalityMarket({ municipalities, markets, onChanged, notify }) {
  const [muniForm, setMuniForm] = useState({ name: "", province: "" });
  const [showMuniForm, setShowMuniForm] = useState(false);
  const [editingMuni, setEditingMuni] = useState(null);
  const [saving, setSaving] = useState(false);

  const sendMunicipality = async (url, method, body) => {
    const response = await fetch(url, {
      method,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data && typeof data === "object" ? Object.values(data).flat().map(String).join(" ") : "";
      throw new Error(message || `Request failed (HTTP ${response.status}).`);
    }
    return data;
  };

  const openAddMuni = () => {
    setEditingMuni(null);
    setMuniForm({ name: "", province: "" });
    setShowMuniForm(true);
  };

  const openEditMuni = (m) => {
    setEditingMuni(m);
    setMuniForm({ name: m.name, province: m.province || "" });
    setShowMuniForm(true);
  };

  const saveMuni = async () => {
    if (!muniForm.name.trim() || !muniForm.province.trim()) {
      notify("Municipality name and province are required.");
      return;
    }
    setSaving(true);
    try {
      const body = { name: muniForm.name.trim(), province: muniForm.province.trim() };
      if (editingMuni) {
        await sendMunicipality(apiUrl(`/municipalities/${editingMuni.id}/`), "PATCH", body);
        notify("Municipality updated.");
      } else {
        await sendMunicipality(apiUrl("/municipalities/"), "POST", { ...body, is_active: true });
        notify("Municipality added.");
      }
      setShowMuniForm(false);
      onChanged();
    } catch (error) {
      notify(error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleMuni = async (m) => {
    const activate = m.status !== "Active";
    try {
      await sendMunicipality(apiUrl(`/municipalities/${m.id}/`), "PATCH", { is_active: activate });
      notify(`${m.name} is now ${activate ? "active" : "inactive"}.`);
      onChanged();
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Municipality &amp; Market Management</h2>
          <p>Manage municipalities and see the markets that registered vendors work in.</p>
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
              <input value={muniForm.name} onChange={(e) => setMuniForm({ ...muniForm, name: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Province</label>
              <input value={muniForm.province} onChange={(e) => setMuniForm({ ...muniForm, province: e.target.value })} />
            </div>

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setShowMuniForm(false)}>Cancel</button>
              <button className="primary-btn" onClick={saveMuni} disabled={saving}>
                {saving ? "Saving…" : editingMuni ? "Save Changes" : "Add Municipality"}
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
                <th>PROVINCE</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {municipalities.length === 0 ? (
                <tr><td colSpan="4" className="empty-row">No municipalities yet.</td></tr>
              ) : municipalities.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  <td>{m.province || "—"}</td>
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
              <p>Markets named by registered fish vendors</p>
            </div>
          </div>

          <table className="inner-table">
            <thead>
              <tr>
                <th>MARKET</th>
                <th>MUNICIPALITY</th>
              </tr>
            </thead>
            <tbody>
              {markets.length === 0 ? (
                <tr><td colSpan="2" className="empty-row">No vendor has registered a market yet.</td></tr>
              ) : markets.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  <td>{m.municipality}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="info-box" style={{ marginTop: 14 }}>
            Markets are taken from fish vendor registrations. A separate market list
            that can be edited here is not stored in the database yet.
          </div>
        </div>

      </div>
    </>
  );
}

/* ================================================================
   PRICE RECORDS
   ================================================================ */

function PriceRecords({ priceRecords, error, species, municipalities, onChanged, notify }) {
  const [tab, setTab] = useState("Latest Day");
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("All Species");
  const [municipalityFilter, setMunicipalityFilter] = useState("All Municipalities");
  const [dateFilter, setDateFilter] = useState("");

  const latestDay = priceRecords.reduce((max, r) => (r.date > max ? r.date : max), "");
  const today = new Date().toLocaleDateString("en-CA");

  const base = priceRecords.filter((r) => {
    if (tab === "Latest Day") return r.date === latestDay;
    if (tab === "Published") return r.status === "Published";
    if (tab === "In Review") return ["Draft", "Pending Review", "Approved"].includes(r.status);
    if (tab === "Flagged / Rejected") return r.status === "Flagged" || r.status === "Rejected";
    if (tab === "Corrected") return r.isCorrection;
    return true;
  });

  const visible = base
    .filter((r) => speciesFilter === "All Species" || r.species === speciesFilter)
    .filter((r) => municipalityFilter === "All Municipalities" || r.municipality === municipalityFilter)
    .filter((r) => !dateFilter || r.date === dateFilter)
    .filter((r) =>
      [r.species, r.municipality, r.enteredBy].join(" ").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

  // Active species × municipality pairs with no price recorded today.
  const missing = [];
  species.filter((s) => s.status === "Active").forEach((sp) => {
    municipalities.filter((m) => m.status === "Active").forEach((mk) => {
      if (!priceRecords.some((r) => r.species === sp.name && r.municipality === mk.name && r.date === today)) {
        missing.push({ species: sp.name, municipality: mk.name });
      }
    });
  });

  const send = async (r, method, body) => {
    const response = await fetch(apiUrl(`/prices/${r.id}/`), {
      method,
      headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data && typeof data === "object" ? Object.values(data).flat().map(String).join(" ") : "";
      throw new Error(message || `Request failed (HTTP ${response.status}).`);
    }
  };

  const deleteRecord = async (r) => {
    if (!window.confirm(`Permanently delete this ${r.species} record (${peso(r.price)}, ${fmtDate(r.date)})?`)) return;
    try {
      await send(r, "DELETE");
      notify("Record deleted.");
      onChanged();
    } catch (err) {
      notify(err.message);
    }
  };

  const correctRecord = async (r) => {
    const input = window.prompt(`New price per kg for ${r.species} on ${fmtDate(r.date)}:`, r.price);
    if (input === null) return;

    const newPrice = parseFloat(input);
    if (isNaN(newPrice) || newPrice <= 0) {
      notify("Invalid price entered.");
      return;
    }
    try {
      if (r.status === "Published") {
        // Published prices keep their original value in the correction history.
        const reason = window.prompt("Reason for this correction (kept in the audit trail):", "");
        if (reason === null) return;
        if (!reason.trim()) {
          notify("A reason is required to correct a published price.");
          return;
        }
        await sendJson(`/prices/${r.id}/correct/`, "POST", { price_per_kg: newPrice.toFixed(2), reason: reason.trim() });
        notify("Price corrected. The original price is kept in the history.");
      } else {
        await send(r, "PATCH", { price_per_kg: newPrice.toFixed(2) });
        notify("Record updated.");
      }
      onChanged();
    } catch (err) {
      notify(err.message);
    }
  };

  const exportCSV = () => {
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Date", "Species", "Municipality", "Price", "Entered By", "Status"],
      ...visible.map((r) => [r.date, r.species, r.municipality, r.price.toFixed(2), r.enteredBy, r.status]),
    ];
    const blob = new Blob(["﻿" + rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "price_records.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    notify("Price records exported.");
  };

  const badgeFor = (status) => ({ Published: "success", Flagged: "flagged", Rejected: "deleted", Approved: "approved" }[status] || "pending");

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Records</h2>
          <p>View, filter, and audit every price entry logged in the system.</p>
        </div>
        <button className="secondary-btn" onClick={exportCSV} disabled={!visible.length}>↓ Export CSV</button>
      </div>

      {error && <div className="warn-box" role="alert">{error}</div>}

      {missing.length > 0 && (
        <div className="notice">
          <div className="notice-icon">!</div>
          <div>
            <strong>{missing.length} missing price record{missing.length > 1 ? "s" : ""} for today</strong>
            <p>
              {missing.slice(0, 8).map((m) => `${m.species} in ${m.municipality}`).join(", ")}
              {missing.length > 8 ? `, and ${missing.length - 8} more` : ""} —
              not yet encoded by any LGU officer.
            </p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="tabs">
          {["Latest Day", "All", "Published", "In Review", "Corrected", "Flagged / Rejected"].map((t) => (
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
              placeholder="Search species, municipality, or encoder..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)}>
            <option>All Species</option>
            {species.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>

          <select value={municipalityFilter} onChange={(e) => setMunicipalityFilter(e.target.value)}>
            <option>All Municipalities</option>
            {municipalities.map((m) => <option key={m.id}>{m.name}</option>)}
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
              <th>MUNICIPALITY</th>
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
              visible.slice(0, 200).map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td><strong>{r.species}</strong></td>
                  <td>{r.municipality}</td>
                  <td>
                    <strong>{peso(r.price)}</strong>
                    {r.isCorrection && r.corrections.length > 0 && (
                      <small className="muted-text" style={{ display: "block" }} title={r.corrections.map((c) => `${peso(c.previous_price)} → ${peso(c.new_price)}: ${c.reason} (${c.corrected_by || "—"})`).join("\n")}>
                        Corrected · was {peso(r.corrections[0].previous_price)}
                      </small>
                    )}
                  </td>
                  <td>{r.enteredBy}</td>
                  <td>
                    <span className={`badge ${badgeFor(r.status)}`}>{r.status}</span>
                  </td>
                  <td>
                    <div className="action-icons">
                      <button title={r.status === "Published" ? "Correct price" : "Edit price"} onClick={() => correctRecord(r)}>✎</button>
                      {r.status !== "Published" && <button title="Delete" onClick={() => deleteRecord(r)}>✕</button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {visible.length > 200 && <p className="empty-row">Showing the 200 most recent of {visible.length} records — export for the full list.</p>}
      </div>
    </>
  );
}

/* ================================================================
   SYSTEM CONFIGURATION
   ================================================================ */

function SystemConfiguration({ notify }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState({ min_price_per_kg: "", max_price_per_kg: "" });
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sendJson("/system-settings/", "GET")
      .then((data) => {
        if (cancelled) return;
        setSaved(data);
        setForm({ min_price_per_kg: data.min_price_per_kg, max_price_per_kg: data.max_price_per_kg });
      })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const data = await sendJson("/system-settings/", "PATCH", form);
      setSaved(data);
      notify("Price range saved. New and corrected prices must now fall within it.");
    } catch (error) {
      setErrors(error.fields || {});
      if (!error.fields || !Object.keys(error.fields).length) notify(error.message);
    } finally {
      setSaving(false);
    }
  };

  const changed = saved && (form.min_price_per_kg !== saved.min_price_per_kg || form.max_price_per_kg !== saved.max_price_per_kg);

  return (
    <>
      <div className="page-title">
        <div>
          <h2>System Configuration</h2>
          <p>System-wide parameters that control how AquaTimbang validates data.</p>
        </div>
      </div>

      {loadError && <div className="warn-box" role="alert">{loadError}</div>}

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">₱</div>
            <div>
              <h3>Price Validation Range</h3>
              <p>Prices per kg outside this range are rejected when entered or corrected</p>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cfg-min">Minimum Price per kg</label>
              <div className="input-with-unit"><span>₱</span>
                <input id="cfg-min" type="number" min="0.01" step="0.01" value={form.min_price_per_kg} onChange={(e) => setForm({ ...form, min_price_per_kg: e.target.value })} />
              </div>
              {errors.min_price_per_kg && <small className="field-error">{errors.min_price_per_kg}</small>}
            </div>
            <div className="form-group">
              <label htmlFor="cfg-max">Maximum Price per kg</label>
              <div className="input-with-unit"><span>₱</span>
                <input id="cfg-max" type="number" min="0.01" step="0.01" value={form.max_price_per_kg} onChange={(e) => setForm({ ...form, max_price_per_kg: e.target.value })} />
              </div>
              {errors.max_price_per_kg && <small className="field-error">{errors.max_price_per_kg}</small>}
            </div>
          </div>

          <div className="info-box">
            Existing prices are not changed. The LGU's Price Anomalies page also uses this range.
          </div>

          <button className="primary-btn full-btn" style={{ marginTop: 14 }} onClick={save} disabled={saving || !changed}>
            {saving ? "Saving…" : "Save Price Range"}
          </button>
          {saved?.updated_by_name && (
            <p className="muted-text" style={{ marginTop: 10 }}>
              Last changed by {saved.updated_by_name} on {formatAuditTimestamp(saved.updated_at)}.
            </p>
          )}
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">⚙</div>
            <div>
              <h3>Login Security</h3>
              <p>Set on the server in backend/.env</p>
            </div>
          </div>
          <div className="profile-grid">
            <div className="profile-field"><span>Idle logout</span><strong>{localStorage.getItem("sessionIdleMinutes") || 30} minutes</strong></div>
            <div className="profile-field"><span>Account lock</span><strong>After repeated wrong passwords</strong></div>
          </div>
          <p className="muted-text" style={{ marginTop: 12 }}>
            Change SESSION_IDLE_MINUTES, LOGIN_MAX_ATTEMPTS and LOGIN_LOCKOUT_MINUTES in backend/.env, then restart the server.
          </p>
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

function FisherfolkSuggestions({ suggestions, error, onChanged, notify }) {
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString("en-CA");
  };
  const [speciesFilter, setSpeciesFilter] = useState("All Species");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState(null);

  const speciesNames = [...new Set(suggestions.map((s) => s.species).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const stats = suggestionStats(suggestions, speciesFilter, from, to);

  const visible = suggestions
    .filter((s) => speciesFilter === "All Species" || s.species === speciesFilter)
    .filter((s) => s.date >= from && s.date <= to)
    .filter((s) =>
      [s.species, s.submittedBy, s.municipality].join(" ").toLowerCase().includes(search.toLowerCase())
    );

  const setStatus = async (s, decision) => {
    const feedback = window.prompt(`Optional feedback for ${s.submittedBy} (${s.species}):`, "");
    if (feedback === null) return;
    setSavingId(s.id);
    try {
      await reviewVendorSuggestion(s.id, decision, feedback.trim());
      notify(`Suggestion marked as ${decision}.`);
      onChanged();
    } catch (err) {
      notify(err.message);
    } finally {
      setSavingId(null);
    }
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
          <p>Review prices suggested by fish vendors and compare them against official rates.</p>
        </div>
      </div>

      {error && <div className="warn-box" role="alert">{error}</div>}

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
            {speciesNames.map((s) => <option key={s}>{s}</option>)}
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
              <th>MUNICIPALITY</th>
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
                  <td>{s.municipality}</td>
                  <td><span className={`badge ${statusClass(s.status)}`}>{s.status}</span></td>
                  <td>
                    {s.status === "Pending Review" ? (
                      <div className="action-icons">
                        <button title="Mark Reviewed" disabled={savingId === s.id} onClick={() => setStatus(s, "reviewed")}>👁</button>
                        <button title="Adopt" disabled={savingId === s.id} onClick={() => setStatus(s, "adopted")}>✔</button>
                        <button title="Reject" disabled={savingId === s.id} onClick={() => setStatus(s, "rejected")}>✕</button>
                      </div>
                    ) : (
                      <span className="muted-text">{s.lguFeedback || "Reviewed"}</span>
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
   PREDICTIVE ANALYTICS MONITORING
   ================================================================ */

function PredictiveAnalytics({ species, municipalities, defaultMunicipalityId, notify }) {
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getForecastHistory()
      .then((rows) => { if (!cancelled) { setHistory(rows); setHistoryError(""); } })
      .catch((err) => { if (!cancelled) setHistoryError(err.message); });
    return () => { cancelled = true; };
  }, [historyKey]);

  const activeSpecies = species.filter((s) => s.status === "Active").map((s) => ({ id: s.id, name: s.name }));
  const activeMunicipalities = municipalities.filter((m) => m.status === "Active");

  return (
    <>
      <Suspense fallback={<div className="panel" style={{ padding: 24 }}>Loading forecast…</div>}>
        <ForecastView
          species={activeSpecies}
          municipalities={activeMunicipalities}
          defaultMunicipalityId={defaultMunicipalityId}
          notify={notify}
          onGenerated={() => setHistoryKey((k) => k + 1)}
          description="SARIMAX forecasts with external factors, accuracy (MAPE/RMSE) and 95% confidence intervals."
        />
      </Suspense>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <div>
            <h3>Forecast History</h3>
            <p>The 30 most recently generated forecasts, saved in the database</p>
          </div>
          <button className="secondary-btn" onClick={() => setHistoryKey((k) => k + 1)}>↻ Refresh</button>
        </div>

        {historyError && <div className="warn-box" role="alert">{historyError}</div>}
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>GENERATED</th>
                <th>SPECIES</th>
                <th>MUNICIPALITY</th>
                <th>MODEL</th>
                <th>DAYS</th>
                <th>MAPE</th>
                <th>RMSE</th>
                <th>END PRICE</th>
                <th>BY</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan="9" className="empty-row">No forecasts generated yet.</td></tr>
              ) : (
                history.map((run) => (
                  <tr key={run.id}>
                    <td>{formatAuditTimestamp(run.created_at)}</td>
                    <td><strong>{run.fish_name}</strong></td>
                    <td>{run.municipality_name || "All municipalities"}</td>
                    <td>{run.model_used}</td>
                    <td>{run.horizon_days}</td>
                    <td>{run.mape !== null ? `${run.mape}%` : "—"}</td>
                    <td>{run.rmse !== null ? peso(run.rmse) : "—"}</td>
                    <td>{peso(run.forecast[run.forecast.length - 1]?.price)}</td>
                    <td>{run.created_by_name || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   DATA MONITORING
   ================================================================ */

function DataMonitoring({ species, municipalities, priceRecords, goTo }) {
  const activeSpecies = species.filter((s) => s.status === "Active");
  const activeMarkets = municipalities.filter((m) => m.status === "Active");
  const [speciesChoice, setSpeciesChoice] = useState("");
  const speciesName = activeSpecies.some((s) => s.name === speciesChoice) ? speciesChoice : activeSpecies[0]?.name || "";

  const activeRecords = priceRecords.filter((r) => r.status === "Published");
  const today = new Date().toLocaleDateString("en-CA");

  const expectedToday = activeSpecies.length * activeMarkets.length;
  const presentToday = today
    ? activeSpecies.reduce((sum, sp) => {
        return sum + activeMarkets.filter((mk) =>
          priceRecords.some((r) => r.species === sp.name && r.municipality === mk.name && r.date === today)
        ).length;
      }, 0)
    : 0;
  const completeness = expectedToday ? Math.round((presentToday / expectedToday) * 100) : 0;

  const speciesHistory = priceRecords
    .filter((r) => r.species === speciesName)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
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
            <small>{activeRecords.length} published</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✔</div>
          <div>
            <span>Today's Completeness</span>
            <h2>{completeness}%</h2>
            <small>{presentToday} of {expectedToday} species × municipality entries</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">⚠</div>
          <div>
            <span>Flagged Records</span>
            <h2>{priceRecords.filter((r) => r.status === "Flagged").length}</h2>
            <small>Need another look</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">✕</div>
          <div>
            <span>Rejected Records</span>
            <h2>{priceRecords.filter((r) => r.status === "Rejected").length}</h2>
            <small>Not published</small>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Species Price History</h3>
            <p>Most recent 12 records for the selected species</p>
          </div>
          <select value={speciesName} onChange={(e) => setSpeciesChoice(e.target.value)}>
            {activeSpecies.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>MUNICIPALITY</th>
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
                  <td>{r.municipality}</td>
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

function SystemAnnouncements() {
  return (
    <>
      <div className="page-title">
        <div>
          <h2>System Announcements</h2>
          <p>Messages shown to AquaTimbang users.</p>
        </div>
      </div>
      <div className="panel">
        <p className="empty-row" style={{ padding: 24 }}>
          Announcements are not stored in the AquaTimbang database yet, so none can be published here.
        </p>
      </div>
    </>
  );
}

export default Admin;
