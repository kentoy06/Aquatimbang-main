import { BrandMark } from "./components/BrandLogo.jsx";
import React, { useEffect, useState } from "react";
import "./App.css";
import "./Landing.css";
import { apiUrl } from "./api/config.js";
import { FishThumb } from "./components/FishPhoto.jsx";
import FishProfileModal from "./components/FishProfileModal.jsx";

const peso = (value) =>
  `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "";

// Optional cover photo: put a picture at public/images/hero.jpg to use it.
const HERO_PHOTO = `${import.meta.env.BASE_URL}images/hero.jpg`;

// Drawn underwater scene shown behind the cover text (and under the photo, if any).
function OceanScene() {
  const fish = (x, y, scale, color, flip = false, key) => (
    <g key={key} transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`} className="scene-fish">
      <path d="M0 0 C 30 -26, 92 -26, 120 0 C 92 26, 30 26, 0 0 Z" fill={color} />
      <path d="M118 0 L 152 -22 L 146 0 L 152 22 Z" fill={color} opacity="0.85" />
      <path d="M52 -17 C 64 -34, 82 -34, 90 -19 Z" fill={color} opacity="0.7" />
      <circle cx="22" cy="-4" r="3.2" fill="#04101c" />
    </g>
  );
  return (
    <svg className="ocean-scene" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d3150" />
          <stop offset="0.55" stopColor="#081d31" />
          <stop offset="1" stopColor="#030b14" />
        </linearGradient>
        <radialGradient id="glow" cx="0.72" cy="0.18" r="0.55">
          <stop offset="0" stopColor="#3fc1d9" stopOpacity="0.38" />
          <stop offset="1" stopColor="#3fc1d9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bdf2ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#bdf2ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bigFish" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4fd1e8" />
          <stop offset="0.6" stopColor="#1b6fa8" />
          <stop offset="1" stopColor="#0b2a4a" />
        </linearGradient>
      </defs>
      <rect width="1440" height="900" fill="url(#water)" />
      <rect width="1440" height="900" fill="url(#glow)" />
      {[[880, 0, 980, 0, 820, 900, 640, 900], [1040, 0, 1110, 0, 1060, 900, 900, 900], [1190, 0, 1240, 0, 1290, 900, 1150, 900]].map((p, i) => (
        <polygon key={i} points={`${p[0]},${p[1]} ${p[2]},${p[3]} ${p[4]},${p[5]} ${p[6]},${p[7]}`} fill="url(#ray)" />
      ))}
      {/* School of small fish */}
      {[[760, 520, 0.42, "#2a8fb8"], [840, 560, 0.34, "#2a8fb8"], [700, 600, 0.3, "#1f7aa3"], [930, 610, 0.28, "#1f7aa3"], [610, 470, 0.25, "#1b6a90"], [1000, 520, 0.3, "#2a8fb8"]]
        .map(([x, y, s, c], i) => fish(x, y, s, c, true, `s${i}`))}
      {/* Large fish with orange fins */}
      <g className="scene-big-fish" transform="translate(1210 300) scale(-1.9 1.9)">
        <path d="M0 0 C 34 -42, 110 -46, 150 -8 C 116 30, 40 40, 0 0 Z" fill="url(#bigFish)" />
        <path d="M146 -8 C 176 -48, 214 -40, 222 -54 C 214 -10, 206 10, 222 40 C 206 30, 174 34, 146 -8 Z" fill="#ff7a1a" opacity="0.92" />
        <path d="M60 -34 C 70 -66, 104 -72, 118 -40 Z" fill="#ff7a1a" opacity="0.85" />
        <path d="M70 22 C 80 46, 100 48, 108 26 Z" fill="#ff4d5e" opacity="0.8" />
        <circle cx="26" cy="-8" r="5" fill="#04101c" />
        <circle cx="27.5" cy="-9.5" r="1.6" fill="#ffffff" />
      </g>
      {/* Bubbles */}
      {[[1150, 180, 6], [1170, 140, 4], [1135, 110, 3], [820, 300, 5], [835, 262, 3], [480, 640, 4], [500, 600, 3]].map(([x, y, r], i) => (
        <circle key={i} className="scene-bubble" cx={x} cy={y} r={r} fill="none" stroke="#bdf2ff" strokeOpacity="0.55" strokeWidth="1.4" />
      ))}
      {/* Seabed */}
      <path d="M0 820 C 160 760, 300 800, 420 770 C 560 735, 640 800, 780 780 C 920 760, 1040 700, 1180 740 C 1300 772, 1380 740, 1440 750 L 1440 900 L 0 900 Z" fill="#04101c" />
      <path d="M0 860 C 200 820, 360 860, 540 840 C 720 820, 900 870, 1080 846 C 1240 826, 1340 860, 1440 846 L 1440 900 L 0 900 Z" fill="#020812" />
    </svg>
  );
}

