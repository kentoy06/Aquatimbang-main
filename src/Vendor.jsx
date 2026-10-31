import React, { useEffect, useState, lazy, Suspense } from "react";
import "./App.css";
import "./Vendor.css";

import {
  listVendorSuggestions,
  createVendorSuggestion,
} from "./api/vendorSuggestions";
import { API_BASE_URL } from "./api/config.js";
import { fullName, useMyProfile } from "./api/account.js";
import AccountProfile from "./components/AccountProfile.jsx";

// Loaded only when the forecast page opens (the chart library is large).
const ForecastView = lazy(() => import("./components/ForecastView.jsx"));

/* ================================================================
   HELPERS
   ================================================================ */

// Resolve the signed-in vendor rather than displaying a demo identity.
function getVendorIdentity(currentUser) {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem("user") || "{}"); } catch { /* ignore invalid storage */ }
  const user = currentUser && typeof currentUser === "object" ? currentUser : stored;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const name = user.full_name || user.fullName || user.name || fullName || user.username || "Fish Vendor";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
  return { name, initials: initials || "FV", email: user.email || "", contact: user.contact_number || user.contact || "", municipality: user.municipality_name || user.municipality || "" };
}
const peso = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/* ================================================================
   ROOT VENDOR COMPONENT
   ================================================================ */

