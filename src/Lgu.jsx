// useEffect lets us load data from Django when the LGU dashboard opens.
import React, { useEffect, useState } from "react";
import "./App.css";
import "./Lgu.css";
import {
  listVendorSuggestions,
  reviewVendorSuggestion,
} from "./api/vendorSuggestions";


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
        {[["Date & Time", formatAuditTimestamp(log.created_at)], ["User", log.actor_username || "—"], ["Role", log.actor_role || "—"], ["Record Type", log.target_type || "—"], ["Fish Species", log.target_name || "—"], ...items.map(item => [item.key, item.value])].map(([key, value], index) => <React.Fragment key={`${key}-${index}`}><dt style={{ color: "#64748b", fontWeight: 600 }}>{key}</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{value}</dd></React.Fragment>)}
      </dl>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}><button type="button" className="secondary-btn" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}

function exportAuditCsv(records, filename) {
  const cols = ["Date", "User", "Role", "Action", "Target", "Details"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = records.map(l => [formatAuditTimestamp(l.created_at), l.actor_username, l.actor_role, l.action, l.target_name, formatAuditDetails(l.details)]);
  const csv = "\uFEFF" + [cols, ...rows].map(row => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================================================================
   CONSTANTS & MOCK DATA
   ================================================================ */

const SPECIES_LIST = ["Galunggong", "Tulingan", "Bolinaw", "Tamarong", "Anduhaw"];

const SCI_NAMES = {
  Galunggong: "Decapterus macarellus",
  Tulingan: "Euthynnus affinis",
  Bolinaw: "Stolephorus spp.",
  Tamarong: "Local catch",
  Anduhaw: "Rastrelliger spp.",
};

const BASE_PRICES = { Galunggong: 180, Tulingan: 160, Bolinaw: 120, Tamarong: 150, Anduhaw: 170 };
const MARKETS = ["Pasil Fish Market", "Carbon Public Market", "Mandaue City Market"];
const MIN_PRICE = 50;
const MAX_PRICE = 1000;

const peso = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (isoStr) => {
  const d = new Date(isoStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric" });
};

function buildPriceHistory() {
  const TODAY = new Date(2026, 8, 16);
  const history = {};
  SPECIES_LIST.forEach((sp) => {
    const rows = [];
    const base = BASE_PRICES[sp];
    for (let d = 29; d >= 0; d--) {
      const date = new Date(TODAY);
      date.setDate(date.getDate() - d);
      const weekday = date.getDay();
      const bump = weekday === 0 || weekday === 6 ? 4 : 0;
      const pseudo = Math.abs(Math.sin(d * 12.9898 + base) * 10000) % 1;
      const price = Math.max(40, Number((base + bump + (pseudo - 0.5) * 12).toFixed(2)));
      rows.push({ date: date.toISOString().slice(0, 10), price });
    }
    history[sp] = rows;
  });
  return history;
}

function buildMarketPrices(priceHistory) {
  // per-market variants of the same base history, for Price Comparison
  const out = {};
  MARKETS.forEach((mk, mi) => {
    out[mk] = {};
    SPECIES_LIST.forEach((sp) => {
      const rows = priceHistory[sp];
      const last = rows[rows.length - 1];
      const offset = (mi - 1) * 2.5;
      out[mk][sp] = Math.max(40, Number((last.price + offset).toFixed(2)));
    });
  });
  return out;
}

function buildFisherfolk() {
  return [
    { id: 1, name: "Marites Abellana", municipality: "Cebu City", registeredDate: "01/18/2026", status: "Active", suggestionCount: 14, lastSubmission: "09/15/2026", activity: [
      { date: "09/15/2026 04:10 PM", action: "Submitted suggested price for Bolinaw" },
      { date: "09/14/2026 09:02 AM", action: "Used Fair Price Calculator" },
    ]},
    { id: 2, name: "Ronald Ceniza", municipality: "Mandaue City", registeredDate: "01/22/2026", status: "Inactive", suggestionCount: 3, lastSubmission: "08/28/2026", activity: [
      { date: "08/28/2026 10:00 AM", action: "Submitted suggested price for Anduhaw" },
    ]},
    { id: 3, name: "Juan Dela Cruz", municipality: "Cebu City", registeredDate: "09/14/2026", status: "Pending", suggestionCount: 0, lastSubmission: "—", activity: [] },
    { id: 4, name: "Pedro Santos", municipality: "Cebu City", registeredDate: "09/15/2026", status: "Pending", suggestionCount: 0, lastSubmission: "—", activity: [] },
    { id: 5, name: "Maria Garcia", municipality: "Cebu City", registeredDate: "09/15/2026", status: "Pending", suggestionCount: 1, lastSubmission: "09/16/2026", activity: [
      { date: "09/16/2026 08:20 AM", action: "Submitted suggested price for Galunggong" },
    ]},
  ];
}

function buildSuggestions() {
  const vendors = ["Marites Abellana", "Ronald Ceniza", "Maria Garcia"];
  const rows = [];
  let id = 1;
  for (let d = 9; d >= 0; d--) {
    const date = new Date(2026, 8, 16);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    SPECIES_LIST.forEach((sp) => {
      vendors.forEach((v, i) => {
        if ((id + i) % 3 === 0) return;
        const base = BASE_PRICES[sp];
        const pseudo = Math.abs(Math.sin((id + i) * 8.31) * 10000) % 1;
        rows.push({
          id: id++,
          species: sp,
          suggestedPrice: Math.max(40, Number((base + (pseudo - 0.5) * 20).toFixed(2))),
          submittedBy: v,
          date: dateStr,
          comment: id % 5 === 0 ? "Typo — meant a lower price, please review." : "",
          status: d < 2 ? "Pending Review" : ["Reviewed", "Adopted", "Rejected"][id % 3],
        });
      });
    });
  }
  return rows.reverse();
}

/* ================================================================
   ROOT LGU COMPONENT
   ================================================================ */

function LGU({ onLogout }) {

  // Stores the real price records returned by Django.
  const [priceRecords, setPriceRecords] = useState([]);

// Shows whether the records are currently being loaded.
  const [pricesLoading, setPricesLoading] = useState(true);

// Stores an error if Django cannot be reached.
  const [pricesError, setPricesError] = useState("");

// ------------------------------------------------------------
// LOAD / REFRESH REAL PRICE RECORDS FROM DJANGO
// ------------------------------------------------------------
const refreshPrices = async () => {
  try {
    // Show the loading state while requesting records.
    setPricesLoading(true);

    // Clear any previous loading error.
    setPricesError("");

    // Get the authentication token saved after login.
    const token = localStorage.getItem("authToken");

    console.log("LGU price loader started.");

    // Stop if the user is not authenticated.
    if (!token) {
      console.error("No authToken found in localStorage.");
      setPricesError("No login token found.");
      return;
    }

    // Request all price records from Django.
    const response = await fetch(
      "http://127.0.0.1:8000/api/prices/",
      {
        method: "GET",
        headers: {
          // Django REST Framework token authentication.
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Price API status:", response.status);

    // Stop if Django returned an error.
    if (!response.ok) {
      throw new Error(
        `Failed to load prices. HTTP status: ${response.status}`
      );
    }

    // Convert the Django response into JavaScript data.
    const data = await response.json();

    console.log("Price records from Django:", data);

    // Support both normal arrays and paginated DRF responses.
    const records = Array.isArray(data)
      ? data
      : Array.isArray(data.results)
      ? data.results
      : [];

    // Store the latest Django records.
    setPriceRecords(records);

    // Return them in case another function needs the result.
    return records;
  } catch (error) {
    console.error("Price loading error:", error);

    setPricesError("Unable to load price records.");

    return [];
  } finally {
    // Loading is finished whether the request succeeds or fails.
    setPricesLoading(false);
  }
};


// ------------------------------------------------------------
// LOAD PRICES WHEN THE LGU DASHBOARD FIRST OPENS
// ------------------------------------------------------------
useEffect(() => {
  // Run the reusable refresh function once on page load.
  refreshPrices();
}, []);
  
  // Get the authenticated user that App.jsx saved after login.
  const savedUser = localStorage.getItem("user");

  // Convert the saved JSON string back into an object.
  const currentUser = savedUser
    ? JSON.parse(savedUser)
    : null;

  // Build the user's full name from Django.
  const fullName = [
    currentUser?.first_name,
    currentUser?.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  // If first/last name are empty, show the username instead.
  const ME =
    fullName ||
    currentUser?.username ||
    "LGU Officer";

  // Generate initials for the profile circle.
  const userInitials = ME
    .split(" ")
    .map((name) => name[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Dashboard navigation state.
  // Restore the last visited LGU page after refreshing.
const [activePage, setActivePage] = useState(() => {
  return sessionStorage.getItem("lguActivePage") || "Dashboard";
});

// Save the selected page whenever navigation changes.
useEffect(() => {
  sessionStorage.setItem("lguActivePage", activePage);
}, [activePage]);
  const [toast, setToast] = useState("");
  const [priceHistory] = useState(() => buildPriceHistory());
  const [marketPrices] = useState(() => buildMarketPrices(buildPriceHistory()));
  const [fisherfolk, setFisherfolk] = useState(() => buildFisherfolk());
  const [suggestions, setSuggestions] = useState(() => buildSuggestions());

  const [entries, setEntries] = useState([]);

  const [factors, setFactors] = useState([
    { id: 1, date: "09/15/2026", fuel: 66.8, weather: "Cloudy", holiday: true, note: "Local fiesta — Barangay Pasil" },
    { id: 2, date: "09/14/2026", fuel: 66.1, weather: "Stormy", holiday: false, note: "Fishing trips suspended" },
    { id: 3, date: "09/12/2026", fuel: 66.1, weather: "Rainy", holiday: false, note: "" },
    { id: 4, date: "09/10/2026", fuel: 65.4, weather: "Sunny", holiday: false, note: "" },
  ]);

  const [referencePrices, setReferencePrices] = useState(
    SPECIES_LIST.map((sp, i) => ({
      id: i + 1,
      species: sp,
      price: BASE_PRICES[sp],
      publishedDate: "09/10/2026",
      publishedBy: ME,
    }))
  );

  const [validationHistory, setValidationHistory] = useState([
    { id: 1, date: "09/16/2026 06:02 AM", user: ME, action: "Published daily price for Galunggong", details: "₱180.00 per kg" },
    { id: 2, date: "09/10/2026 08:00 AM", user: ME, action: "Published reference price for all species", details: "Initial reference set" },
  ]);

  const [logs, setLogs] = useState([
    { id: 1, date: "09/16/2026 06:02 AM", user: ME, action: "Published price", species: "Galunggong", details: "₱180.00 per kg", status: "Success" },
    { id: 2, date: "09/16/2026 05:48 AM", user: ME, action: "Flagged entry", species: "Bolinaw", details: "₱980.00 outside bounds", status: "Flagged" },
    { id: 3, date: "09/16/2026 05:41 AM", user: ME, action: "Encoded price", species: "Tulingan", details: "₱160.00 per kg", status: "Success" },
  ]);

  const [profile, setProfile] = useState({
  // Use information returned by the Django login endpoint.
  name: ME,
  email: currentUser?.email || "—",
  username: currentUser?.username || "—",
  role: currentUser?.role || "LGU Officer",

  // Use the user's municipality when Django provides it.
  municipality:
    currentUser?.municipality?.name ||
    currentUser?.municipality ||
    "—",

  // These are placeholders until we connect them to Django.
  registeredDate: "—",
  lastLogin: new Date().toLocaleString("en-PH"),
});

  const [myActivity, setMyActivity] = useState([
    { id: 1, date: "09/16/2026 06:02 AM", action: "Logged in" },
    { id: 2, date: "09/15/2026 05:52 PM", action: "Edited price for Galunggong" },
  ]);

  const [dismissedNotifs, setDismissedNotifs] = useState([]);

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  };

  const addLog = (action, species, details, status = "Success") => {
    setLogs((prev) => [
      { id: Date.now(), date: new Date().toLocaleString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }), user: ME, action, species, details, status },
      ...prev,
    ]);
  };

  const addValidation = (action, details) => {
    setValidationHistory((prev) => [
      { id: Date.now(), date: new Date().toLocaleString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }), user: ME, action, details },
      ...prev,
    ]);
  };

  const logActivity = (action) => {
    setMyActivity((prev) => [
      { id: Date.now(), date: new Date().toLocaleString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }), action },
      ...prev,
    ]);
  };

  const notifications = buildLguNotifications(suggestions, entries, fisherfolk);
  const unread = notifications.filter((n) => !dismissedNotifs.includes(n.id));

  const menuGroups = [
    {
      label: "DAILY OPERATIONS",
      items: [
        { name: "Dashboard", icon: "▦" },
        { name: "Price Entry", icon: "✎" },
        { name: "Fish Species Management", icon: "🐟" },
        { name: "Review & Publish", icon: "✔" },
        { name: "External Factors", icon: "☁" },
      ],
    },
    {
      label: "FISHERFOLK",
      items: [
        { name: "Fisherfolk Management", icon: "👥" },
        { name: "Price Suggestions", icon: "📥" },
      ],
    },
    {
      label: "REFERENCE PRICES",
      items: [
        { name: "Official Reference Prices", icon: "₱" },
        { name: "Price Trends", icon: "📈" },
        { name: "Price Comparison", icon: "⇄" },
        { name: "Price Anomalies", icon: "⚠" },
      ],
    },
    {
      label: "FORECASTING",
      items: [{ name: "Price Forecast", icon: "◔" }],
    },
    {
      label: "REPORTS & AUDIT",
      items: [
        { name: "Reports", icon: "▤" },
        { name: "Validation History", icon: "🗂" },
        { name: "Audit Log", icon: "◷" },
      ],
    },
    {
      label: "ACCOUNT",
      items: [
        { name: "Notifications", icon: "🔔" },
        { name: "My Profile", icon: "♙" },
      ],
    },
  ];

  const renderPage = () => {
    switch (activePage) {
 case "Price Entry":
  return (
    <PriceEntry
  // Existing frontend entries.
  entries={entries}
  setEntries={setEntries}

  // Existing helper functions.
  notify={notify}
  addLog={addLog}
  logActivity={logActivity}

  // Real Django price records.
  priceRecords={priceRecords}
  setPriceRecords={setPriceRecords}

  // Reload Django records after save/edit/delete.
  refreshPrices={refreshPrices}
/>
  );
     case "Review & Publish":
  return (
    <ReviewPublish
      // Send the real Django price records to ReviewPublish.
      priceRecords={priceRecords}

      // Allows ReviewPublish to refresh data after approve/reject/publish.
      refreshPrices={refreshPrices}

      // Keep the existing frontend properties for now.
      entries={entries}
      setEntries={setEntries}
      notify={notify}
      addLog={addLog}
      addValidation={addValidation}
      logActivity={logActivity}
    />
  );
      case "Fish Species Management":
        return <LGUFishSpeciesManagement notify={notify} />;
      case "External Factors":
        return <ExternalFactors factors={factors} setFactors={setFactors} notify={notify} addLog={addLog} />;
      case "Fisherfolk Management":
        return <FisherfolkManagement fisherfolk={fisherfolk} notify={notify} />;
      case "Price Suggestions":
        return (
          <PriceSuggestions
            suggestions={suggestions} setSuggestions={setSuggestions}
            referencePrices={referencePrices} setReferencePrices={setReferencePrices}
            notify={notify} addValidation={addValidation} logActivity={logActivity}
          />
        );
      case "Official Reference Prices":
        return (
          <OfficialReferencePrices
            referencePrices={referencePrices} setReferencePrices={setReferencePrices}
            notify={notify} addValidation={addValidation} logActivity={logActivity}
          />
        );
      case "Price Trends":
        return <PriceTrends priceHistory={priceHistory} />;
      case "Price Comparison":
        return <PriceComparison marketPrices={marketPrices} />;
      case "Price Anomalies":
        return <PriceAnomalies entries={entries} suggestions={suggestions} />;
      case "Price Forecast":
        return <PriceForecast priceHistory={priceHistory} factors={factors} notify={notify} />;
      case "Reports":
        return <Reports entries={entries} notify={notify} />;
      case "Validation History":
        return <ValidationHistory validationHistory={validationHistory} notify={notify} />;
      case "Audit Log":
        return <AuditLog logs={logs} notify={notify} />;
      case "Notifications":
        return <Notifications notifications={notifications} dismissedNotifs={dismissedNotifs} setDismissedNotifs={setDismissedNotifs} goTo={setActivePage} />;
      case "My Profile":
        return <MyProfile profile={profile} setProfile={setProfile} activity={myActivity} notify={notify} />;
      default:
        return (
          <LGUDashboard 
            entries={entries} priceRecords={priceRecords} pricesLoading={pricesLoading} pricesError={pricesError} logs={logs} suggestions={suggestions} fisherfolk={fisherfolk}
            priceHistory={priceHistory} goTo={setActivePage} 
          // Send the logged-in user's name to the dashboard.
             userName={ME}
            />
            
        );
    }
  };

  return (
    <div className="app">

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">🐟</div>
          <div>
            <h2>AquaTimbang</h2>
            <span>Fish Price Transparency</span>
          </div>
        </div>

        <div className="admin-label">LGU OFFICER</div>

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
                  {item.name === "Notifications" && unread.length > 0 && (
                    <span className="nav-badge">{unread.length}</span>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}
             </nav>

      {/* Bottom section of the LGU sidebar. */}
      <div className="sidebar-bottom">

        <div className="admin-profile">
          {/* Display initials of the actual logged-in user. */}
          <div className="avatar">{userInitials}</div>

          <div>
            {/* Display the actual logged-in user's name. */}
            <strong>{ME}</strong>

            {/* Display the role returned by Django. */}
            <small>{currentUser?.role || "LGU Officer"}</small>
          </div>
        </div>

        {/* Log out of the current account. */}
        <button
          className="logout-btn"
          onClick={onLogout}
        >
          ↪ Logout
        </button>

      </div>

    </aside>

    <main className="main">
        <header className="topbar">
          <div>
            <h1>{activePage}</h1>
            <p>Encode, validate, and publish official fish prices</p>
          </div>

          <div className="top-profile">
    {/* Actual user's initials. */}
          <div className="avatar small">{userInitials}</div>

           <div>
        {/* Actual logged-in user. */}
          <strong>{ME}</strong>

        {/* Actual role from Django. */}
           <span>{currentUser?.role || "LGU Officer"}</span>
          </div>
          </div>
        </header>

        <section className="content">{renderPage()}</section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function buildLguNotifications(suggestions, entries, fisherfolk) {
  const notifs = [];
  let id = 1;

  const pendingSuggestions = suggestions.filter((s) => s.status === "Pending Review");
  if (pendingSuggestions.length > 0) {
    notifs.push({
      id: id++, type: "warning", page: "Price Suggestions",
      title: `${pendingSuggestions.length} suggested price${pendingSuggestions.length > 1 ? "s" : ""} awaiting review`,
      detail: pendingSuggestions.slice(0, 3).map((s) => s.species).join(", "),
    });
  }

  const pendingFisherfolk = fisherfolk.filter((f) => f.status === "Pending");
  if (pendingFisherfolk.length > 0) {
    notifs.push({
      id: id++, type: "info", page: "Fisherfolk Management",
      title: `${pendingFisherfolk.length} fisherfolk registration${pendingFisherfolk.length > 1 ? "s" : ""} pending`,
      detail: "Administrator approval required before they can submit suggestions.",
    });
  }

  const flagged = entries.filter((e) => e.status === "Flagged");
  if (flagged.length > 0) {
    notifs.push({
      id: id++, type: "danger", page: "Review & Publish",
      title: `${flagged.length} flagged price entr${flagged.length > 1 ? "ies" : "y"}`,
      detail: flagged.map((e) => `${e.species} at ${peso(e.price)}`).join(", "),
    });
  }

  const notEncoded = SPECIES_LIST.filter((sp) => !entries.some((e) => e.species === sp));
  if (notEncoded.length > 0) {
    notifs.push({
      id: id++, type: "warning", page: "Price Entry",
      title: `${notEncoded.length} species not yet encoded today`,
      detail: notEncoded.join(", "),
    });
  }

  return notifs;
}

/* ================================================================
   DASHBOARD
   ================================================================ */

function LGUDashboard({ entries, priceRecords, pricesLoading, pricesError, logs, suggestions, fisherfolk, priceHistory, goTo, userName }) {
  // Build today's local date as YYYY-MM-DD, matching Django's recorded_date field.
  const today = new Date().toLocaleDateString("en-CA");

  // Keep only real Django records recorded today.
  const todaysRecords = priceRecords.filter(
    (record) => record.recorded_date === today
  );

  // Count unique species encoded today from Django data.
  const encodedToday = new Set(
    todaysRecords.map((record) => record.fish_species)
  ).size;

  // Calculate today's average using only today's Django records.
  const averagePriceToday = todaysRecords.length
    ? todaysRecords.reduce(
        (total, record) => total + Number(record.price_per_kg || 0),
        0
      ) / todaysRecords.length
    : 0;

  // Find the start of the current week (Sunday) in local time.
  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  // Count real Django price records from the current week.
  const recordsThisWeek = priceRecords.filter((record) => {
    if (!record.recorded_date) return false;
    const recordDate = new Date(`${record.recorded_date}T00:00:00`);
    return recordDate >= startOfWeek;
  }).length;

  // These status cards can only be real if Django actually returns a status field.
  // If the field is absent, show a dash instead of displaying old mock numbers.
  const hasStatusField = priceRecords.some((record) => "status" in record);
  const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
  const pendingReview = hasStatusField
    ? priceRecords.filter((record) => ["for review", "pending review", "pending"].includes(normalizeStatus(record.status))).length
    : null;
  const published = hasStatusField
    ? priceRecords.filter((record) => normalizeStatus(record.status) === "published").length
    : null;
  const flagged = hasStatusField
    ? priceRecords.filter((record) => normalizeStatus(record.status) === "flagged").length
    : null;

  // The current Django price response does not contain suggestion/fisherfolk data.
  // Show a dash rather than continuing to display the old mock values.
  const suggestionsThisWeek = null;
  const participatingFisherfolk = null;
  const pendingSuggestions = null;

  // Sort real Django records newest first for Recent Activity.
  const recentPriceRecords = [...priceRecords]
    .sort((a, b) => {
      const aDate = new Date(a.updated_at || a.created_at || `${a.recorded_date}T00:00:00`);
      const bDate = new Date(b.updated_at || b.created_at || `${b.recorded_date}T00:00:00`);
      return bDate - aDate;
    })
    .slice(0, 3);

  return (
    <>
      <div className="welcome-card">
        <div>
          <span className="eyebrow">LGU OFFICER</span>
          <h2>Welcome back, {userName}</h2>
          <p>Encode today's fish prices and publish validated rates for vendors and buyers.</p>
        </div>
        <div className="welcome-fish">🐟</div>
      </div>

      <div className="notice">
        <div className="notice-icon">!</div>
        <div>
          <strong>{encodedToday} unique species encoded today</strong>
          <p>
            {todaysRecords.length > 0
              ? `${todaysRecords.length} real price record${todaysRecords.length !== 1 ? "s" : ""} received from Django for ${new Date().toLocaleDateString()}.`
              : "No price records have been encoded today yet."}
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card clickable" onClick={() => goTo("Price Entry")}>
          <div className="stat-icon blue">✎</div>
          <div>
            <span>Encoded Today</span>
            <h2>{encodedToday}</h2>
            <small>unique species from Django</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Review & Publish")}>
          <div className="stat-icon orange">⏳</div>
          <div>
            <span>Pending Review</span>
            <h2>{pendingReview ?? "—"}</h2>
            <small>{hasStatusField ? "Awaiting validation" : "Status not provided by API"}</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Review & Publish")}>
          <div className="stat-icon green">✔</div>
          <div>
            <span>Published</span>
            <h2>{published ?? "—"}</h2>
            <small>{hasStatusField ? "Live for vendors" : "Status not provided by API"}</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Review & Publish")}>
          <div className="stat-icon purple">⚠</div>
          <div>
            <span>Flagged Entries</span>
            <h2>{flagged ?? "—"}</h2>
            <small>{hasStatusField ? "Outside price bounds" : "Status not provided by API"}</small>
          </div>
        </div>
      </div>

      <div className="page-title" style={{ marginBottom: 8, marginTop: 22 }}>
        <div><h2 style={{ fontSize: 15 }}>Data Summary</h2></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">₱</div>
          <div>
            <span>Average Price Today</span>
            <h2>₱{averagePriceToday.toFixed(2)}</h2>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">▤</div>
          <div>
            <span>Records This Week</span>
            <h2>{recordsThisWeek}</h2>
            <small>from Django price records</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Price Suggestions")}>
          <div className="stat-icon green">📥</div>
          <div>
            <span>Suggestions This Week</span>
            <h2>{suggestionsThisWeek ?? "—"}</h2>
            <small>Suggestions API not connected yet</small>
          </div>
        </div>

        <div className="stat-card clickable" onClick={() => goTo("Fisherfolk Management")}>
          <div className="stat-icon purple">👥</div>
          <div>
            <span>Participating Fisherfolk</span>
            <h2>{participatingFisherfolk ?? "—"}</h2>
            <small>{pendingSuggestions ?? "—"} suggestions pending</small>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Today's Price Entries</h3>
              <p>
                {todaysRecords.length > 0
                  ? todaysRecords[0].municipality_name || "Municipality"
                  : "No municipality"}
                {" — "}
                {new Date().toLocaleDateString()}
              </p>
            </div>
            <button className="text-button" onClick={() => goTo("Price Entry")}>Go to Price Entry →</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>SPECIES</th>
                <th>PRICE / KG</th>
                <th>SOURCE</th>
                <th>DATE</th>
              </tr>
            </thead>
            <tbody>
              {todaysRecords.length > 0 ? (
                todaysRecords.map((record) => (
                  <tr key={record.id}>
                    <td><strong>{record.fish_name}</strong></td>
                    <td><strong>₱{Number(record.price_per_kg).toFixed(2)}</strong></td>
                    <td>{record.source || "Not specified"}</td>
                    <td>
                      {record.recorded_date
                        ? new Date(`${record.recorded_date}T00:00:00`).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">
                    {pricesLoading
                      ? "Loading today's price records..."
                      : pricesError || "No price records encoded today."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Recent Activity</h3>
              <p>Latest real price records from Django</p>
            </div>
          </div>

          {recentPriceRecords.length > 0 ? (
            recentPriceRecords.map((record) => (
              <div className="activity" key={record.id}>
                <div className="activity-icon blue-bg">◷</div>
                <div>
                  <strong>Price record</strong>
                  <p>
                    {record.fish_name} — ₱{Number(record.price_per_kg).toFixed(2)} per kg
                    {record.source ? ` — ${record.source}` : ""}
                  </p>
                  <small>
                    {record.recorded_date
                      ? new Date(`${record.recorded_date}T00:00:00`).toLocaleDateString()
                      : "No date"}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <div className="activity">
              <div className="activity-icon blue-bg">◷</div>
              <div><strong>No price activity yet</strong></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ================================================================
   LGU FISH SPECIES MANAGEMENT — DJANGO DATABASE
   ================================================================ */
function LGUFishSpeciesManagement({ notify }) {
  const API = "http://127.0.0.1:8000/api/fish-species/";
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", scientific_name: "", description: "" });

  const request = async (url, method = "GET", payload) => {
    const token = localStorage.getItem("authToken");
    if (!token) throw new Error("Session expired. Please log in again.");
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Token ${token}`,
        ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok) {
      let detail;
      try { detail = await response.json(); } catch { /* Non-JSON error */ }
      const message = typeof detail?.detail === "string"
        ? detail.detail
        : detail && typeof detail === "object"
        ? Object.entries(detail).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join("; ")
        : `Request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  };

  const loadSpecies = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request(API);
      const rows = Array.isArray(data) ? data : data?.results;
      if (!Array.isArray(rows)) throw new Error("Unexpected fish species API response.");
      setSpecies(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSpecies(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", scientific_name: "", description: "" });
    setShowForm(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name || "",
      scientific_name: item.scientific_name || "",
      description: item.description || "",
    });
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    const payload = {
      name: form.name.trim(),
      scientific_name: form.scientific_name.trim(),
      description: form.description.trim(),
    };
    if (!payload.name) { notify("Fish species name is required."); return; }
    setBusy(true);
    try {
      await request(editing ? `${API}${editing.id}/` : API, editing ? "PATCH" : "POST", payload);
      await loadSpecies();
      setShowForm(false);
      setEditing(null);
      notify(editing ? "Fish species updated successfully." : "Fish species added successfully.");
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item) => {
    if (busy) return;
    const next = !item.is_active;
    if (!next && !window.confirm(`Deactivate ${item.name}? It will not be available for new price entries.`)) return;
    setBusy(true);
    try {
      await request(`${API}${item.id}/`, "PATCH", { is_active: next });
      await loadSpecies();
      notify(`${item.name} ${next ? "activated" : "deactivated"} successfully.`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  const filtered = species.filter((item) =>
    `${item.name} ${item.scientific_name || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-title" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2>Fish Species Management</h2>
          <p>Maintain the fish species catalog stored in AquaTimbang's Django database.</p>
        </div>
        <button className="primary-btn" onClick={openAdd} disabled={busy}>+ Add Fish Species</button>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3>Registered Fish Species</h3>
            <p>{species.length} species · {species.filter((item) => item.is_active).length} active</p>
          </div>
          <input aria-label="Search fish species" placeholder="Search species..." value={search}
            onChange={(event) => setSearch(event.target.value)} style={{ padding: 10, maxWidth: 260, width: "100%" }} />
        </div>
        {error && <div className="info-box" role="alert">{error} <button onClick={loadSpecies}>Retry</button></div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%" }}>
            <thead><tr><th>COMMON NAME</th><th>SCIENTIFIC NAME</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="4">Loading fish species...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan="4">No fish species found.</td></tr>
                : filtered.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.scientific_name || "—"}</td>
                    <td>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        color: item.is_active ? "#087443" : "#9a3412",
                        background: item.is_active ? "#dcfce7" : "#ffedd5",
                        border: `1px solid ${item.is_active ? "#86efac" : "#fdba74"}`,
                      }}>
                        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", minWidth: "max-content" }}>
                        <button type="button" disabled={busy} onClick={() => openEdit(item)}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", flex: "0 0 auto", minWidth: 82, minHeight: 36, padding: "8px 14px", whiteSpace: "nowrap", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#334155", fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>
                          Edit
                        </button>
                        <button type="button" disabled={busy} onClick={() => toggle(item)}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", flex: "0 0 auto", minWidth: 116, minHeight: 36, padding: "8px 14px", whiteSpace: "nowrap", borderRadius: 8, border: `1px solid ${item.is_active ? "#fecaca" : "#99f6e4"}`, background: item.is_active ? "#fff1f2" : "#ccfbf1", color: item.is_active ? "#be123c" : "#0f766e", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
                          {item.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="info-box">LGU Officers can add, edit, activate, and deactivate species. Permanent deletion is restricted to Administrators.</div>
      </div>

      {showForm && (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowForm(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(15, 23, 42, 0.58)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, overflowY: "auto",
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="lgu-species-modal-title"
            style={{ width: "100%", maxWidth: 540, maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.28)", padding: 26, margin: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
              <div>
                <h2 id="lgu-species-modal-title" style={{ margin: 0, fontSize: 21, color: "#0f172a" }}>
                  {editing ? "Edit Fish Species" : "Add Fish Species"}
                </h2>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>Changes are saved directly to AquaTimbang's database.</p>
              </div>
              <button type="button" aria-label="Close form" disabled={busy} onClick={() => setShowForm(false)}
                style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#334155", fontSize: 21, width: 36, height: 36, cursor: "pointer", flexShrink: 0 }}>×</button>
            </div>
            <form onSubmit={save}>
              <div className="form-group">
                <label htmlFor="lgu-species-name">Common Name *</label>
                <input id="lgu-species-name" autoFocus required maxLength={100} value={form.name}
                  onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lgu-species-scientific">Scientific Name</label>
                <input id="lgu-species-scientific" maxLength={150} value={form.scientific_name}
                  onChange={(event) => setForm((old) => ({ ...old, scientific_name: event.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lgu-species-description">Description</label>
                <textarea id="lgu-species-description" rows={4} value={form.description}
                  onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
                <button type="button" disabled={busy} onClick={() => setShowForm(false)}
                  style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={busy}>
                  {busy ? "Saving..." : editing ? "Save Changes" : "Add Species"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function PriceEntry({
  entries,
  setEntries,
  notify,
  addLog,
  logActivity,
  refreshPrices,
  setPriceRecords,
}) {
  // Stores fish species retrieved from Django.
  const [fishSpecies, setFishSpecies] = useState([]);

  // Stores municipalities retrieved from Django.
  const [municipalities, setMunicipalities] = useState([]);

  // Stores real price records retrieved from Django.
  const [realEntries, setRealEntries] = useState([]);

  // Controls the loading state of the price table.
  const [loading, setLoading] = useState(true);

  // Get today's local date in YYYY-MM-DD format.
  const today = new Date().toLocaleDateString("en-CA");

  // Form used when creating a price record.
  const [form, setForm] = useState({
    date: today,
    municipality: "",
    species: "",
    price: "",
    source: "",
  });

  // Update one form field.
  const update = (key, value) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  // Get the authentication token saved during login.
  const getToken = () => {
    return localStorage.getItem("authToken");
  };

  // ------------------------------------------------------------
  // LOAD FISH SPECIES
  // ------------------------------------------------------------
  const loadFishSpecies = async () => {
    try {
      // Get the user's authentication token.
      const token = getToken();

      const response = await fetch(
        "http://127.0.0.1:8000/api/fish-species/",
        {
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Stop when Django returns an error.
      if (!response.ok) {
        throw new Error("Unable to load fish species.");
      }

      const data = await response.json();

      // Support normal and paginated Django REST responses.
      const speciesData = Array.isArray(data)
        ? data
        : data.results || [];

      // Only display active fish species.
      const activeSpecies = speciesData.filter(
        (species) => species.is_active !== false
      );

      setFishSpecies(activeSpecies);

      // Automatically select the first available species.
      if (activeSpecies.length > 0) {
        setForm((previous) => ({
          ...previous,
          species:
            previous.species ||
            String(activeSpecies[0].id),
        }));
      }
    } catch (error) {
      console.error("Fish species loading error:", error);
      notify("Unable to load fish species.");
    }
  };

  // ------------------------------------------------------------
  // LOAD MUNICIPALITIES
  // ------------------------------------------------------------
  const loadMunicipalities = async () => {
    try {
      // Get the user's authentication token.
      const token = getToken();

      const response = await fetch(
        "http://127.0.0.1:8000/api/municipalities/",
        {
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Stop when Django returns an error.
      if (!response.ok) {
        throw new Error("Unable to load municipalities.");
      }

      const data = await response.json();

      // Support normal and paginated Django REST responses.
      const municipalityData = Array.isArray(data)
        ? data
        : data.results || [];

      // Only display active municipalities.
      const activeMunicipalities = municipalityData.filter(
        (municipality) => municipality.is_active !== false
      );

      setMunicipalities(activeMunicipalities);

      // Get the currently logged-in user.
      const savedUser = localStorage.getItem("user");

      let currentUser = null;

      try {
        currentUser = savedUser
          ? JSON.parse(savedUser)
          : null;
      } catch (error) {
        // Show malformed localStorage data in the console.
        console.error("Unable to read saved user:", error);
      }

      // Determine the municipality assigned to the LGU officer.
      const userMunicipality =
        currentUser?.municipality?.name ||
        currentUser?.municipality;

      // Find the corresponding municipality from Django.
      const matchingMunicipality =
        activeMunicipalities.find(
          (municipality) =>
            municipality.name === userMunicipality
        );

      // Automatically select the officer's municipality.
      setForm((previous) => ({
        ...previous,
        municipality:
          previous.municipality ||
          (matchingMunicipality
            ? String(matchingMunicipality.id)
            : activeMunicipalities.length > 0
            ? String(activeMunicipalities[0].id)
            : ""),
      }));
    } catch (error) {
      console.error("Municipality loading error:", error);
      notify("Unable to load municipalities.");
    }
  };

  // ------------------------------------------------------------
  // LOAD REAL PRICE RECORDS
  // ------------------------------------------------------------
  const loadPriceEntries = async () => {
    try {
      // Show the loading message in the table.
      setLoading(true);

      const token = getToken();

      const response = await fetch(
        "http://127.0.0.1:8000/api/prices/",
        {
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Stop when Django returns an error.
      if (!response.ok) {
        throw new Error(
          `Unable to load price records. HTTP ${response.status}`
        );
      }

      const data = await response.json();

      // Support normal and paginated Django REST responses.
      const records = Array.isArray(data)
        ? data
        : data.results || [];

      // Keep the parent LGU dashboard synchronized with Django.
      if (setPriceRecords) {
        setPriceRecords(records);
      }

      // Only display records encoded today.
      const todayRecords = records.filter(
        (record) => record.recorded_date === today
      );

      setRealEntries(todayRecords);

      // Debug output for checking Django data.
      console.log(
        "Price Entry records from Django:",
        todayRecords
      );
    } catch (error) {
      console.error("Price record loading error:", error);
      notify("Unable to load today's price records.");
    } finally {
      // Stop the loading state.
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // LOAD EVERYTHING WHEN PRICE ENTRY OPENS
  // ------------------------------------------------------------
  useEffect(() => {
    // Load all dropdown and price-record data.
    loadFishSpecies();
    loadMunicipalities();
    loadPriceEntries();
  }, []);

  // ------------------------------------------------------------
  // SAVE PRICE
  // ------------------------------------------------------------
  const saveEntry = async () => {
    // Convert the entered price into a number.
    const price = Number(form.price);

    // Validate the selected fish species.
    if (!form.species) {
      notify("Please select a fish species.");
      return;
    }

    // Validate the selected municipality.
    if (!form.municipality) {
      notify("Please select a municipality.");
      return;
    }

    // Validate the selected date.
    if (!form.date) {
      notify("Please select a date.");
      return;
    }

    // Validate the entered price.
    if (
      !form.price ||
      Number.isNaN(price) ||
      price <= 0
    ) {
      notify("Enter a valid price per kilogram.");
      return;
    }

    // Prevent duplicate records for the same fish,
    // municipality, and date.
    const duplicate = realEntries.some(
      (record) =>
        Number(record.fish_species) ===
          Number(form.species) &&
        Number(record.municipality) ===
          Number(form.municipality) &&
        record.recorded_date === form.date
    );

    if (duplicate) {
      notify(
        "This fish already has a price for this municipality and date. Edit the existing record instead."
      );
      return;
    }

    try {
      const token = getToken();

      // Send the new price record to Django.
      const response = await fetch(
        "http://127.0.0.1:8000/api/prices/",
        {
          method: "POST",

          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },

          // These fields match the Django PriceRecord serializer.
          body: JSON.stringify({
            fish_species: Number(form.species),
            municipality: Number(form.municipality),
            price_per_kg: price,
            recorded_date: form.date,
            source:
              form.source ||
              "LGU Price Entry",
          }),
        }
      );

      const data = await response.json();

      // Handle validation errors returned by Django.
      if (!response.ok) {
        console.error(
          "Django validation error:",
          data
        );

        const message =
          data.detail ||
          data.non_field_errors?.[0] ||
          Object.values(data)?.[0]?.[0] ||
          "Unable to save the price.";

        notify(message);
        return;
      }

      // Reload the table directly from Django after saving.
      await loadPriceEntries();

      // Refresh the parent dashboard when available.
      if (refreshPrices) {
        await refreshPrices();
      }

      // Add the action to the local audit log.
      addLog(
        "Encoded price",
        data.fish_name,
        `₱${Number(data.price_per_kg).toFixed(2)} per kg`
      );

      // Add the action to recent user activity.
      logActivity(
        `Encoded price for ${data.fish_name}: ₱${Number(
          data.price_per_kg
        ).toFixed(2)}`
      );

      notify(
        `${data.fish_name} price saved successfully.`
      );

      // Clear only the price and source fields.
      setForm((previous) => ({
        ...previous,
        price: "",
        source: "",
      }));
    } catch (error) {
      console.error("Saving price error:", error);

      notify(
        "Unable to connect to the AquaTimbang server."
      );
    }
  };

  // ------------------------------------------------------------
  // EDIT PRICE
  // ------------------------------------------------------------
  const editPrice = async (record) => {
    // Ask the LGU officer for the new price.
    const input = window.prompt(
      `Enter the new price per kg for ${record.fish_name}:`,
      record.price_per_kg
    );

    // Stop when the user cancels.
    if (input === null) {
      return;
    }

    const newPrice = Number(input);

    // Validate the new price.
    if (
      Number.isNaN(newPrice) ||
      newPrice <= 0
    ) {
      notify("Enter a valid price.");
      return;
    }

    try {
      const token = getToken();

      // Update only the price field in Django.
      const response = await fetch(
        `http://127.0.0.1:8000/api/prices/${record.id}/`,
        {
          method: "PATCH",

          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            price_per_kg: newPrice,
          }),
        }
      );

      const data = await response.json();

      // Handle update errors.
      if (!response.ok) {
        console.error("Price update error:", data);

        notify(
          data.detail ||
            "Unable to update the price."
        );

        return;
      }

      // Reload the table from Django.
      await loadPriceEntries();

      // Refresh the parent dashboard when available.
      if (refreshPrices) {
        await refreshPrices();
      }

      // Record the update in the local log.
      addLog(
        "Edited price",
        record.fish_name,
        `₱${Number(
          record.price_per_kg
        ).toFixed(2)} → ₱${newPrice.toFixed(2)}`
      );

      logActivity(
        `Edited price for ${record.fish_name}`
      );

      notify(
        `${record.fish_name} price updated.`
      );
    } catch (error) {
      console.error(
        "Price update connection error:",
        error
      );

      notify(
        "Unable to connect to the AquaTimbang server."
      );
    }
  };

  // ------------------------------------------------------------
  // DELETE PRICE
  // ------------------------------------------------------------
  const removeEntry = async (record) => {
    // Confirm before permanently deleting the record.
    const confirmed = window.confirm(
      `Delete the price record for ${record.fish_name}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const token = getToken();

      // Delete the record from Django.
      const response = await fetch(
        `http://127.0.0.1:8000/api/prices/${record.id}/`,
        {
          method: "DELETE",

          headers: {
            Authorization: `Token ${token}`,
          },
        }
      );

      // Handle deletion errors.
      if (!response.ok) {
        let data = {};

        try {
          data = await response.json();
        } catch {
          // A DELETE response may contain no JSON.
        }

        console.error(
          "Price deletion error:",
          data
        );

        notify(
          data.detail ||
            "Unable to delete the price record."
        );

        return;
      }

      // Reload the table from Django.
      await loadPriceEntries();

      // Refresh the parent dashboard when available.
      if (refreshPrices) {
        await refreshPrices();
      }

      // Add the deletion to the audit log.
      addLog(
        "Deleted price",
        record.fish_name,
        `₱${Number(
          record.price_per_kg
        ).toFixed(2)}`
      );

      logActivity(
        `Deleted price for ${record.fish_name}`
      );

      notify(
        `${record.fish_name} price deleted.`
      );
    } catch (error) {
      console.error(
        "Price deletion connection error:",
        error
      );

      notify(
        "Unable to connect to the AquaTimbang server."
      );
    }
  };

  // Submit an existing draft for the LGU review workflow.
  // Requires Django POST /api/prices/<id>/submit/ to be implemented.
  const [submittingId, setSubmittingId] = useState(null);
  const submitForReview = async (record) => {
    if (String(record.status).toLowerCase() !== "draft") return;
    if (!window.confirm(`Submit ${record.fish_name} at ${peso(record.price_per_kg)} for review?`)) return;
    setSubmittingId(record.id);
    try {
      const token = getToken();
      if (!token) throw new Error("Please log in again.");
      const response = await fetch(`http://127.0.0.1:8000/api/prices/${record.id}/submit-review/`, {
        method: "POST",
        headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Submission failed (HTTP ${response.status}).`);
      }
      await loadPriceEntries();
      if (refreshPrices) await refreshPrices();
      notify(`${record.fish_name} submitted for review.`);
    } catch (error) {
      console.error("Submit for review failed:", error);
      notify(error.message);
    } finally {
      setSubmittingId(null);
    }
  };

  // ------------------------------------------------------------
  // PRICE ENTRY INTERFACE
  // ------------------------------------------------------------
  return (
    <>
      <div className="page-title">
        <div>
          <h2>Daily Price Entry</h2>

          <p>
            Encode today's official fish prices.
            Records are stored directly in AquaTimbang.
          </p>
        </div>
      </div>

      <div className="config-grid">
        {/* NEW PRICE ENTRY */}
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">
              ✎
            </div>

            <div>
              <h3>New Price Entry</h3>
              <p>Encode a price for a single species</p>
            </div>
          </div>

          {/* DATE */}
          <div className="form-group">
            <label>Date</label>

            <input
              type="date"
              value={form.date}
              max={today}
              onChange={(event) =>
                update("date", event.target.value)
              }
            />
          </div>

          {/* MUNICIPALITY */}
          <div className="form-group">
            <label>Municipality</label>

            <select
              value={form.municipality}
              onChange={(event) =>
                update(
                  "municipality",
                  event.target.value
                )
              }
            >
              {municipalities.length === 0 && (
                <option value="">
                  No municipalities available
                </option>
              )}

              {municipalities.map(
                (municipality) => (
                  <option
                    key={municipality.id}
                    value={municipality.id}
                  >
                    {municipality.name}
                  </option>
                )
              )}
            </select>
          </div>

          {/* FISH SPECIES */}
          <div className="form-group">
            <label>Fish Species</label>

            <select
              value={form.species}
              onChange={(event) =>
                update(
                  "species",
                  event.target.value
                )
              }
            >
              {fishSpecies.length === 0 && (
                <option value="">
                  No fish species available
                </option>
              )}

              {fishSpecies.map((species) => (
                <option
                  key={species.id}
                  value={species.id}
                >
                  {species.name}
                </option>
              ))}
            </select>
          </div>

          {/* PRICE */}
          <div className="form-group">
            <label>Price per Kilogram</label>

            <div className="input-with-unit">
              <span>₱</span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                placeholder="0.00"
                onChange={(event) =>
                  update(
                    "price",
                    event.target.value
                  )
                }
              />
            </div>
          </div>

          {/* SOURCE */}
          <div className="form-group">
            <label>Source / Market</label>

            <input
              type="text"
              value={form.source}
              placeholder="e.g. Pasil Fish Market"
              onChange={(event) =>
                update(
                  "source",
                  event.target.value
                )
              }
            />
          </div>

          <button
            className="primary-btn full-btn"
            onClick={saveEntry}
          >
            Save Price Entry
          </button>
        </div>

        {/* TODAY'S DATABASE RECORDS */}
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">
              ▤
            </div>

            <div>
              <h3>Encoded Today</h3>
              <p>Real price records from Django</p>
            </div>
          </div>

          <table className="inner-table">
            <thead>
              <tr>
                <th>SPECIES</th>
                <th>PRICE</th>
                <th>SOURCE</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="4"
                    className="empty-row"
                  >
                    Loading price records...
                  </td>
                </tr>
              ) : realEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="empty-row"
                  >
                    No price records encoded today.
                  </td>
                </tr>
              ) : (
                realEntries.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>
                        {record.fish_name}
                      </strong>
                    </td>

                    <td>
                      ₱
                      {Number(
                        record.price_per_kg
                      ).toFixed(2)}
                    </td>

                    <td>
                      {record.source || "—"}
                    </td>

                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
                          {record.status || "Unknown"}
                        </span>
                        {String(record.status).toLowerCase() === "draft" && (
                          <button type="button" className="primary-btn"
                            disabled={submittingId !== null}
                            onClick={() => submitForReview(record)}
                            style={{ padding: "7px 10px", fontSize: 12, whiteSpace: "nowrap" }}>
                            {submittingId === record.id ? "Submitting..." : "Submit for Review"}
                          </button>
                        )}
                      <div className="action-icons">
                        {/* Edit this Django price record. */}
                        <button
                          title="Edit"
                          onClick={() =>
                            editPrice(record)
                          }
                        >
                          ✎
                        </button>

                        {/* Delete this Django price record. */}
                        <button
                          title="Delete"
                          onClick={() =>
                            removeEntry(record)
                          }
                        >
                          ✕
                        </button>
                      </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="info-box">
            These records are stored in the
            AquaTimbang Django database.
          </div>
        </div>
      </div>
    </>
  );
}
function ReviewPublish({
  // Real price records loaded from Django.
  priceRecords,
  refreshPrices,

  // Existing helper functions.
  entries,
  setEntries,
  notify,
  addLog,
  addValidation,
  logActivity,
}) {
  // Controls the currently selected tab.
  const [tab, setTab] = useState("For Review");

  // Stores the text entered in the search box.
  const [search, setSearch] = useState("");

  // Use the real Django price records whenever they are available.
  // This prevents the Review & Publish page from depending only
  // on the old frontend demo entries.
  const records = priceRecords.length > 0 ? priceRecords : entries;

  // Convert a Django PriceRecord into the format expected
  // by the existing Review & Publish table.
  const normalizedRecords = records.map((record) => {
    // Detect whether this is a Django database record.
    const isDjangoRecord =
      record.price_per_kg !== undefined ||
      record.fish_name !== undefined;

    if (!isDjangoRecord) {
      return record;
    }

    // Convert Django status names into the frontend status names.
    let displayStatus = record.status;

    if (record.status === "pending") {
      displayStatus = "For Review";
    } else if (record.status === "draft") {
      displayStatus = "Draft";
    } else if (record.status === "approved") {
      displayStatus = "Approved";
    } else if (record.status === "published") {
      displayStatus = "Published";
    } else if (record.status === "rejected") {
      displayStatus = "Rejected";
    } else if (record.status === "flagged") {
      displayStatus = "Flagged";
    }

    return {
      ...record,

      // Fields used by the existing React table.
      species:
        record.fish_name ||
        record.species ||
        "Unknown Fish",

      price: Number(
        record.price_per_kg ??
        record.price ??
        0
      ),

      // Previous price is currently unavailable from this API.
      // Use the existing value when present.
      // Get the previous published price from Django.
      // Keep null when no historical price exists.

      // Previous published price returned by Django.
      
// Get the previous published price from Django.
prev: record.previous_price != null
  ? Number(record.previous_price)
  : null,

// Get the price difference from Django.
priceChange: record.price_change != null
  ? Number(record.price_change)
  : null,

// Get the percentage change from Django.
percentageChange: record.percentage_change != null
  ? Number(record.percentage_change)
  : null,


      status: displayStatus,

      // Keep the original Django status for API operations.
      djangoStatus: record.status,
    };
  });

  // Find all flagged records.
  const flagged = normalizedRecords.filter(
    (record) => record.status === "Flagged"
  );

  // Filter records according to the selected tab.
  const visible = normalizedRecords
    .filter((record) => {
      if (tab === "For Review") {
        return (
          record.status === "For Review" ||
          record.status === "Flagged" ||
          record.status === "Approved"
        );
      }

      if (tab === "Published") {
        return record.status === "Published";
      }

      if (tab === "Rejected") {
        return record.status === "Rejected";
      }

      return false;
    })
    .filter((record) =>
      String(record.species || "")
        .toLowerCase()
        .includes(search.toLowerCase())
    );

  // Count records waiting for review.
  const reviewCount = normalizedRecords.filter(
    (record) =>
      record.status === "For Review" ||
      record.status === "Flagged" ||
      record.status === "Approved"
  ).length;

  // Debugging: check what ReviewPublish actually receives.
console.log("ReviewPublish priceRecords:", priceRecords);
console.log("ReviewPublish normalizedRecords:", normalizedRecords);
console.log("ReviewPublish reviewCount:", reviewCount);

// Check the previous price of Bangus record #8.
const testRecord = normalizedRecords.find((record) => record.id === 8);

console.log("Bangus #8 comparison:", {
  prev: testRecord?.prev,
  priceChange: testRecord?.priceChange,
  percentageChange: testRecord?.percentageChange,
  djangoPrevious: testRecord?.previous_price,
});

  // Approve a price record. //////////////////////
  const approve = async (record) => {
    // Ask for confirmation when approving a flagged price.
    if (
      record.status === "Flagged" &&
      !window.confirm(
        `${record.species} is flagged at ${peso(
          record.price
        )}. Approve anyway?`
      )
    ) {
      return;
    }

    try {
      // Get the login token.
      const token = localStorage.getItem("authToken");

      if (!token) {
        notify("No login token found.");
        return;
      }

      // Send the approval request to Django.
      const response = await fetch(
        `http://127.0.0.1:8000/api/prices/${record.id}/approve/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        console.error(
          "Approve error:",
          response.status,
          errorData
        );

        notify("Unable to approve this price.");
        return;
      }

      // Refresh the records so the UI matches Django.
      if (refreshPrices) {
        await refreshPrices();
      }

      if (addLog) {
        addLog(
          "Approved price",
          record.species,
          peso(record.price)
        );
      }

      if (addValidation) {
        addValidation(
          "Approved price entry",
          `${record.species} at ${peso(record.price)}`
        );
      }

      if (logActivity) {
        logActivity(
          `Approved price for ${record.species}`
        );
      }

      notify(
        `${record.species} approved. Publish to make it live.`
      );
    } catch (error) {
      console.error("Approve request failed:", error);
      notify("Unable to approve this price.");
    }
  }; ////////////////////////

  // Reject a price record.
  const reject = async (record) => {
    if (
      !window.confirm(
        `Reject the ${record.species} entry?`
      )
    ) {
      return;
    }

    try {
      // Get the login token.
      const token = localStorage.getItem("authToken");

      if (!token) {
        notify("No login token found.");
        return;
      }

      // Send the rejection request to Django.
      const response = await fetch(
        `http://127.0.0.1:8000/api/prices/${record.id}/reject/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },

          // Send a simple rejection reason.
          body: JSON.stringify({
            rejection_reason:
              "Rejected by LGU officer during review.",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        console.error(
          "Reject error:",
          response.status,
          errorData
        );

        notify("Unable to reject this price.");
        return;
      }

      // Refresh records from Django.
      if (refreshPrices) {
        await refreshPrices();
      }

      if (addLog) {
        addLog(
          "Rejected price",
          record.species,
          peso(record.price),
          "Rejected"
        );
      }

      if (addValidation) {
        addValidation(
          "Rejected price entry",
          `${record.species} at ${peso(record.price)}`
        );
      }

      if (logActivity) {
        logActivity(
          `Rejected price for ${record.species}`
        );
      }

      notify(`${record.species} rejected.`);
    } catch (error) {
      console.error("Reject request failed:", error);
      notify("Unable to reject this price.");
    }
  };

  // Publish every approved price.
  const publishAll = async () => {
    const approved = normalizedRecords.filter(
      (record) => record.status === "Approved"
    );

    if (approved.length === 0) {
      notify(
        "No approved entries to publish. Approve entries first."
      );
      return;
    }

    try {
      // Get the login token.
      const token = localStorage.getItem("authToken");

      if (!token) {
        notify("No login token found.");
        return;
      }

      // Publish each approved database record.
      for (const record of approved) {
        const response = await fetch(
          `http://127.0.0.1:8000/api/prices/${record.id}/publish/`,
          {
            method: "POST",
            headers: {
              Authorization: `Token ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          console.error(
            `Unable to publish record ${record.id}.`
          );

          notify(
            `Unable to publish ${record.species}.`
          );

          return;
        }
      }

      // Reload the latest database records.
      if (refreshPrices) {
        await refreshPrices();
      }

      if (addLog) {
        addLog(
          "Published prices",
          "—",
          `${approved.length} entries published`
        );
      }

      if (addValidation) {
        addValidation(
          "Published daily prices",
          `${approved.length} entries published`
        );
      }

      if (logActivity) {
        logActivity(
          `Published ${approved.length} daily price entries`
        );
      }

      notify(
        `${approved.length} prices published. Vendors can now see them.`
      );
    } catch (error) {
      console.error("Publish request failed:", error);
      notify("Unable to publish approved prices.");
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Review &amp; Publish</h2>

          <p>
            Validate encoded prices before publishing them
            as official LGU rates.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={publishAll}
        >
          ✔ Publish Approved Prices
        </button>
      </div>

      {flagged.length > 0 && (
        <div className="notice">
          <div className="notice-icon">!</div>

          <div>
            <strong>
              {flagged.length} entry flagged for validation
            </strong>

            <p>
              {flagged
                .map(
                  (record) =>
                    `${record.species} at ${peso(
                      record.price
                    )}`
                )
                .join(", ")}
              {" — "}
              outside the configured price bounds.
            </p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="tabs">
          {[
            "For Review",
            "Published",
            "Rejected",
          ].map((currentTab) => (
            <button
              key={currentTab}
              className={
                tab === currentTab
                  ? "tab active-tab"
                  : "tab"
              }
              onClick={() => setTab(currentTab)}
            >
              {currentTab}

              {currentTab === "For Review" && (
                <span className="tab-count">
                  {reviewCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="table-tools">
          <div className="search-box">
            🔍

            <input
              type="text"
              placeholder="Search entries..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>SPECIES</th>
              <th>PRICE / KG</th>
              <th>PREVIOUS</th>
              <th>CHANGE</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="empty-row"
                >
                  No entries in this tab.
                </td>
              </tr>
            ) : (
              visible.map((record) => {
                // Use Django's historical price comparison values.
                const hasPrevious = record.prev != null && record.prev > 0;
                const diff = hasPrevious
                  ? (record.priceChange ?? record.price - record.prev)
                  : null;
                const percent = hasPrevious
                  ? (record.percentageChange ?? (diff / record.prev) * 100)
                  : null;
                const up = diff !== null && diff >= 0;

                return (
                  <tr key={record.id}>
                    <td>
                      <div className="species-cell">
                        <div className="fish-avatar">
                          {record.species
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {record.species}
                          </strong>

                          <small>
                            {SCI_NAMES[
                              record.species
                            ] || ""}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong
                        className={
                          record.status === "Flagged"
                            ? "flag-price"
                            : ""
                        }
                      >
                        {peso(record.price)}
                      </strong>
                    </td>

                    <td>
                      {hasPrevious ? peso(record.prev) : "—"}
                    </td>

                    <td
                      className={
                        hasPrevious
                          ? diff > 0 ? "up" : diff < 0 ? "down" : ""
                          : ""
                      }
                    >
                      {hasPrevious
                        ? `${diff > 0 ? "▲ +" : diff < 0 ? "▼ -" : ""}${peso(Math.abs(diff))} (${percent > 0 ? "+" : ""}${percent.toFixed(2)}%)`
                        : "—"}
                    </td>

                    <td>
                      <span
                        className={`badge ${record.status
                          .toLowerCase()
                          .replace(/\s/g, "")}`}
                      >
                        {record.status}
                      </span>
                    </td>

                    <td>
                      {record.status === "Published" ||
                      record.status === "Rejected" ? (
                        <span className="muted-text">
                          No actions
                        </span>
                      ) : record.status === "Approved" ? (
                        <span className="muted-text">
                          Ready to publish
                        </span>
                      ) : (
                        <div className="action-buttons">
                          <button
                            className="approve"
                            onClick={() =>
                              approve(record)
                            }
                          >
                            Approve
                          </button>

                          <button
                            className="reject"
                            onClick={() =>
                              reject(record)
                            }
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   EXTERNAL FACTORS
   ================================================================ */

function ExternalFactors({ factors, setFactors, notify, addLog }) {
  const [form, setForm] = useState({ date: "2026-09-16", fuel: "66.80", weather: "Cloudy", holiday: true, note: "Local fiesta — Barangay Pasil" });
  const update = (key, val) => setForm({ ...form, [key]: val });

  const save = () => {
    const fuel = parseFloat(form.fuel);
    if (!form.date || isNaN(fuel) || fuel <= 0) {
      notify("Enter a valid date and fuel price.");
      return;
    }
    const formatted = new Date(form.date).toLocaleDateString("en-PH");
    setFactors((prev) => [{ id: Date.now(), date: formatted, fuel, weather: form.weather, holiday: form.holiday, note: form.note }, ...prev]);
    addLog("Logged external factor", "—", `Fuel ${peso(fuel)}, ${form.weather}`);
    notify("External factor saved.");
  };

  const remove = (f) => {
    if (!window.confirm(`Delete the entry for ${f.date}?`)) return;
    setFactors((prev) => prev.filter((x) => x.id !== f.id));
    notify("Entry deleted.");
  };

  const edit = (f) => {
    const input = window.prompt(`New fuel price for ${f.date}:`, f.fuel);
    if (input === null) return;
    const fuel = parseFloat(input);
    if (isNaN(fuel) || fuel <= 0) {
      notify("Invalid fuel price.");
      return;
    }
    setFactors((prev) => prev.map((x) => (x.id === f.id ? { ...x, fuel } : x)));
    notify("Entry updated.");
  };

  return (
    <>
      <div className="page-title">
        <div><h2>External Factors</h2><p>Log fuel prices, weather, and holidays used by the forecasting model.</p></div>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">☁</div>
            <div><h3>Log External Factor</h3><p>Record conditions that affect fish supply</p></div>
          </div>

          <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></div>
          <div className="form-group">
            <label>Fuel Price per Liter</label>
            <div className="input-with-unit"><span>₱</span><input type="number" step="0.01" value={form.fuel} onChange={(e) => update("fuel", e.target.value)} /></div>
          </div>
          <div className="form-group">
            <label>Weather Condition</label>
            <select value={form.weather} onChange={(e) => update("weather", e.target.value)}>
              <option>Sunny</option><option>Cloudy</option><option>Rainy</option><option>Stormy</option>
            </select>
          </div>
          <div className="toggle-row">
            <div><strong>Holiday or Fiesta</strong><p>Mark if this date is a local holiday.</p></div>
            <label className="switch"><input type="checkbox" checked={form.holiday} onChange={(e) => update("holiday", e.target.checked)} /><span className="slider"></span></label>
          </div>
          <div className="form-group"><label>Notes</label><input value={form.note} onChange={(e) => update("note", e.target.value)} /></div>
          <button className="primary-btn full-btn" onClick={save}>Save Factor</button>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon purple">▤</div>
            <div><h3>Recent Entries</h3><p>Latest logged external conditions</p></div>
          </div>

          <table className="inner-table">
            <thead><tr><th>DATE</th><th>FUEL</th><th>WEATHER</th><th>HOLIDAY</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {factors.map((f) => (
                <tr key={f.id}>
                  <td>{f.date}</td>
                  <td><strong>{peso(f.fuel)}</strong></td>
                  <td>{f.weather}</td>
                  <td>{f.holiday ? <span className="badge pending">Yes</span> : <span className="badge inactive">No</span>}</td>
                  <td>
                    <div className="action-icons">
                      <button title="Edit" onClick={() => edit(f)}>✎</button>
                      <button title="Delete" onClick={() => remove(f)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="info-box purple-info">These values are used as external inputs in the forecasting module to improve price predictions.</div>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   FISHERFOLK MANAGEMENT
   ================================================================ */

function FisherfolkManagement({ fisherfolk, notify }) {
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);

  const visible = fisherfolk.filter((f) =>
    [f.name, f.municipality].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const initials = (name) => name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Fisherfolk Management</h2>
          <p>Monitor the fisherfolk accounts registered under your municipality.</p>
        </div>
      </div>

      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Fisherfolk Profile</h3>
              <button className="modal-close" onClick={() => setViewing(null)}>✕</button>
            </div>

            <div className="profile-head">
              <div className="table-avatar profile-avatar">{initials(viewing.name)}</div>
              <div>
                <strong>{viewing.name}</strong>
                <p>{viewing.municipality}</p>
                <div className="profile-badges">
                  <span className={`badge ${viewing.status.toLowerCase()}`}>{viewing.status}</span>
                </div>
              </div>
            </div>

            <div className="profile-grid">
              <div className="profile-field"><span>Registration Date</span><strong>{viewing.registeredDate}</strong></div>
              <div className="profile-field"><span>Price Suggestions</span><strong>{viewing.suggestionCount}</strong></div>
              <div className="profile-field"><span>Last Submission</span><strong>{viewing.lastSubmission}</strong></div>
              <div className="profile-field"><span>Account Status</span><strong>{viewing.status}</strong></div>
            </div>

            <div className="mini-head">Account Activity</div>
            <div className="history-list">
              {viewing.activity.length === 0 ? (
                <p className="empty-row">No recorded activity yet.</p>
              ) : (
                viewing.activity.map((a, i) => (
                  <div className="history-item" key={i}>
                    <div><strong>{a.action}</strong></div>
                    <small>{a.date}</small>
                  </div>
                ))
              )}
            </div>

            <div className="button-row">
              <button className="primary-btn full-btn" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="table-tools">
          <div className="search-box">
            🔍
            <input type="text" placeholder="Search fisherfolk..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>NAME</th>
              <th>MUNICIPALITY</th>
              <th>REGISTRATION DATE</th>
              <th>STATUS</th>
              <th>SUGGESTIONS</th>
              <th>LAST SUBMISSION</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan="7" className="empty-row">No fisherfolk found.</td></tr>
            ) : (
              visible.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="user-cell">
                      <div className="table-avatar">{initials(f.name)}</div>
                      <strong>{f.name}</strong>
                    </div>
                  </td>
                  <td>{f.municipality}</td>
                  <td>{f.registeredDate}</td>
                  <td><span className={`badge ${f.status.toLowerCase()}`}>{f.status}</span></td>
                  <td>{f.suggestionCount}</td>
                  <td>{f.lastSubmission}</td>
                  <td>
                    <div className="action-icons">
                      <button title="View Activity" onClick={() => setViewing(f)}>👁</button>
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
   PRICE SUGGESTIONS
   ================================================================ */


function PriceSuggestions({
  suggestions,
  setSuggestions,
  referencePrices,
  setReferencePrices,
  notify,
  addValidation,
  logActivity,
}) {
  const [speciesFilter, setSpeciesFilter] = useState("All Species");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [search, setSearch] = useState("");

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await listVendorSuggestions();
      setRecords(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const visible = records
    .filter(
      (s) =>
        speciesFilter === "All Species" ||
        s.species === speciesFilter
    )
    .filter(
      (s) =>
        statusFilter === "All Statuses" ||
        s.status === statusFilter
    )
    .filter((s) =>
      [
        s.species,
        s.submittedBy,
        s.comment,
        s.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );

  const speciesNames = [
    ...new Set([
      ...SPECIES_LIST,
      ...records.map((s) => s.species).filter(Boolean),
    ]),
  ];

  const computedAverage = (species) => {
    const rows = records.filter(
      (s) =>
        s.species === species &&
        s.status !== "Rejected"
    );

    if (!rows.length) return null;

    return (
      rows.reduce(
        (total, row) =>
          total + Number(row.suggestedPrice || 0),
        0
      ) / rows.length
    );
  };

  const statusClass = (status) => {
    if (status === "Adopted") return "success";
    if (status === "Rejected") return "deleted";
    if (status === "Reviewed") return "approved";
    return "pending";
  };

  const saveReview = async (suggestion, decision, feedback) => {
    try {
      setProcessingId(suggestion.id);
      setError("");

      await reviewVendorSuggestion(
        suggestion.id,
        decision,
        feedback
      );

      await loadSuggestions();

      const labels = {
        reviewed: "Reviewed",
        adopted: "Adopted",
        rejected: "Rejected",
      };

      const label = labels[decision];

      addValidation?.(
        `${label} vendor suggestion`,
        `${suggestion.species} by ${
          suggestion.submittedBy || "Vendor"
        }: ${peso(suggestion.suggestedPrice)}`
      );

      logActivity?.(
        `${label} suggestion for ${suggestion.species}`
      );

      notify?.(`Suggestion ${label.toLowerCase()} successfully.`);
    } catch (err) {
      setError(err.message);
      notify?.(`Unable to save review: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const markReviewed = async (suggestion) => {
    const feedback = window.prompt(
      `Review ${suggestion.species} from ${
        suggestion.submittedBy || "Vendor"
      }.\n\nEnter LGU feedback:`,
      suggestion.lguFeedback || ""
    );

    if (feedback === null) return;

    await saveReview(suggestion, "reviewed", feedback);
  };

  const reject = async (suggestion) => {
    const feedback = window.prompt(
      `Why are you rejecting the ${
        suggestion.species
      } suggestion of ${peso(suggestion.suggestedPrice)}?`
    );

    if (feedback === null) return;

    if (!feedback.trim()) {
      notify?.("Please provide a rejection reason.");
      return;
    }

    await saveReview(
      suggestion,
      "rejected",
      feedback.trim()
    );
  };

  const adoptAsReference = async (suggestion) => {
    const confirmed = window.confirm(
      `Adopt the ${peso(
        suggestion.suggestedPrice
      )} suggestion for ${
        suggestion.species
      }?\n\nThis records the LGU decision but does NOT automatically publish an official reference price.`
    );

    if (!confirmed) return;

    const feedback = window.prompt(
      "Enter feedback for the vendor:",
      "Suggestion adopted for reference."
    );

    if (feedback === null) return;

    await saveReview(
      suggestion,
      "adopted",
      feedback.trim()
    );
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Suggestions</h2>
          <p>
            Review actual vendor submissions and
            computed community averages.
          </p>
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
          <button
            type="button"
            onClick={loadSuggestions}
            style={{ marginLeft: 12 }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Computed Average by Species</h3>
            <p>
              Based on actual non-rejected vendor submissions
            </p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>SPECIES</th>
              <th>COMPUTED AVERAGE</th>
              <th>SUBMISSIONS</th>
            </tr>
          </thead>

          <tbody>
            {speciesNames.map((species) => {
              const average = computedAverage(species);
              const count = records.filter(
                (s) =>
                  s.species === species &&
                  s.status !== "Rejected"
              ).length;

              return (
                <tr key={species}>
                  <td>
                    <strong>{species}</strong>
                  </td>
                  <td>
                    {average !== null
                      ? peso(average)
                      : "—"}
                  </td>
                  <td>{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="panel"
        style={{ marginTop: 18 }}
      >
        <div className="table-tools">
          <div className="search-box">
            🔍
            <input
              type="text"
              placeholder="Search species or submitter..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <select
            value={speciesFilter}
            onChange={(event) =>
              setSpeciesFilter(event.target.value)
            }
          >
            <option>All Species</option>
            {speciesNames.map((species) => (
              <option key={species}>
                {species}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option>All Statuses</option>
            <option>Pending Review</option>
            <option>Reviewed</option>
            <option>Adopted</option>
            <option>Rejected</option>
          </select>

          <button
            type="button"
            onClick={loadSuggestions}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>SPECIES</th>
              <th>SUGGESTED PRICE</th>
              <th>SUBMITTED BY</th>
              <th>COMMENT</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="empty-row">
                  Loading suggestions...
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-row">
                  No submissions match these filters.
                </td>
              </tr>
            ) : (
              visible.map((suggestion) => {
                const canReview =
                  suggestion.status === "Pending Review" ||
                  suggestion.status === "Reviewed";

                const busy =
                  processingId === suggestion.id;

                return (
                  <tr key={suggestion.id}>
                    <td>
                      {suggestion.date
                        ? fmtDate(suggestion.date)
                        : "—"}
                    </td>

                    <td>
                      <strong>
                        {suggestion.species || "—"}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {peso(suggestion.suggestedPrice)}
                      </strong>
                    </td>

                    <td>
                      {suggestion.submittedBy || "Vendor"}
                    </td>

                    <td>
                      {suggestion.comment || (
                        <span className="muted-text">
                          —
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        className={`badge ${statusClass(
                          suggestion.status
                        )}`}
                      >
                        {suggestion.status}
                      </span>
                    </td>

                    <td>
                      {canReview ? (
                        <div className="action-icons">
                          <button
                            type="button"
                            title="Mark Reviewed"
                            disabled={busy}
                            onClick={() =>
                              markReviewed(suggestion)
                            }
                          >
                            👁
                          </button>

                          <button
                            type="button"
                            title="Adopt Suggestion"
                            disabled={busy}
                            onClick={() =>
                              adoptAsReference(suggestion)
                            }
                          >
                            ✔
                          </button>

                          <button
                            type="button"
                            title="Reject Suggestion"
                            disabled={busy}
                            onClick={() =>
                              reject(suggestion)
                            }
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <span className="muted-text">
                          {suggestion.lguFeedback ||
                            "No actions"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


/* ================================================================
   OFFICIAL REFERENCE PRICES
   ================================================================ */

function OfficialReferencePrices({ referencePrices, setReferencePrices, notify, addValidation, logActivity }) {
  const [showForm, setShowForm] = useState(false);
  const [target, setTarget] = useState(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const openPublish = (r) => {
    setTarget(r);
    setPrice(String(r.price));
    setNote("");
    setShowForm(true);
  };

  const publish = () => {
    const value = parseFloat(price);
    if (isNaN(value) || value <= 0) {
      notify("Enter a valid price.");
      return;
    }

    setReferencePrices((prev) =>
      prev.map((r) => (r.id === target.id ? { ...r, price: value, publishedDate: new Date().toLocaleDateString("en-PH"), publishedBy: ME } : r))
    );

    addValidation(
      value === target.price ? "Re-confirmed reference price" : "Published corrected reference price",
      `${target.species}: ${peso(target.price)} → ${peso(value)}${note ? ` — ${note}` : ""}`
    );
    logActivity(`Published reference price for ${target.species}: ${peso(value)}`);
    notify(`${target.species} reference price published.`);
    setShowForm(false);
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Official Reference Prices</h2>
          <p>The current published reference price per species — separate from daily market entries.</p>
        </div>
      </div>

      {showForm && target && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Publish Reference Price — {target.species}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Current Reference Price</label>
              <div className="locked-field">{peso(target.price)}</div>
            </div>

            <div className="form-group">
              <label>New Reference Price per KG</label>
              <div className="input-with-unit"><span>₱</span><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            </div>

            <div className="form-group">
              <label>Note (optional, for the audit trail)</label>
              <input value={note} placeholder="Reason for this correction or update" onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primary-btn" onClick={publish}>Publish</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr><th>SPECIES</th><th>REFERENCE PRICE</th><th>LAST PUBLISHED</th><th>PUBLISHED BY</th><th>ACTIONS</th></tr>
          </thead>
          <tbody>
            {referencePrices.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.species}</strong></td>
                <td><strong>{peso(r.price)}</strong></td>
                <td>{r.publishedDate}</td>
                <td>{r.publishedBy}</td>
                <td>
                  <div className="action-icons">
                    <button title="Publish / Correct" onClick={() => openPublish(r)}>✎</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   PRICE TRENDS (broader LGU view)
   ================================================================ */

function PriceTrends({ priceHistory }) {
  const [species, setSpecies] = useState(SPECIES_LIST[0]);
  const [range, setRange] = useState("30");

  const rows = priceHistory[species].slice(-Number(range));
  const prices = rows.map((r) => r.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = last - first;
  const pctChange = (change / first) * 100;
  const max = Math.max(...prices, 1);

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Trends</h2>
          <p>A broader view of price movement across all species, for oversight and planning.</p>
        </div>
        <div className="filter-row">
          <select className="date-input" value={species} onChange={(e) => setSpecies(e.target.value)}>
            {SPECIES_LIST.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="date-input" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon blue">₱</div><div><span>Average Price</span><h2>{peso(avg)}</h2></div></div>
        <div className="stat-card"><div className="stat-icon orange">↑</div><div><span>Highest Price</span><h2>{peso(high)}</h2></div></div>
        <div className="stat-card"><div className="stat-icon green">↓</div><div><span>Lowest Price</span><h2>{peso(low)}</h2></div></div>
        <div className="stat-card">
          <div className={`stat-icon ${change >= 0 ? "purple" : "green"}`}>{change >= 0 ? "▲" : "▼"}</div>
          <div>
            <span>Price Change</span>
            <h2 className={change >= 0 ? "up" : "down"}>{change >= 0 ? "+" : ""}{peso(change)}</h2>
            <small>{pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}% over range</small>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h3>{species} — Price History</h3><p>Last {range} days</p></div>
        </div>
        <div className="chart-area">
          <div className="chart-placeholder">
            <div className="bars">
              {rows.map((r, i) => (
                <div key={i} className="bar" style={{ height: `${20 + (r.price / max) * 75}%` }} title={peso(r.price)}></div>
              ))}
            </div>
            <p className="chart-note">Hover a bar to see that day's price.</p>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <div><h3>All Species — Percentage Change</h3><p>Over the last {range} days</p></div>
        </div>
        <table>
          <thead><tr><th>SPECIES</th><th>START PRICE</th><th>CURRENT PRICE</th><th>CHANGE</th><th>% CHANGE</th></tr></thead>
          <tbody>
            {SPECIES_LIST.map((sp) => {
              const r = priceHistory[sp].slice(-Number(range));
              const p = r.map((x) => x.price);
              const d = p[p.length - 1] - p[0];
              const pc = (d / p[0]) * 100;
              return (
                <tr key={sp}>
                  <td><strong>{sp}</strong></td>
                  <td>{peso(p[0])}</td>
                  <td>{peso(p[p.length - 1])}</td>
                  <td className={d >= 0 ? "up" : "down"}>{d >= 0 ? "+" : ""}{peso(d)}</td>
                  <td className={pc >= 0 ? "up" : "down"}>{pc >= 0 ? "+" : ""}{pc.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   PRICE COMPARISON
   ================================================================ */

function PriceComparison({ marketPrices }) {
  const [species, setSpecies] = useState(SPECIES_LIST[0]);

  const rows = MARKETS.map((mk) => ({ market: mk, price: marketPrices[mk][species] }));
  const highest = Math.max(...rows.map((r) => r.price));
  const lowest = Math.min(...rows.map((r) => r.price));

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Comparison</h2>
          <p>Compare current prices for a species across every market you oversee.</p>
        </div>
        <select className="date-input" value={species} onChange={(e) => setSpecies(e.target.value)}>
          {SPECIES_LIST.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h3>{species} — Price by Market</h3><p>Today's rates</p></div>
        </div>
        <table>
          <thead><tr><th>MARKET</th><th>PRICE / KG</th><th>VS. HIGHEST</th><th>NOTE</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.market}>
                <td><strong>{r.market}</strong></td>
                <td><strong>{peso(r.price)}</strong></td>
                <td className={r.price === highest ? "" : "down"}>
                  {r.price === highest ? "—" : `-${peso(highest - r.price)}`}
                </td>
                <td>
                  {r.price === highest && <span className="badge accent">Highest</span>}
                  {r.price === lowest && <span className="badge success">Lowest</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   PRICE ANOMALIES
   ================================================================ */

function PriceAnomalies({ entries, suggestions }) {
  const anomalousEntries = entries.filter((e) => e.price < MIN_PRICE || e.price > MAX_PRICE);

  const suggestionAnomalies = SPECIES_LIST.flatMap((sp) => {
    const rows = suggestions.filter((s) => s.species === sp);
    if (rows.length < 3) return [];
    const avg = rows.reduce((a, b) => a + b.suggestedPrice, 0) / rows.length;
    return rows.filter((r) => Math.abs(r.suggestedPrice - avg) / avg > 0.3).map((r) => ({ ...r, avg }));
  });

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Anomalies</h2>
          <p>Entries and suggestions that fall well outside expected price ranges.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h3>Flagged Daily Entries</h3><p>Outside the {peso(MIN_PRICE)} – {peso(MAX_PRICE)} validation range</p></div>
        </div>
        <table>
          <thead><tr><th>SPECIES</th><th>PRICE</th><th>MARKET</th><th>STATUS</th></tr></thead>
          <tbody>
            {anomalousEntries.length === 0 ? (
              <tr><td colSpan="4" className="empty-row">No anomalous entries right now.</td></tr>
            ) : (
              anomalousEntries.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.species}</strong></td>
                  <td className="flag-price"><strong>{peso(e.price)}</strong></td>
                  <td>{e.market}</td>
                  <td><span className="badge flagged">{e.status}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <div><h3>Unusual Fisherfolk Suggestions</h3><p>More than 30% away from that species' community average</p></div>
        </div>
        <table>
          <thead><tr><th>SPECIES</th><th>SUGGESTED PRICE</th><th>COMMUNITY AVERAGE</th><th>SUBMITTED BY</th><th>DEVIATION</th></tr></thead>
          <tbody>
            {suggestionAnomalies.length === 0 ? (
              <tr><td colSpan="5" className="empty-row">No unusual suggestions detected.</td></tr>
            ) : (
              suggestionAnomalies.map((s) => {
                const dev = ((s.suggestedPrice - s.avg) / s.avg) * 100;
                return (
                  <tr key={s.id}>
                    <td><strong>{s.species}</strong></td>
                    <td className="flag-price"><strong>{peso(s.suggestedPrice)}</strong></td>
                    <td>{peso(s.avg)}</td>
                    <td>{s.submittedBy}</td>
                    <td className={dev >= 0 ? "up" : "down"}>{dev >= 0 ? "+" : ""}{dev.toFixed(0)}%</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   PRICE FORECAST
   ================================================================ */

function PriceForecast({ priceHistory, factors, notify }) {
  const [species, setSpecies] = useState(SPECIES_LIST[0]);
  const [days, setDays] = useState("7");

  const rows = priceHistory[species];
  const last = rows[rows.length - 1];
  const weekAgo = rows[rows.length - 8];
  const trendPerDay = (last.price - weekAgo.price) / 7;
  const count = Number(days);
  const holidays = factors.filter((f) => f.holiday).length;

  const forecast = Array.from({ length: count }).map((_, i) => {
    const d = new Date(last.date + "T00:00:00");
    d.setDate(d.getDate() + i + 1);
    const value = last.price + trendPerDay * (i + 1) * 0.8;
    const spread = 3 + i * 0.6;
    return { date: d.toLocaleDateString("en-PH"), price: value, low: value - spread, high: value + spread, up: trendPerDay >= 0 };
  });

  const pct = ((forecast[forecast.length - 1].price - last.price) / last.price) * 100;

  const exportForecast = () => {
    const header = "Date,Projected Price,Low,High\n";
    const body = forecast.map((f) => `"${f.date}","${f.price.toFixed(2)}","${f.low.toFixed(2)}","${f.high.toFixed(2)}"`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${species}_forecast.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Forecast exported.");
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Price Forecast</h2>
          <p>Projected price movement generated from historical prices and external factors.</p>
        </div>
        <div className="filter-row">
          <select className="date-input" value={species} onChange={(e) => setSpecies(e.target.value)}>
            {SPECIES_LIST.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="date-input" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">Next 7 days</option>
            <option value="14">Next 14 days</option>
            <option value="30">Next 30 days</option>
          </select>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h3>{species} — Forecast</h3><p>Historical prices with projected values</p></div>
          <button className="secondary-btn" onClick={exportForecast}>↓ Export Forecast</button>
        </div>

        <div className="chart-area">
          <div className="chart-placeholder">
            <div className="bars">
              {priceHistory[species].slice(-8).map((r, i) => <div key={`h${i}`} className="bar" style={{ height: `${50 + i * 3}%` }}></div>)}
              {forecast.map((f, i) => (
                <div key={`f${i}`} className="bar forecast-bar" style={{ height: `${55 + i * (28 / count)}%` }} title={`${f.date} — ${peso(f.price)}`}></div>
              ))}
            </div>
            <p className="chart-note">Blue bars are actual prices, orange bars are projected values.</p>
          </div>
        </div>

        <div className="insight-box">
          <strong>📈 Insight</strong>
          <p>
            {species} prices are projected to {pct >= 0 ? "rise" : "fall"} by about {Math.abs(pct).toFixed(1)}%
            over the next {days} days, ending near {peso(forecast[forecast.length - 1].price)} per kilogram.
            {holidays > 0 && ` ${holidays} logged holiday${holidays > 1 ? "s" : ""} may push demand higher than usual.`}
          </p>
        </div>

        <table>
          <thead><tr><th>DATE</th><th>PROJECTED PRICE</th><th>EXPECTED RANGE</th><th>TREND</th></tr></thead>
          <tbody>
            {forecast.map((f, i) => (
              <tr key={i}>
                <td>{f.date}</td>
                <td><strong>{peso(f.price)}</strong></td>
                <td>{peso(f.low)} – {peso(f.high)}</td>
                <td className={f.up ? "up" : "down"}>{f.up ? "▲ Rising" : "▼ Easing"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================================================================
   REPORTS
   ================================================================ */

function Reports({ entries, notify }) {
  const [type, setType] = useState("Price History Report");
  const [speciesFilter, setSpeciesFilter] = useState("All Species");

  const visible = entries.filter((e) => speciesFilter === "All Species" || e.species === speciesFilter);
  const published = entries.filter((e) => e.status === "Published");
  const flagged = entries.filter((e) => e.status === "Flagged");
  const average = entries.length ? entries.reduce((s, e) => s + e.price, 0) / entries.length : 0;

  const exportCSV = () => {
    const header = "Date,Species,Price per kg,Market,Status\n";
    const body = visible.map((e) => `"${e.date}","${e.species}","${e.price.toFixed(2)}","${e.market}","${e.status}"`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "price_report.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify("Report exported as CSV.");
  };

  const exportPDF = () => {
    notify("Opening print dialog — choose 'Save as PDF'.");
    setTimeout(() => window.print(), 400);
  };

  return (
    <>
      <div className="page-title">
        <div><h2>Reports</h2><p>Generate and export price history and external factor reports.</p></div>
        <div className="filter-row">
          <button className="secondary-btn" onClick={exportCSV}>↓ Export CSV</button>
          <button className="primary-btn" onClick={exportPDF}>↓ Export PDF</button>
        </div>
      </div>

      <div className="log-summary">
        <div className="mini-stat"><span>Total Entries</span><strong>{entries.length}</strong></div>
        <div className="mini-stat"><span>Published</span><strong>{published.length}</strong></div>
        <div className="mini-stat"><span>Average Price</span><strong>{peso(average)}</strong></div>
        <div className="mini-stat"><span>Flagged Entries</span><strong>{flagged.length}</strong></div>
      </div>

      <div className="panel">
        <div className="table-tools">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>Price History Report</option>
            <option>External Factor Summary</option>
            <option>Publication Summary</option>
          </select>
          <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)}>
            <option>All Species</option>
            {SPECIES_LIST.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <table>
          <thead><tr><th>DATE</th><th>SPECIES</th><th>PRICE / KG</th><th>MARKET</th><th>STATUS</th></tr></thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan="5" className="empty-row">No records found.</td></tr>
            ) : (
              visible.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td><strong>{e.species}</strong></td>
                  <td><strong>{peso(e.price)}</strong></td>
                  <td>{e.market}</td>
                  <td><span className={`badge ${e.status.toLowerCase().replace(/\s/g, "")}`}>{e.status}</span></td>
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
   VALIDATION HISTORY
   ================================================================ */

function ValidationHistory({ validationHistory, notify }) {
  const [search, setSearch] = useState("");

  const visible = validationHistory.filter((v) =>
    [v.user, v.action, v.details].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const header = "Date,User,Decision,Details\n";
    const body = visible.map((v) => `"${v.date}","${v.user}","${v.action}","${v.details}"`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "validation_history.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify("Validation history exported.");
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Validation History</h2>
          <p>Every review, approval, rejection, and reference-price decision you've made.</p>
        </div>
        <button className="secondary-btn" onClick={exportCSV}>↓ Export</button>
      </div>

      <div className="panel">
        <div className="table-tools">
          <div className="search-box">
            🔍
            <input type="text" placeholder="Search decisions..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <table>
          <thead><tr><th>DATE</th><th>USER</th><th>DECISION</th><th>DETAILS</th></tr></thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan="4" className="empty-row">No decisions recorded yet.</td></tr>
            ) : (
              visible.map((v) => (
                <tr key={v.id}>
                  <td>{v.date}</td>
                  <td>{v.user}</td>
                  <td><strong>{v.action}</strong></td>
                  <td>{v.details}</td>
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
   AUDIT LOG
   ================================================================ */

function AuditLog({ notify }) {
  const [selectedLog, setSelectedLog] = useState(null);
  const { records, loading, error, refresh } = useDjangoActivityLogs();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("All Actions");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const actions = [...new Set(records.map(l => l.action).filter(Boolean))].sort();
  const visible = records.filter(l => {
    const day = l.created_at ? l.created_at.slice(0, 10) : "";
    return (action === "All Actions" || l.action === action)
      && (!from || day >= from) && (!to || day <= to)
      && [l.actor_username, l.action, l.target_name, formatAuditDetails(l.details)].join(" ").toLowerCase().includes(search.toLowerCase());
  });
  return <>
    <div className="page-title"><div><h2>My Audit Log</h2><p>Your permanent Fish Species activity recorded in Django.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary-btn" onClick={refresh}>↻ Refresh</button><button className="secondary-btn" disabled={!visible.length} onClick={()=>{exportAuditCsv(visible,"my_aquatimbang_audit_log.csv");notify("Audit log exported.");}}>↓ Export CSV</button></div>
    </div>
    <div className="panel"><div className="table-tools" style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
      <div className="search-box">🔍 <input placeholder="Search actions or fish species..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <select value={action} onChange={e=>setAction(e.target.value)}><option>All Actions</option>{actions.map(a=><option key={a}>{a}</option>)}</select>
      <label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>To <input type="date" min={from||undefined} value={to} onChange={e=>setTo(e.target.value)}/></label>
    </div>
    {loading && <p style={{padding:20}}>Loading your audit history...</p>}
    {error && <p role="alert" style={{padding:20,color:"#b91c1c"}}>{error}</p>}
    {!loading && !error && <div style={{overflowX:"auto"}}><table><thead><tr><th>DATE &amp; TIME</th><th>ACTION</th><th>FISH SPECIES</th><th>DETAILS</th></tr></thead><tbody>
      {visible.length===0 ? <tr><td colSpan="4" className="empty-row">No recorded activities found.</td></tr> : visible.map(l=><tr key={l.id}><td>{formatAuditTimestamp(l.created_at)}</td><td><AuditActionBadge action={l.action}/></td><td>{l.target_name||"—"}</td><td style={{maxWidth:420,overflowWrap:"anywhere"}}><div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:6}}><span>{auditSummary(l)}</span><button type="button" className="secondary-btn" onClick={()=>setSelectedLog(l)} style={{padding:"5px 10px",fontSize:12}}>View Details</button></div></td></tr>)}
    </tbody></table></div>}
    </div>
    <AuditDetailsDialog log={selectedLog} onClose={() => setSelectedLog(null)}/>
  </>;
}

/* ================================================================
   NOTIFICATIONS
   ================================================================ */

function Notifications({ notifications, dismissedNotifs, setDismissedNotifs, goTo }) {
  const dismiss = (id) => setDismissedNotifs((prev) => [...prev, id]);
  const visible = notifications.filter((n) => !dismissedNotifs.includes(n.id));
  const iconFor = (type) => (type === "danger" ? "⚠" : type === "warning" ? "⏳" : "ℹ");
  const bgFor = (type) => (type === "danger" ? "purple-bg" : type === "warning" ? "blue-bg" : "green-bg");

  return (
    <>
      <div className="page-title">
        <div><h2>Notifications</h2><p>Alerts about fisherfolk suggestions, flagged entries, and pending work.</p></div>
        {dismissedNotifs.length > 0 && <button className="secondary-btn" onClick={() => setDismissedNotifs([])}>Restore Dismissed</button>}
      </div>

      <div className="panel">
        {visible.length === 0 ? (
          <p className="empty-row">You're all caught up.</p>
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
   MY PROFILE
   ================================================================ */

function MyProfile({ profile, setProfile, activity, notify }) {
  const [draft, setDraft] = useState(profile);
  const update = (key, value) => setDraft({ ...draft, [key]: value });

  const save = () => {
    if (!draft.name.trim() || !draft.email.trim()) {
      notify("Name and email are required.");
      return;
    }
    setProfile(draft);
    notify("Profile saved.");
  };

  return (
    <>
      <div className="page-title">
        <div><h2>My Profile</h2><p>Your LGU officer account details.</p></div>
        <button className="primary-btn" onClick={save}>Save Changes</button>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">♙</div>
            <div><h3>Profile Information</h3><p>Editable contact details</p></div>
          </div>
          <div className="form-group"><label>Full Name</label><input value={draft.name} onChange={(e) => update("name", e.target.value)} /></div>
          <div className="form-group"><label>Email Address</label><input value={draft.email} onChange={(e) => update("email", e.target.value)} /></div>

          <div className="profile-grid" style={{ marginTop: 14 }}>
            <div className="profile-field"><span>Username</span><strong>{draft.username}</strong></div>
            <div className="profile-field"><span>Role</span><strong>{draft.role}</strong></div>
            <div className="profile-field"><span>Municipality</span><strong>{draft.municipality}</strong></div>
            <div className="profile-field"><span>Last Login</span><strong>{draft.lastLogin}</strong></div>
          </div>

          <div className="info-box" style={{ marginTop: 14 }}>
            Username and role can only be changed by an administrator, from User Management.
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">◷</div>
            <div><h3>My Activity</h3><p>Your recent actions in AquaTimbang</p></div>
          </div>
          <div className="history-list">
            {activity.map((a) => (
              <div className="history-item" key={a.id}>
                <div><strong>{a.action}</strong></div>
                <small>{a.date}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default LGU;