function Landing({ onGetStarted, onRegister }) {
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [photoOk, setPhotoOk] = useState(true);
  // "current": checked recently; "older": not checked recently.
  const [priceView, setPriceView] = useState("current");

  useEffect(() => {
    fetch(apiUrl("/public/summary/"))
      .then((response) => (response.ok ? response.json() : null))
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  // One screen only: the top buttons switch what is shown (no scrolling).
  const [section, setSection] = useState("home");
  const show = (name) => setSection(name);

  const count = (value) => (summary ? Number(value ?? 0).toLocaleString() : "—");
  const allPrices = summary?.today_prices || [];
  // Fish shown under "Current prices" (checked recently), counted once each.
  const currentFish = new Set(allPrices.filter((p) => p.current !== false).map((p) => p.fish_id)).size;
  const stats = [
    { value: summary ? count(currentFish) : count(null), label: "Fish with current prices",
      title: `Fish the LGU checked within ${summary?.fresh_days || 15} days of its latest update` },
    { value: count(summary?.municipality_count), label: "Municipalities" },
    { value: count(summary?.published_price_count), label: "Prices recorded", note: "all dates",
      title: "Every official price the LGU has published, on every date. This history is used for trends and forecasts." },
  ];
  const latestDate = summary?.latest_published_date;
  const freshDays = summary?.fresh_days || 15;
  // Older servers do not send "current": treat every price as current then.
  const currentPrices = allPrices.filter((p) => p.current !== false);
  const olderPrices = allPrices.filter((p) => p.current === false);
  const prices = priceView === "older" ? olderPrices : currentPrices;

  const audiences = [
    { icon: "🐟", title: "Fish Vendors", desc: "Check official prices, compute fair selling amounts, and suggest a price when the market looks different." },
    { icon: "✔", title: "LGU Officers", desc: "Encode, validate and publish official prices, review vendor suggestions, and approve vendor accounts." },
    { icon: "📈", title: "Administrators", desc: "Manage users, species and markets, watch price forecasts, and generate reports." },
  ];

  return (
    <div className="landing">
      {/* COVER */}
      <section className="hero" id="home">
        <div className="hero-bg" aria-hidden="true">
          <OceanScene />
          {photoOk && <img className="hero-photo" src={HERO_PHOTO} alt="" onError={() => setPhotoOk(false)} />}
          <div className="hero-shade" />
        </div>

        <header className="landing-nav">
          <button className="landing-brand" onClick={() => show("home")}>
            <span className="landing-logo landing-logo-img"><BrandMark /></span>
            <span className="landing-brand-name">AquaTimbang</span>
          </button>
          <nav className="landing-links" aria-label="Main">
            {[["home", "Home"], ["prices", "Prices"], ["about", "About"], ["contact", "Contact"]].map(([key, label]) => (
              <button key={key} onClick={() => show(key)} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined}>
                {label}
              </button>
            ))}
          </nav>
          <div className="landing-actions">
            <button className="landing-login" onClick={onGetStarted}>Login</button>
            <button className="pill-btn pill-orange" onClick={onRegister}>Register</button>
          </div>
        </header>

        {section === "home" && (
        <>
        <div className="hero-content">
          <span className="hero-tag">Fish price transparency · Cebu · Philippines</span>
          <span className="hero-eyebrow">Official · LGU-validated · Forecasted</span>
          <h1>Fair Fish Prices,<br />Clear as Ocean Water</h1>
          <p>
            See today's official price per kilo before you buy or sell. Fair price
            calculator, price trends and forecasts for fish vendors and LGUs.
          </p>
          <div className="hero-buttons">
            <button className="pill-btn pill-orange" onClick={() => show("prices")}>See Today's Prices</button>
            <button className="pill-btn pill-glass" onClick={onRegister}>Register as a Vendor</button>
          </div>
          <div className="hero-stats">
            {stats.map((s) => (
              <div key={s.label} title={s.title}>
                <strong>{s.value}</strong>
                <span>{s.label}{s.note && <small className="hero-stat-note"> · {s.note}</small>}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-cards">
          {(summary?.featured_prices || []).length > 0 && (
            <span className="hero-cards-label">Latest official LGU prices</span>
          )}
          {(summary?.featured_prices || []).map((item) => (
            <div className="hero-price-card" key={`${item.fish_name}-${item.municipality_name}`}>
              <span>{item.fish_name} · {item.municipality_name}</span>
              <strong>{peso(item.price_per_kg)}<small>/kg</small></strong>
              {item.weekly_change_percent !== null && (
                <em className={item.weekly_change_percent >= 0 ? "up" : "down"}>
                  {item.weekly_change_percent >= 0 ? "▲" : "▼"} {Math.abs(item.weekly_change_percent).toFixed(1)}% vs last week
                </em>
              )}
            </div>
          ))}
        </div>

        <div className="hero-side-label" aria-hidden="true"><span>TRANSPARENCY</span></div>
        </>
        )}

      {/* TODAY'S PRICES */}
        {section === "prices" && (
        <div className="landing-panel" id="prices">
        <span className="section-eyebrow">Today's market</span>
        <h2>Official Fish Prices</h2>
        <p className="section-lead">
          Official prices per kilo published by the LGU, newest first. Only prices checked within {freshDays} days
          of the latest update{latestDate ? ` (${formatDate(latestDate)})` : ""} are shown here; fish not checked
          since then are under Older prices. Tap a fish for its details.
        </p>
        {latestDate && allPrices.length > 0 && (
          <div className="price-view-toggle" role="group" aria-label="Which prices to show">
            <button type="button" className={priceView === "current" ? "active" : ""} onClick={() => setPriceView("current")}>
              Current prices <small>{currentPrices.length}</small>
            </button>
            <button type="button" className={priceView === "older" ? "active" : ""} onClick={() => setPriceView("older")} disabled={!olderPrices.length}>
              Older prices <small>{olderPrices.length}</small>
            </button>
          </div>
        )}
        {priceView === "older" && olderPrices.length > 0 && (
          <p className="older-note">
            These fish have not been checked by the LGU for more than {freshDays} days before the latest update.
            Their last official price is shown for reference only and may not match today's market.
          </p>
        )}
        {prices.length === 0 ? (
          <div className="landing-empty">{!summary ? "Loading prices…" : allPrices.length ? "No prices in this list." : "No official prices have been published yet."}</div>
        ) : (
          <div className="price-board">
            {prices.map((p) => (
              <button
                type="button"
                className="price-tile"
                key={`${p.fish_id}-${p.municipality_name}`}
                onClick={() => setProfile(p)}
                aria-label={`${p.fish_name} in ${p.municipality_name}: ${peso(p.price_per_kg)} per kilo. Show details`}
              >
                <FishThumb fish={{ id: p.fish_id, name: p.fish_name, has_photo: p.has_photo, updated_at: p.updated_at }} size={54} />
                <div>
                  <strong>{p.fish_name}</strong>
                  <span>{p.municipality_name}{p.market ? ` · ${p.market}` : ""}</span>
                  <span className={`price-date${p.recorded_date === latestDate ? " is-latest" : ""}`}>
                    {p.recorded_date === latestDate ? `Latest · ${formatDate(p.recorded_date)}` : `Last checked ${formatDate(p.recorded_date)}`}
                  </span>
                </div>
                <b>{peso(p.price_per_kg)}<small>/kg</small></b>
              </button>
            ))}
          </div>
        )}
        <div className="section-cta">
          <button className="pill-btn pill-orange" onClick={onGetStarted}>Log in for trends &amp; forecasts</button>
        </div>
        {profile && (
          <FishProfileModal
            item={profile}
            onClose={() => setProfile(null)}
            onLogin={() => { setProfile(null); onGetStarted(); }}
            onRegister={() => { setProfile(null); onRegister?.(); }}
          />
        )}
        </div>
        )}

      {/* ABOUT */}
        {section === "about" && (
        <div className="landing-panel" id="about">
        <span className="section-eyebrow">About the system</span>
        <h2>Prices Everyone Can Trust</h2>
        <p className="section-lead">
          AquaTimbang is a predictive analytics-driven fish price transparency system. Fish
          vendors and local government units see current and past official prices, suggest prices
          from the market floor, compute fair amounts by weight, and plan ahead with SARIMAX price forecasts.
        </p>
        <div className="audience-grid">
          {audiences.map((a) => (
            <div className="audience-card" key={a.title}>
              <span className="audience-icon">{a.icon}</span>
              <strong>{a.title}</strong>
              <p>{a.desc}</p>
            </div>
          ))}
        </div>
        </div>
        )}

      {/* CONTACT */}
        {section === "contact" && (
        <div className="landing-panel" id="contact">
        <span className="section-eyebrow">Get in touch</span>
        <h2>Contact Us</h2>
        <div className="contact-grid">
          <div><span>📍</span><strong>Address</strong><p>Pasil Fish Market, Cebu City, Philippines</p></div>
          <div><span>✉️</span><strong>Email</strong><p>support@aquatimbang.ph</p></div>
          <div><span>📞</span><strong>Phone</strong><p>(032) 000 0000</p></div>
        </div>
        </div>
        )}
      </section>

      <footer className="landing-footer">© 2026 AquaTimbang — Fish Price Transparency System</footer>
    </div>
  );
}

export default Landing;