function Vendor({ onLogout, currentUser }) {
  const account = useMyProfile();
  const identity = getVendorIdentity(account.profile ? { ...currentUser, ...account.profile, name: fullName(account.profile) } : currentUser);
  const [activePage, setActivePage] = useState("Dashboard");
  const [toast, setToast] = useState("");

  const [publishedPrices, setPublishedPrices] = useState([]);
  const [priceMunicipalities, setPriceMunicipalities] = useState([]);
  const [municipalityOptions, setMunicipalityOptions] = useState([]);
  const [registeredFishSpecies, setRegisteredFishSpecies] = useState([]);
  const [speciesLoadError, setSpeciesLoadError] = useState("");
  const [selectedPriceMunicipality, setSelectedPriceMunicipality] = useState(identity.municipality || "");
  const [publishedLoading, setPublishedLoading] = useState(true);
  const [publishedError, setPublishedError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPublished() {
      setPublishedLoading(true);
      setPublishedError("");
      try {
        const base = API_BASE_URL;
        const token = localStorage.getItem("authToken");
        if (!token) throw new Error("Please log in again.");
        const response = await fetch(`${base}/prices/published/`, {
          headers: { Authorization: `Token ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.detail || data?.message || `HTTP ${response.status}`);
        const rows = Array.isArray(data) ? data : data?.results;
        if (!Array.isArray(rows)) throw new Error("Unexpected published prices response.");
        if (!cancelled) setPublishedPrices(rows.filter((r) => r.status === "published" || r.status === undefined));
      } catch (error) {
        if (!cancelled) setPublishedError(error.message);
      } finally {
        if (!cancelled) setPublishedLoading(false);
      }
    }
    loadPublished();
    return () => { cancelled = true; };
  }, []);
  // Municipality options come from the registry, not the filtered published-price results.
  useEffect(() => {
    let cancelled = false;
    async function loadMunicipalities() {
      try {
        const base = API_BASE_URL;
        const token = localStorage.getItem("authToken");
        if (!token) return;
        const response = await fetch(`${base}/municipalities/`, {
          headers: { Authorization: `Token ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        const rows = Array.isArray(data) ? data : data?.results;
        if (Array.isArray(rows) && !cancelled) {
          setPriceMunicipalities(rows.map((row) => row.name).filter(Boolean));
          setMunicipalityOptions(rows.filter((row) => row.is_active !== false).map((row) => ({ id: row.id, name: row.name })));
        }
      } catch (_) {
        // Keep the assigned municipality and published-price locations available.
      }
    }
    loadMunicipalities();
    return () => { cancelled = true; };
  }, []);
  // Fish species are loaded from the registry independently of published price records.
  useEffect(() => {
    let cancelled = false;
    async function loadFishSpecies() {
      try {
        const base = API_BASE_URL;
        const token = localStorage.getItem("authToken");
        if (!token) return;
        const response = await fetch(`${base}/fish-species/`, { headers: { Authorization: `Token ${token}` } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const rows = Array.isArray(data) ? data : data?.results;
        if (!Array.isArray(rows)) throw new Error("Unexpected fish species response");
        if (!cancelled) setRegisteredFishSpecies(rows.filter((r) => r.is_active !== false).map((r) => ({ id: String(r.id), name: r.name })));
      } catch (err) {
        if (!cancelled) setSpeciesLoadError(err.message || "Could not load fish species registry");
      }
    }
    loadFishSpecies();
    return () => { cancelled = true; };
  }, []);
  const [communityAverages, setCommunityAverages] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError, setCommunityError] = useState("");
  const [communityRefresh, setCommunityRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function loadCommunity() {
      setCommunityLoading(true);
      setCommunityError("");
      try {
        const base = API_BASE_URL;
        const token = localStorage.getItem("authToken");
        if (!token) throw new Error("Please log in again.");
        const response = await fetch(`${base}/vendor-suggestions/community-average/`, {
          headers: { Authorization: `Token ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.detail || data?.message || `HTTP ${response.status}`);
        const rows = Array.isArray(data) ? data : data?.results;
        if (!Array.isArray(rows)) throw new Error("Unexpected community average response.");
        if (!cancelled) setCommunityAverages(rows);
      } catch (err) {
        if (!cancelled) setCommunityError(err.message || "Unable to load community averages.");
      } finally {
        if (!cancelled) setCommunityLoading(false);
      }
    }
    loadCommunity();
    return () => { cancelled = true; };
  }, [communityRefresh]);

  const [mySuggestions, setMySuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState("");

useEffect(() => {
  let cancelled = false;

  async function loadSuggestions() {
    try {
      setSuggestionsLoading(true);
      setSuggestionsError("");

      const records = await listVendorSuggestions();

      if (!cancelled) {
        setMySuggestions(records);
      }
    } catch (error) {
      if (!cancelled) {
        setSuggestionsError(error.message);
      }
    } finally {
      if (!cancelled) {
        setSuggestionsLoading(false);
      }
    }
  }

  loadSuggestions();

  return () => {
    cancelled = true;
  };
}, []);

  const [dismissedNotifs, setDismissedNotifs] = useState([]);

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  };

  const notifications = buildVendorNotifications(mySuggestions, publishedPrices);
  const unread = notifications.filter((n) => !dismissedNotifs.includes(n.id));

  const menuGroups = [
    {
      label: "PRICES",
      items: [
        { name: "Dashboard", icon: "▦" },
        { name: "Current Fish Prices", icon: "₱" },
        { name: "Price Trends", icon: "📈" },
        { name: "Price Forecast", icon: "◔" },
      ],
    },
    {
      label: "SUGGESTIONS",
      items: [
        { name: "Submit Suggested Price", icon: "✎" },
        { name: "My Suggested Prices", icon: "📥" },
        { name: "Community Average", icon: "👥" },
      ],
    },
    {
      label: "TOOLS",
      items: [
        { name: "Fair Price Calculator", icon: "🧮" },
        { name: "Export Reports", icon: "📄" },
      ],
    },
    {
      label: "ACCOUNT",
      items: [
        { name: "Notifications", icon: "🔔" },
        { name: "My Profile", icon: "♙" },
        { name: "Help / How to Use", icon: "❓" },
      ],
    },
  ];

  const renderPage = () => {
    switch (activePage) {
      case "Current Fish Prices":
        return <LivePublishedPrices records={publishedPrices} loading={publishedLoading} error={publishedError} municipality={selectedPriceMunicipality} onMunicipalityChange={setSelectedPriceMunicipality} availableMunicipalities={priceMunicipalities} defaultMunicipality={identity.municipality} />;
      case "Price Trends":
        return <PriceTrends registeredSpecies={registeredFishSpecies} speciesLoadError={speciesLoadError} records={publishedPrices} loading={publishedLoading} error={publishedError} municipality={selectedPriceMunicipality} onMunicipalityChange={setSelectedPriceMunicipality} availableMunicipalities={priceMunicipalities} defaultMunicipality={identity.municipality} />;
      case "Price Forecast":
        return <Suspense fallback={<div className="panel" style={{ padding: 24 }}>Loading forecast…</div>}><ForecastView species={registeredFishSpecies} municipalities={municipalityOptions} defaultMunicipalityId={currentUser?.municipality_id} notify={notify} description="Short-term price estimates to help you decide when to sell." /></Suspense>;
      case "Submit Suggested Price":
        return (
          <SubmitSuggestedPrice
            registeredSpecies={registeredFishSpecies}
            records={publishedPrices}
            setMySuggestions={setMySuggestions}
            notify={notify}
          />
        );
      case "My Suggested Prices":
  return (
    <>
      {suggestionsLoading && (
        <p>Loading your suggestions...</p>
      )}

      {suggestionsError && (
        <div className="error-box">
          Unable to load suggestions: {suggestionsError}
        </div>
      )}

      {!suggestionsLoading && !suggestionsError && (
        <MySuggestedPrices
          mySuggestions={mySuggestions}
          setMySuggestions={setMySuggestions}
          notify={notify}
        />
      )}
    </>
  );
      case "Community Average":
        return <CommunityAverage averages={communityAverages} publishedPrices={publishedPrices} loading={communityLoading || publishedLoading} error={communityError || publishedError} municipality={selectedPriceMunicipality} onMunicipalityChange={setSelectedPriceMunicipality} availableMunicipalities={priceMunicipalities} defaultMunicipality={identity.municipality} onRefresh={() => setCommunityRefresh((n) => n + 1)} />;
      case "Fair Price Calculator":
        return <FairPriceCalculator records={publishedPrices} registeredSpecies={registeredFishSpecies} speciesLoadError={speciesLoadError} loading={publishedLoading} error={publishedError} municipality={selectedPriceMunicipality} onMunicipalityChange={setSelectedPriceMunicipality} availableMunicipalities={priceMunicipalities} defaultMunicipality={identity.municipality} notify={notify} />;
      case "Export Reports":
        return <ExportReports mySuggestions={mySuggestions} suggestionsLoading={suggestionsLoading} suggestionsError={suggestionsError} records={publishedPrices} loading={publishedLoading} error={publishedError} municipality={selectedPriceMunicipality} onMunicipalityChange={setSelectedPriceMunicipality} availableMunicipalities={priceMunicipalities} defaultMunicipality={identity.municipality} registeredSpecies={registeredFishSpecies} notify={notify} />;
      case "Notifications":
        return <Notifications notifications={notifications} dismissedNotifs={dismissedNotifs} setDismissedNotifs={setDismissedNotifs} goTo={setActivePage} />;
      case "My Profile":
        return <AccountProfile account={account} notify={notify} description="Manage your vendor details and see your recent activity." />;
      case "Help / How to Use":
        return <HelpPage />;
      default:
        return <LiveVendorDashboard records={publishedPrices} loading={publishedLoading} error={publishedError} municipality={selectedPriceMunicipality} onMunicipalityChange={setSelectedPriceMunicipality} availableMunicipalities={priceMunicipalities} defaultMunicipality={identity.municipality} vendorName={identity.name} goTo={setActivePage} mySuggestions={mySuggestions} />;
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

        <div className="admin-label">FISH VENDOR</div>

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

        <div className="sidebar-bottom">
          <div className="admin-profile">
            <div className="avatar">{identity.initials}</div>
            <div>
              <strong>{identity.name}</strong>
              <small>Fish Vendor</small>
            </div>
          </div>

          <button className="logout-btn" onClick={onLogout}>↪ Logout</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{activePage}</h1>
            <p>View official fish prices and compute fair selling amounts</p>
          </div>

          <div className="topbar-right">
            <button className="notification" onClick={() => setActivePage("Notifications")}>
              🔔
              {unread.length > 0 && <span className="notif-dot"></span>}
            </button>
            <div className="top-profile">
              <div className="avatar small">{identity.initials}</div>
              <div>
                <strong>{identity.name}</strong>
                <span>Fish Vendor</span>
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

function buildVendorNotifications(mySuggestions, publishedPrices = []) {
  const notifs = [];
  let id = 1;

  mySuggestions.forEach((s) => {
    if (s.status === "Reviewed" || s.status === "Adopted" || s.status === "Rejected") {
      notifs.push({
        id: id++,
        type: s.status === "Rejected" ? "danger" : "info",
        page: "My Suggested Prices",
        title: `Your ${s.species} suggestion was marked "${s.status}"`,
        detail: s.lguFeedback || "No additional feedback from the LGU officer.",
      });
    }
  });

  const latest = publishedPrices.reduce((max, r) => (r.recorded_date > max ? r.recorded_date : max), "");
  if (latest) {
    notifs.push({
      id: id++, type: "info", page: "Current Fish Prices",
      title: "Official prices are published",
      detail: `Latest LGU-validated prices are dated ${latest}.`,
    });
  }

  return notifs;
}

/* ================================================================
   PRICE TRENDS (past)
   ================================================================ */

function PriceTrends({ registeredSpecies = [], speciesLoadError = "", records = [], loading, error, municipality, onMunicipalityChange, availableMunicipalities = [], defaultMunicipality = "" }) {
  const [speciesId, setSpeciesId] = useState("");
  const [range, setRange] = useState("30");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const speciesOptions = Array.from(new Map([
    ...records.filter((r) => r.status === "published" || r.status === undefined)
      .map((r) => [String(r.fish_species), { id: String(r.fish_species), name: r.fish_name || `Species #${r.fish_species}` }]),
    ...registeredSpecies.map((r) => [String(r.id), { id: String(r.id), name: r.name }]),
  ]).values()).sort((a, b) => a.name.localeCompare(b.name));
  const selectedSpecies = speciesOptions.some((s) => s.id === speciesId) ? speciesId : (speciesOptions[0]?.id || "");
  const speciesName = speciesOptions.find((s) => s.id === selectedSpecies)?.name || "Fish species";
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(range) + 1);
  const rangeStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const firstDate = range === "custom" ? fromDate : rangeStart;
  const lastDate = range === "custom" ? toDate : localToday;
  const invalidDates = range === "custom" && (!fromDate || !toDate || fromDate > toDate);

  const filtered = invalidDates ? [] : records.filter((r) => {
    const date = String(r.recorded_date || "").slice(0, 10);
    const price = Number(r.price_per_kg);
    return (r.status === "published" || r.status === undefined)
      && String(r.fish_species) === selectedSpecies
      && (!municipality || String(r.municipality_name || "").toLowerCase() === municipality.toLowerCase())
      && date && date >= firstDate && date <= lastDate
      && Number.isFinite(price) && price > 0;
  });

  // Multiple published records on one day are averaged, not silently discarded.
  const byDate = new Map();
  filtered.forEach((r) => {
    const date = String(r.recorded_date).slice(0, 10);
    const existing = byDate.get(date) || { date, sum: 0, count: 0 };
    existing.sum += Number(r.price_per_kg);
    existing.count += 1;
    byDate.set(date, existing);
  });
  const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, price: r.sum / r.count, count: r.count }));
  const prices = rows.map((r) => r.price);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const high = prices.length ? Math.max(...prices) : null;
  const low = prices.length ? Math.min(...prices) : null;
  const change = rows.length >= 2 ? rows[rows.length - 1].price - rows[0].price : null;

  return (
    <>
      <div className="page-title">
        <div><h2>Price Trends</h2><p>Historical LGU-published fish prices from AquaTimbang. No simulated prices.</p></div>
      </div>
      <PriceMunicipalitySelector records={records} municipality={municipality} onMunicipalityChange={onMunicipalityChange} availableMunicipalities={availableMunicipalities} defaultMunicipality={defaultMunicipality} />
      <div className="panel" style={{ padding: 18, marginTop: 16 }}>
        <div className="filter-row" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <label>Fish species <select className="date-input" value={selectedSpecies} onChange={(e) => setSpeciesId(e.target.value)} disabled={!speciesOptions.length}>
            {!speciesOptions.length && <option value="">No registered species</option>}
            {speciesOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label>Date range <select className="date-input" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="180">Last 180 days</option><option value="custom">Custom dates</option>
          </select></label>
          {range === "custom" && <>
            <label>From <input type="date" className="date-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
            <label>To <input type="date" className="date-input" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
          </>}
        </div>
      </div>
      {speciesLoadError && <p style={{ color: "#a16207", fontSize: 13, margin: "8px 0" }}>Species registry unavailable ({speciesLoadError}). Showing species found in published prices only.</p>}
      {loading ? <div className="panel" style={{ padding: 24 }}>Loading published price history…</div>
        : error ? <div className="panel" style={{ padding: 24, color: "#b91c1c" }}>Unable to load published prices: {error}</div>
        : invalidDates ? <div className="panel" style={{ padding: 24 }}>Choose a valid start and end date (From must not be after To).</div>
        : !rows.length ? <div className="panel" style={{ padding: 24 }}>No published price history for {speciesName}{municipality ? ` in ${municipality}` : ""} during this date range. Try another municipality or a longer range.</div>
        : <>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-icon blue">₱</div><div><span>Average Daily Price</span><h2>{peso(avg)}</h2><small>Across {rows.length} recorded day(s)</small></div></div>
            <div className="stat-card"><div className="stat-icon orange">↑</div><div><span>Highest Daily Price</span><h2>{peso(high)}</h2></div></div>
            <div className="stat-card"><div className="stat-icon green">↓</div><div><span>Lowest Daily Price</span><h2>{peso(low)}</h2></div></div>
            <div className="stat-card"><div className="stat-icon purple">↗</div><div><span>First-to-Last Change</span><h2>{change === null ? "—" : `${change > 0 ? "+" : ""}${peso(change)}`}</h2><small>{rows.length < 2 ? "At least two dates required" : "Difference in daily average"}</small></div></div>
          </div>
          <div className="panel">
            <div className="panel-header"><div><h3>{speciesName} — Published Price History</h3><p>{firstDate} to {lastDate} · {filtered.length} published record(s) · {rows.length} day(s)</p></div></div>
            <PublishedPriceLineChart rows={rows} />
            <div style={{ overflowX: "auto", marginTop: 16 }}><table><thead><tr><th>DATE</th><th>AVERAGE PRICE / KG</th><th>PUBLISHED RECORDS</th></tr></thead><tbody>
              {rows.slice().reverse().map((r) => <tr key={r.date}><td>{r.date}</td><td><strong>{peso(r.price)}</strong></td><td>{r.count}</td></tr>)}
            </tbody></table></div>
          </div>
        </>}
    </>
  );
}

// An SVG line chart with real observation dates; no invented intermediate prices.
function PublishedPriceLineChart({ rows }) {
  const width = 900, height = 310, left = 76, right = 30, top = 36, bottom = 65;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const values = rows.map((r) => r.price);
  const low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high - low) * 0.15, 5);
  const minY = Math.max(0, low - padding), maxY = high + padding;
  const timeValues = rows.map((r) => new Date(`${r.date}T00:00:00`).getTime());
  const minTime = Math.min(...timeValues), maxTime = Math.max(...timeValues);
  const xAt = (index) => minTime === maxTime ? left + plotWidth / 2 : left + (timeValues[index] - minTime) / (maxTime - minTime) * plotWidth;
  const yAt = (value) => top + (maxY - value) / (maxY - minY || 1) * plotHeight;
  const points = rows.map((r, i) => ({ ...r, x: xAt(i), y: yAt(r.price) }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const tickIndices = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  return <div style={{ overflowX: "auto", padding: "12px 10px 4px" }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Historical published prices across ${rows.length} recorded dates`} style={{ width: "100%", minWidth: 540, height: "auto", display: "block" }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const value = minY + (maxY - minY) * (4 - i) / 4;
        const y = top + plotHeight * i / 4;
        return <g key={i}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#dce6ec" strokeDasharray="4 5" /><text x={left - 12} y={y + 4} fontSize="12" fill="#64748b" textAnchor="end">₱{value.toFixed(0)}</text></g>;
      })}
      {points.length > 1 && <polyline points={line} fill="none" stroke="#0f8995" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => <g key={p.date}>
        <circle cx={p.x} cy={p.y} r="5" fill="#0f8995" stroke="white" strokeWidth="2"><title>{p.date}: {peso(p.price)} / kg ({p.count} published record(s))</title></circle>
        {(rows.length <= 12 || i === 0 || i === rows.length - 1) && <text x={p.x} y={Math.max(17, p.y - 14)} fontSize="12" textAnchor="middle" fontWeight="600" fill="#0f6171">{peso(p.price)}</text>}
      </g>)}
      {tickIndices.map((i) => <text key={i} x={points[i].x} y={height - 30} fontSize="12" textAnchor="middle" fill="#475569">{points[i].date}</text>)}
      <text x={width / 2} y={height - 5} fontSize="12" textAnchor="middle" fill="#64748b">Recorded date</text>
    </svg>
    <p className="chart-note" style={{ textAlign: "center" }}>Only dates with published records are plotted. Hover over points for details; the table below shows every date.</p>
  </div>;
}

/* ================================================================
   SUBMIT SUGGESTED PRICE
   ================================================================ */

function SubmitSuggestedPrice({
  registeredSpecies = [],
  records = [],
  setMySuggestions,
  notify,
}) {
  const [speciesId, setSpeciesId] = useState("");
  const [price, setPrice] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Suggestions are filed for the vendor's assigned municipality.
  let savedUser = null;
  try { savedUser = JSON.parse(localStorage.getItem("user") || "null"); } catch { /* ignore invalid storage */ }
  const municipalityId = savedUser?.municipality_id;

  // Default to the first registered species once the list loads.
  useEffect(() => {
    if (!speciesId && registeredSpecies.length) setSpeciesId(registeredSpecies[0].id);
  }, [registeredSpecies, speciesId]);

  const selectedSpecies = registeredSpecies.find((s) => s.id === speciesId);

  // Latest published price for this species in the vendor's municipality.
  const latest = records
    .filter((r) => String(r.fish_species) === String(speciesId) && String(r.municipality) === String(municipalityId))
    .reduce((best, r) => (!best || r.recorded_date > best.recorded_date ? r : best), null);
  const officialNow = latest ? Number(latest.price_per_kg) : null;

  const parsed = Number(price);
  const valid =
    price.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed > 0;

  const diffPct =
    valid && officialNow > 0
      ? ((parsed - officialNow) / officialNow) * 100
      : 0;

  const bigDiff =
    valid &&
    officialNow > 0 &&
    Math.abs(diffPct) > 15;

  const submit = async () => {
    if (submitting) return;

    if (!valid) {
      notify("Enter a valid suggested price first.");
      return;
    }

    if (!selectedSpecies) {
      notify("Select a fish species first.");
      return;
    }

    if (municipalityId === null || municipalityId === undefined) {
      setError("Your account has no assigned municipality. Please contact the administrator.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const savedSuggestion = await createVendorSuggestion({
        fish_species: Number(selectedSpecies.id),
        municipality: municipalityId,
        suggested_price: parsed.toFixed(2),
        comment: comment.trim(),
      });

      // Only update the UI after Django confirms the save.
      setMySuggestions((prev) => [
        savedSuggestion,
        ...prev,
      ]);

      notify("Suggested price saved and submitted for LGU review.");

      setPrice("");
      setComment("");
    } catch (err) {
      const message =
        err.message || "Unable to submit suggested price.";

      setError(message);
      notify(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Submit Suggested Price</h2>
          <p>
            Think the official price doesn't match what you're seeing
            at the market? Suggest a price for LGU review.
          </p>
        </div>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">✎</div>
            <div>
              <h3>New Suggestion</h3>
              <p>
                Submitted suggestions are reviewed by an LGU officer.
              </p>
            </div>
          </div>

          <div className="form-group">
            <label>Fish Species</label>
            <select
              value={speciesId}
              onChange={(e) => setSpeciesId(e.target.value)}
              disabled={submitting || !registeredSpecies.length}
            >
              {!registeredSpecies.length && <option value="">No fish species registered</option>}
              {registeredSpecies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Current Official Price</label>
            <div className="locked-field">
              {officialNow !== null ? peso(officialNow) : "Not available"}
              {officialNow !== null && (
                <span className="badge success">
                  LGU Validated
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Your Suggested Price per KG</label>
            <div className="input-with-unit">
              <span>₱</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                placeholder="0.00"
                onChange={(e) => setPrice(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {bigDiff && (
            <div className="warn-box">
              ⚠ This is {Math.abs(diffPct).toFixed(0)}%{" "}
              {diffPct > 0 ? "above" : "below"} the current official
              price. Adding a comment helps the LGU officer
              understand why.
            </div>
          )}

          <div className="form-group">
            <label>Comment (optional)</label>
            <input
              type="text"
              value={comment}
              placeholder="Explain the market conditions or price difference"
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="info-box">
            Your suggestion will be saved to the database and
            forwarded to the LGU for review.
          </div>

          {error && (
            <div className="warn-box" role="alert">
              {error}
            </div>
          )}

          <button
            className="primary-btn full-btn"
            onClick={submit}
            disabled={submitting || !valid}
          >
            {submitting ? "Submitting..." : "Submit Suggestion"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   MY SUGGESTED PRICES
   ================================================================ */

function MySuggestedPrices({ mySuggestions, setMySuggestions, notify }) {
  const [editingId, setEditingId] = useState(null);
  const [draftComment, setDraftComment] = useState("");

  const statusClass = (s) => {
    if (s === "Adopted") return "success";
    if (s === "Rejected") return "deleted";
    if (s === "Reviewed") return "approved";
    return "pending";
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setDraftComment(s.comment);
  };

  const saveComment = () => {
  notify("Editing suggestions is not available yet.");
  setEditingId(null);
};

  const withdraw = () => {
  notify("Withdrawing suggestions is not available yet.");
};

  return (
    <>
      <div className="page-title">
        <div>
          <h2>My Suggested Prices</h2>
          <p>Track the status of every price you've suggested to the LGU.</p>
        </div>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>SPECIES</th>
              <th>SUGGESTED PRICE</th>
              <th>COMMENT</th>
              <th>STATUS</th>
              <th>LGU FEEDBACK</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {mySuggestions.length === 0 ? (
              <tr><td colSpan="7" className="empty-row">You haven't submitted any suggestions yet.</td></tr>
            ) : (
              mySuggestions.map((s) => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td><strong>{s.species}</strong></td>
                  <td><strong>{peso(s.suggestedPrice)}</strong></td>
                  <td>
                    {editingId === s.id ? (
                      <input
                        className="inline-input"
                        value={draftComment}
                        onChange={(e) => setDraftComment(e.target.value)}
                        placeholder="Add a note for the LGU officer..."
                      />
                    ) : (
                      s.comment || <span className="muted-text">No comment</span>
                    )}
                  </td>
                  <td><span className={`badge ${statusClass(s.status)}`}>{s.status}</span></td>
                  <td>{s.lguFeedback || <span className="muted-text">—</span>}</td>
                  <td>
                    {s.status === "Pending Review" ? (
                      editingId === s.id ? (
                        <div className="action-icons">
                          <button title="Save" onClick={() => saveComment(s)}>✔</button>
                          <button title="Cancel" onClick={() => setEditingId(null)}>✕</button>
                        </div>
                      ) : (
                        <div className="action-icons">
                          <button title="Edit comment" onClick={() => startEdit(s)}>✎</button>
                          <button title="Withdraw" onClick={() => withdraw(s)}>🗑</button>
                        </div>
                      )
                    ) : (
                      <span className="muted-text">No actions</span>
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
   COMMUNITY AVERAGE
   ================================================================ */

function CommunityAverage({ averages = [], publishedPrices = [], loading, error, municipality, onMunicipalityChange, availableMunicipalities = [], defaultMunicipality = "", onRefresh }) {
  const [speciesId, setSpeciesId] = useState("");
  const options = [...new Map(averages.map((row) => [String(row.fish_species), { id: String(row.fish_species), name: row.fish_name }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = averages.filter((row) =>
    (!municipality || String(row.municipality_name).trim().toLowerCase() === municipality.trim().toLowerCase()) &&
    (!speciesId || String(row.fish_species) === speciesId)
  );
  const latestOfficial = (row) => publishedPrices.filter((p) =>
    String(p.fish_species) === String(row.fish_species) &&
    String(p.municipality_name || "").trim().toLowerCase() === String(row.municipality_name || "").trim().toLowerCase() &&
    (p.status === "published" || p.status === undefined)
  ).sort((a, b) => String(b.recorded_date).localeCompare(String(a.recorded_date)) || Number(b.id || 0) - Number(a.id || 0))[0];
  return (
    <>
      <div className="page-title"><div><h2>Community Average</h2>
        <p>Actual LGU-reviewed vendor suggestions, grouped by municipality and fish species. No simulated prices.</p>
      </div></div>
      <div className="notice"><div className="notice-icon">!</div><div>
        <strong>Community suggestions are not official LGU prices</strong>
        <p>Only reviewed or adopted suggestions are included. Official prices come from separately published LGU records.</p>
      </div></div>
      <PriceMunicipalitySelector records={publishedPrices} municipality={municipality} onMunicipalityChange={onMunicipalityChange} availableMunicipalities={availableMunicipalities} defaultMunicipality={defaultMunicipality} />
      <div className="panel" style={{ padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label htmlFor="community-species">Fish species</label>
        <select id="community-species" value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
          <option value="">All fish species</option>
          {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" onClick={onRefresh}>Refresh averages</button>
      </div>
      {loading ? <div className="panel" style={{ padding: 20 }}>Loading community averages...</div> :
       error ? <div className="panel" style={{ padding: 20, color: "#b91c1c" }}>Unable to load community averages: {error}</div> :
       <div className="panel" style={{ overflowX: "auto" }}>
        <table><thead><tr>
          <th>MUNICIPALITY</th><th>SPECIES</th><th>LATEST OFFICIAL PRICE / KG</th>
          <th>COMMUNITY AVERAGE / KG</th><th>DIFFERENCE</th><th>REVIEWED SUBMISSIONS</th>
        </tr></thead><tbody>
          {rows.length === 0 ? <tr><td colSpan={6}>No reviewed vendor submissions available for these filters.</td></tr> :
            rows.map((row) => {
              const official = latestOfficial(row);
              const officialPrice = official ? Number(official.price_per_kg) : null;
              const average = Number(row.average_price);
              const difference = officialPrice !== null ? average - officialPrice : null;
              return <tr key={`${row.municipality_id}-${row.fish_species}`}>
                <td>{row.municipality_name}</td><td><strong>{row.fish_name}</strong></td>
                <td>{officialPrice === null ? "Not published" : peso(officialPrice)}</td>
                <td>{peso(average)}</td>
                <td className={difference === null ? "" : difference > 0 ? "up" : difference < 0 ? "down" : ""}>
                  {difference === null ? "—" : `${difference > 0 ? "+" : difference < 0 ? "−" : ""}${peso(Math.abs(difference))}`}
                </td><td>{row.submission_count}</td>
              </tr>;
            })}
        </tbody></table>
      </div>}
    </>
  );
}

/* ================================================================
   FAIR PRICE CALCULATOR
   ================================================================ */

function FairPriceCalculator({ records = [], registeredSpecies = [], speciesLoadError = "", loading, error, municipality, onMunicipalityChange, availableMunicipalities = [], defaultMunicipality = "", notify }) {
  const [speciesId, setSpeciesId] = useState("");
  const [weight, setWeight] = useState("");
  // Calculations saved in the database (WeightEntries, Table 20).
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/weight-entries/`, { headers: { Authorization: `Token ${localStorage.getItem("authToken")}` } })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || "Could not load your saved calculations.");
        if (!cancelled) setHistory(data);
      })
      .catch((err) => { if (!cancelled) setHistoryError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const speciesOptions = Array.from(new Map([
    ...records.filter((r) => r.status === "published" || r.status === undefined)
      .map((r) => [String(r.fish_species), { id: String(r.fish_species), name: r.fish_name || `Species #${r.fish_species}` }]),
    ...registeredSpecies.map((r) => [String(r.id), { id: String(r.id), name: r.name }]),
  ]).values()).sort((a, b) => a.name.localeCompare(b.name));
  const selectedSpecies = speciesOptions.some((s) => s.id === speciesId) ? speciesId : (speciesOptions[0]?.id || "");
  const speciesName = speciesOptions.find((s) => s.id === selectedSpecies)?.name || "Fish species";

  // Never combine different municipalities into a single official unit price.
  const published = (records || []).filter((r) =>
    (r.status === "published" || r.status === undefined) &&
    String(r.fish_species) === selectedSpecies &&
    (!municipality || String(r.municipality_name || "").trim().toLowerCase() === municipality.trim().toLowerCase()) &&
    /^\d{4}-\d{2}-\d{2}/.test(String(r.recorded_date || "")) &&
    Number.isFinite(Number(r.price_per_kg)) && Number(r.price_per_kg) > 0
  );
  const latest = published.slice().sort((a, b) =>
    String(b.recorded_date).localeCompare(String(a.recorded_date)) || Number(b.id || 0) - Number(a.id || 0)
  )[0] || null;
  const unit = municipality && latest ? Number(latest.price_per_kg) : null;
  const parsed = Number(weight);
  const touched = weight.trim() !== "";
  const invalid = touched && (!Number.isFinite(parsed) || parsed <= 0);
  const valid = touched && !invalid && unit !== null && !loading && !error;
  const total = valid ? parsed * unit : null;

  const save = async () => {
    if (!valid || !latest) {
      notify?.("Choose a municipality and species with a published LGU price, then enter a valid weight.");
      return;
    }
    setSaving(true);
    try {
      // The server recomputes the total from the latest published price.
      const response = await fetch(`${API_BASE_URL}/weight-entries/`, {
        method: "POST",
        headers: { Authorization: `Token ${localStorage.getItem("authToken")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fish_species: latest.fish_species, municipality: latest.municipality, weight_kg: parsed.toFixed(2) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || data?.weight_kg || "Could not save the calculation.");
      setHistory((prev) => [data, ...prev]);
      notify?.("Calculation saved to your history.");
    } catch (err) {
      notify?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entry) => {
    const response = await fetch(`${API_BASE_URL}/weight-entries/${entry.id}/`, {
      method: "DELETE",
      headers: { Authorization: `Token ${localStorage.getItem("authToken")}` },
    });
    if (response.ok) setHistory((prev) => prev.filter((h) => h.id !== entry.id));
    else notify?.("Could not remove the calculation.");
  };

  return (
    <>
      <div className="page-title"><div>
        <h2>Fair Price Calculator</h2>
        <p>Calculate a reference amount using the latest published LGU fish price. No simulated prices.</p>
      </div></div>
      <div className="notice"><div className="notice-icon">!</div><div>
        <strong>Reference calculation only</strong>
        <p>The amount is based on the latest published LGU price for the selected municipality. Actual transactions may differ.</p>
      </div></div>
      <PriceMunicipalitySelector records={records} municipality={municipality} onMunicipalityChange={onMunicipalityChange} availableMunicipalities={availableMunicipalities} defaultMunicipality={defaultMunicipality} />
      {!municipality && <div className="panel" style={{ padding: 16, marginBottom: 16 }}>Select a specific municipality to calculate a price. “All municipalities” cannot provide a single official unit price.</div>}
      {speciesLoadError && <p style={{ color: "#a16207", fontSize: 13 }}>Species registry unavailable ({speciesLoadError}). Showing species found in published prices only.</p>}
      {loading && <div className="panel" style={{ padding: 16, marginBottom: 16 }}>Loading published LGU prices…</div>}
      {error && <div className="panel" style={{ padding: 16, marginBottom: 16, color: "#b91c1c" }}>Unable to load published prices: {error}</div>}
      <div className="config-grid">
        <div className="config-card">
          <div className="config-header"><div className="config-icon blue">🧮</div><div>
            <h3>Compute Reference Amount</h3><p>Weight × latest published price per kilogram</p>
          </div></div>
          <div className="form-group"><label htmlFor="calc-species">Fish Species</label>
            <select id="calc-species" value={selectedSpecies} onChange={(e) => setSpeciesId(e.target.value)} disabled={!speciesOptions.length}>
              {!speciesOptions.length && <option value="">No registered species</option>}
              {speciesOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label htmlFor="calc-weight">Weight in Kilograms</label>
            <div className="input-with-unit"><input id="calc-weight" type="number" value={weight} min="0.01" step="0.01" placeholder="0.00" onChange={(e) => setWeight(e.target.value)} /><span>kg</span></div>
          </div>
          {invalid && <div className="error-box">Please enter a weight greater than zero.</div>}
          <div className="form-group"><label>Latest Published LGU Price per KG</label>
            <div className="locked-field">{unit === null ? "Not available" : peso(unit)} {unit !== null && <span className="badge success">Published</span>}</div>
            {unit !== null && <p style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>Municipality: {municipality} · Recorded: {String(latest.recorded_date).slice(0, 10)}</p>}
            {!loading && !error && municipality && unit === null && <p style={{ marginTop: 8, fontSize: 13, color: "#9a3412" }}>No published price for {speciesName} in {municipality}. Try another species or municipality.</p>}
          </div>
        </div>
        <div className="config-card">
          <div className="config-header"><div className="config-icon green">₱</div><div><h3>Computation Result</h3><p>Reference amount for the selected weight</p></div></div>
          <div className="big-result"><span>REFERENCE AMOUNT</span>
            <strong>{total === null ? "—" : peso(total)}</strong>
            <small>{valid ? `${parsed} kg × ${peso(unit)} per kg` : "Select a published price and enter a valid weight"}</small>
          </div>
          <div className="button-row"><button className="secondary-btn" onClick={() => setWeight("")}>Clear</button>
            <button className="primary-btn" onClick={save} disabled={!valid || saving}>{saving ? "Saving…" : "Save to History"}</button></div>
          <div className="mini-head">My Saved Calculations</div>
          {historyError && <div className="error-box">{historyError}</div>}
          {!historyError && history.length === 0 && <p style={{ fontSize: 13, color: "#64748b" }}>Saved calculations appear here, so you can look back at your pricing.</p>}
          <div className="breakdown">{history.slice(0, 20).map((h) => <div className="breakdown-row" key={h.id}>
            <span>
              {h.fish_name} · {h.municipality_name} · {Number(h.weight_kg)} kg × {peso(h.price_per_kg)}
              <small style={{ display: "block", color: "#64748b" }}>Saved {new Date(h.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}{h.price_date ? ` · price of ${h.price_date}` : ""}</small>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong>{peso(h.computed_price)}</strong>
              <button className="secondary-btn" style={{ padding: "2px 8px" }} title="Remove" aria-label={`Remove ${h.fish_name} calculation`} onClick={() => removeEntry(h)}>✕</button>
            </span>
          </div>)}</div>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   EXPORT REPORTS
   ================================================================ */

function ExportReports({ mySuggestions = [], suggestionsLoading, suggestionsError, records = [], loading, error, municipality, onMunicipalityChange, availableMunicipalities = [], defaultMunicipality = "", registeredSpecies = [], notify }) {
  const [reportType, setReportType] = useState("Published LGU Price History");
  const [speciesId, setSpeciesId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const speciesOptions = [...new Map([
    ...registeredSpecies.map((s) => [String(s.id), { id: String(s.id), name: s.name }]),
    ...records.map((r) => [String(r.fish_species), { id: String(r.fish_species), name: r.fish_name }]),
  ].filter(([, value]) => value.name)).values()].sort((a, b) => a.name.localeCompare(b.name));
  const invalidDates = Boolean(fromDate && toDate && fromDate > toDate);
  const isOfficial = reportType === "Published LGU Price History";
  const matchesFilters = (row) => {
    const name = String(row.municipality_name || row.municipalityName || "").trim().toLowerCase();
    const date = String(row.recorded_date || row.date || "").slice(0, 10);
    const fishId = String(row.fish_species ?? row.speciesId ?? "");
    return (!municipality || name === municipality.trim().toLowerCase()) &&
      (!speciesId || fishId === speciesId) &&
      (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  };
  const filteredOfficial = records.filter((r) =>
    (r.status === "published" || r.status === undefined) && matchesFilters(r)
  ).sort((a, b) => String(a.recorded_date).localeCompare(String(b.recorded_date)) || Number(a.id) - Number(b.id));
  const filteredSuggestions = mySuggestions.filter(matchesFilters).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const selectedRows = isOfficial ? filteredOfficial : filteredSuggestions;
  const busy = isOfficial ? loading : suggestionsLoading;
  const loadError = isOfficial ? error : suggestionsError;

  // Quote every CSV cell and prevent spreadsheet formula execution from untrusted comments/names.
  const csvCell = (value) => {
    let content = value === null || value === undefined ? "" : String(value);
    if (/^[\s\u0000-\u001f]*[=+@\-]/.test(content) && !/^-[0-9]+(?:\.[0-9]+)?$/.test(content)) content = "'" + content;
    return '"' + content.replace(/"/g, '""') + '"';
  };
  const exportCSV = () => {
    if (busy || loadError || invalidDates || selectedRows.length === 0) return;
    const columns = isOfficial
      ? ["Record ID", "Recorded Date", "Municipality", "Fish Species", "Price per KG (PHP)", "Status", "Source", "Published At"]
      : ["Submission ID", "Submitted Date", "Municipality", "Fish Species", "Suggested Price per KG (PHP)", "Status", "Comment", "LGU Feedback"];
    const data = isOfficial
      ? filteredOfficial.map((r) => [r.id, r.recorded_date, r.municipality_name, r.fish_name, r.price_per_kg, r.status || "published", r.source, r.published_at])
      : filteredSuggestions.map((s) => [s.id, s.date, s.municipalityName, s.species, s.suggestedPrice, s.status, s.comment, s.lguFeedback || s.feedback]);
    const csv = [columns, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${isOfficial ? "aquatimbang_published_lgu_prices" : "aquatimbang_my_suggestions"}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Exported ${selectedRows.length} ${isOfficial ? "published price" : "suggestion"} record(s) to CSV.`);
  };

  const fieldStyle = { minWidth: 180, maxWidth: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white" };
  return (
    <>
      <div className="page-title"><div><h2>Export Reports</h2>
        <p>Download actual AquaTimbang records as Excel-compatible CSV files. No simulated prices.</p>
      </div></div>
      <div className="notice"><div className="notice-icon">!</div><div>
        <strong>Published LGU prices and vendor suggestions are separate reports</strong>
        <p>Suggestions are not official LGU prices. Exports reflect records loaded from Django in this session.</p>
      </div></div>
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end", marginBottom: 18 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 600 }}>Report type
            <select style={fieldStyle} value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option>Published LGU Price History</option><option>My Suggested Prices</option>
            </select>
          </label>
        </div>
        <PriceMunicipalitySelector records={records} municipality={municipality} onMunicipalityChange={onMunicipalityChange} availableMunicipalities={availableMunicipalities} defaultMunicipality={defaultMunicipality} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 600 }}>Fish species
            <select style={fieldStyle} value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
              <option value="">All fish species</option>
              {speciesOptions.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 7, fontWeight: 600 }}>Date from
            <input style={fieldStyle} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 7, fontWeight: 600 }}>Date to
            <input style={fieldStyle} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <button className="secondary-btn" type="button" onClick={() => { setSpeciesId(""); setFromDate(""); setToDate(""); onMunicipalityChange(""); }}>Clear filters</button>
        </div>
        {invalidDates && <p style={{ color: "#b91c1c", marginTop: 14 }}>The start date must be on or before the end date.</p>}
        {busy ? <p style={{ marginTop: 18 }}>Loading records...</p> :
         loadError ? <p style={{ color: "#b91c1c", marginTop: 18 }}>Could not load report data: {loadError}</p> :
         <p style={{ marginTop: 18, color: "#64748b" }}>{selectedRows.length} matching {isOfficial ? "published LGU price" : "your suggestion"} record(s). {selectedRows.length === 0 ? "Adjust your filters to find records." : "Ready to export."}</p>}
        <button className="primary-btn" type="button" onClick={exportCSV} disabled={busy || Boolean(loadError) || invalidDates || selectedRows.length === 0} style={{ marginTop: 12 }}>
          ↓ Export {selectedRows.length} Record(s) as CSV
        </button>
      </div>
    </>
  );
}

/* ================================================================
   NOTIFICATIONS
   ================================================================ */

function Notifications({ notifications, dismissedNotifs, setDismissedNotifs, goTo }) {
  const dismiss = (id) => setDismissedNotifs((prev) => [...prev, id]);
  const visible = notifications.filter((n) => !dismissedNotifs.includes(n.id));
  const iconFor = (type) => (type === "danger" ? "⚠" : "ℹ");
  const bgFor = (type) => (type === "danger" ? "purple-bg" : "blue-bg");

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Notifications</h2>
          <p>Updates about your suggestions and today's official prices.</p>
        </div>
        {dismissedNotifs.length > 0 && (
          <button className="secondary-btn" onClick={() => setDismissedNotifs([])}>Restore Dismissed</button>
        )}
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
   HELP / HOW TO USE
   ================================================================ */

function HelpPage() {
  const steps = [
    { title: "Check today's prices", text: "Open Current Fish Prices to see LGU-validated rates for every species before you head to the market." },
    { title: "Compute a fair price", text: "Use the Fair Price Calculator — enter the weight you're selling and it multiplies it by the official rate automatically." },
    { title: "Suggest a correction", text: "If a price looks off, go to Submit Suggested Price. Add a comment explaining why so the LGU officer has context." },
    { title: "Track your suggestions", text: "My Suggested Prices shows the status of everything you've submitted, plus any feedback from the LGU officer." },
    { title: "Compare with other vendors", text: "Community Average shows what other fisherfolk are suggesting, so you can see if your numbers line up." },
    { title: "Watch the forecast", text: "Price Forecast gives you a short-term projection so you can plan ahead for buying or selling." },
  ];

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Help / How to Use</h2>
          <p>A quick walkthrough of everything you can do in AquaTimbang.</p>
        </div>
      </div>

      <div className="panel">
        {steps.map((s, i) => (
          <div className="activity" key={i}>
            <div className="activity-icon blue-bg">{i + 1}</div>
            <div>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="notice" style={{ marginTop: 18 }}>
        <div className="notice-icon">?</div>
        <div>
          <strong>Still need help?</strong>
          <p>Visit your local LGU office or reach out through the market coordinator for further assistance.</p>
        </div>
      </div>
    </>
  );
}


// Database-backed vendor views. Other legacy pages remain unchanged.
function latestPublishedRows(records, municipality) {
  const filtered = (records || []).filter((r) =>
    (!municipality || String(r.municipality_name || "").toLowerCase() === String(municipality).toLowerCase()) &&
    Number(r.price_per_kg) > 0 && r.recorded_date
  );
  const groups = new Map();
  filtered.forEach((r) => {
    const key = `${r.fish_species}|${r.municipality}`;
    const old = groups.get(key);
    if (!old || String(r.recorded_date) > String(old.recorded_date) ||
      (r.recorded_date === old.recorded_date && r.id > old.id)) groups.set(key, r);
  });
  return [...groups.values()].sort((a, b) => String(a.fish_name).localeCompare(String(b.fish_name)));
}
function PriceMunicipalitySelector({ records, municipality, onMunicipalityChange, availableMunicipalities = [], defaultMunicipality = "" }) {
  // Preserve all registered municipalities even when none has a published price.
  const names = [
    ...availableMunicipalities,
    ...(records || []).map((record) => record.municipality_name),
    defaultMunicipality,
    municipality,
  ];
  const unique = new Map();
  names.forEach((value) => {
    const name = String(value || "").trim();
    if (name && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
  });
  const options = [...unique.values()].sort((a, b) => a.localeCompare(b));
  return <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
    <label htmlFor="published-municipality" style={{ fontWeight: 600 }}>Municipality:</label>
    <select id="published-municipality" value={municipality} onChange={(e) => onMunicipalityChange(e.target.value)} style={{ minWidth: 220, maxWidth: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white" }}>
      <option value="">All municipalities</option>
      {options.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
    <span style={{ color: "#64748b", fontSize: 13 }}>Municipalities remain selectable even when they have no published prices.</span>
  </div>;
}
function PublishedState({ loading, error, records, municipality }) {
  if (loading) return <div className="panel" style={{ padding: 24 }}>Loading published prices from AquaTimbang…</div>;
  if (error) return <div className="panel" style={{ padding: 24, color: "#b42318" }}>Could not load official prices: {error}</div>;
  if (!latestPublishedRows(records, municipality).length) return <div className="panel" style={{ padding: 24 }}>No published LGU prices are available{municipality ? ` for ${municipality}` : ""} yet.</div>;
  return null;
}
function LivePublishedPrices({ records, loading, error, municipality, onMunicipalityChange, availableMunicipalities, defaultMunicipality }) {
  const rows = latestPublishedRows(records, municipality);
  return <>
    <div className="page-title"><div><h2>Current Fish Prices</h2><p>Latest published LGU prices{municipality ? ` · ${municipality}` : ""}. No demo prices.</p></div></div>
    <PriceMunicipalitySelector records={records} municipality={municipality} onMunicipalityChange={onMunicipalityChange} availableMunicipalities={availableMunicipalities} defaultMunicipality={defaultMunicipality} />
    <PublishedState loading={loading} error={error} records={records} municipality={municipality} />
    {!loading && !error && rows.length > 0 && <div className="panel" style={{ overflowX: "auto" }}><table>
      <thead><tr><th>FISH SPECIES</th><th>MUNICIPALITY</th><th>OFFICIAL PRICE / KG</th><th>RECORDED DATE</th><th>STATUS</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={`${r.fish_species}-${r.municipality}`}><td><strong>{r.fish_name || `Species #${r.fish_species}`}</strong></td><td>{r.municipality_name || "—"}</td><td><strong>{peso(r.price_per_kg)}</strong></td><td>{r.recorded_date}</td><td><span className="badge success">Published</span></td></tr>)}</tbody>
    </table></div>}
  </>;
}
function LiveVendorDashboard({ records, loading, error, municipality, onMunicipalityChange, availableMunicipalities, defaultMunicipality, vendorName, goTo, mySuggestions }) {
  const rows = latestPublishedRows(records, municipality);
  const average = rows.length ? rows.reduce((sum, r) => sum + Number(r.price_per_kg), 0) / rows.length : null;
  const pending = mySuggestions.filter((s) => s.status === "Pending Review").length;
  return <>
    <div className="welcome-card"><div><span className="eyebrow">FISH VENDOR</span><h2>Welcome, {vendorName.split(" ")[0]}!</h2><p>Published LGU prices from the AquaTimbang database{municipality ? ` for ${municipality}` : ""}.</p></div><div className="welcome-fish">🐟</div></div>
    <PriceMunicipalitySelector records={records} municipality={municipality} onMunicipalityChange={onMunicipalityChange} availableMunicipalities={availableMunicipalities} defaultMunicipality={defaultMunicipality} />
    <div className="config-grid" style={{ marginBottom: 18 }}>
      <div className="config-card"><h3>Published Species</h3><h2>{loading ? "…" : rows.length}</h2></div>
      <div className="config-card"><h3>Average Published Price / KG</h3><h2>{loading ? "…" : peso(average)}</h2></div>
      <div className="config-card"><h3>My Pending Suggestions</h3><h2>{pending}</h2></div>
    </div>
    <PublishedState loading={loading} error={error} records={records} municipality={municipality} />
    {!loading && !error && rows.length > 0 && <div className="panel" style={{ overflowX: "auto" }}><div className="panel-header"><div><h3>Latest Official Fish Prices</h3><p>Only LGU-published records</p></div><button className="primary-btn" onClick={() => goTo("Current Fish Prices")}>View All Prices</button></div><table><thead><tr><th>SPECIES</th><th>PRICE / KG</th><th>AS OF</th></tr></thead><tbody>{rows.slice(0, 8).map((r) => <tr key={`${r.fish_species}-${r.municipality}`}><td>{r.fish_name}</td><td><strong>{peso(r.price_per_kg)}</strong></td><td>{r.recorded_date}</td></tr>)}</tbody></table></div>}
  </>;
}

export default Vendor;