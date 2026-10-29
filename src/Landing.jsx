import React, { useEffect, useState } from "react";
import "./App.css";
import "./Landing.css";
import { apiUrl } from "./api/config.js";

function Landing({ onGetStarted, onRegister }) {
  const [section, setSection] = useState("home");
  const [summary, setSummary] = useState(null);

  // Load live counts from Django for the stats row.
  useEffect(() => {
    fetch(apiUrl("/public/summary/"))
      .then((response) => (response.ok ? response.json() : null))
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const audiences = [
    { icon: "🐟", title: "Fisherfolk & Vendors", desc: "Check official prices, compute fair selling amounts, and suggest a price if something looks off." },
    { icon: "✔", title: "LGU Officers", desc: "Encode, validate, and publish official prices, and review fisherfolk suggestions." },
    { icon: "⚙", title: "Administrators", desc: "Manage users, species, markets, and system-wide settings." },
  ];

  const chips = [
    { icon: "📋", label: "Current & Historical Prices" },
    { icon: "🧮", label: "Fair Price Calculator" },
    { icon: "💬", label: "Suggested Prices" },
    { icon: "📈", label: "Trends & Forecasts" },
  ];

  const count = (value) => (summary ? String(value ?? 0) : "—");
  const stats = [
    { value: count(summary?.species_count), label: "Fish Species Tracked" },
    { value: count(summary?.municipality_count), label: "Municipalities Covered" },
    { value: count(summary?.published_price_count), label: "LGU-Validated Prices" },
  ];

  return (
    <div className="landing">

      {/* TRANSPARENT BLACK NAV */}
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="landing-brand-icon">🐟</div>
          <div>
            <h2>AquaTimbang</h2>
            <span>Fish Price Transparency</span>
          </div>
        </div>

        <nav className="landing-nav-links">
          <button className={`landing-nav-link ${section === "home" ? "landing-nav-link-active" : ""}`} onClick={() => setSection("home")}>Home</button>
          <button className={`landing-nav-link ${section === "about" ? "landing-nav-link-active" : ""}`} onClick={() => setSection("about")}>About</button>
          <button className={`landing-nav-link ${section === "contact" ? "landing-nav-link-active" : ""}`} onClick={() => setSection("contact")}>Contact</button>
          <span className="landing-nav-divider"></span>
          <button className="landing-nav-login" onClick={onGetStarted}>Login</button>
          <button className="landing-nav-register" onClick={onRegister}>Register</button>
        </nav>
      </header>

      {/* STATIC FULL-HEIGHT STAGE */}
      <main className="landing-stage">

        {section === "home" && (
          <div className="landing-panel landing-home">
            <div className="landing-home-text">
              <span className="landing-eyebrow">PREDICTIVE ANALYTICS · FISH PRICE TRANSPARENCY</span>
              <h1>
                AquaTimbang provides accessible fish price information and
                predictive insights to support informed and transparent
                market decision-making.
              </h1>
              <p>
                AquaTimbang is a fish price transparency system that helps
                fisherfolk, vendors, and local government units access fish
                price information, submit price suggestions, view price
                trends, and use predictive analytics to support informed
                market decisions.
              </p>

              <div className="landing-cta-row">
                <button className="primary-btn landing-cta" onClick={onGetStarted}>Get Started</button>
                <button className="landing-cta-secondary" onClick={() => setSection("about")}>Learn more →</button>
              </div>

              <div className="landing-stats">
                {stats.map((s) => (
                  <div className="landing-stat" key={s.label}>
                    <strong>{s.value}</strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>

              <div className="landing-chip-row">
                {chips.map((c) => (
                  <span className="landing-chip" key={c.label}>{c.icon} {c.label}</span>
                ))}
              </div>
            </div>

            <div className="landing-home-visual">
              {(summary?.featured_prices || []).map((item, index) => {
                const change = item.weekly_change_percent;
                return (
                  <div className={`landing-price-card${index === 1 ? " landing-price-card-2" : ""}`} key={`${item.fish_name}-${item.municipality_name}`}>
                    <span>{item.fish_name} · {item.municipality_name}</span>
                    <strong>₱{Number(item.price_per_kg).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    <small className={change === null ? "" : change >= 0 ? "up" : "down"}>
                      {change === null ? "" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}% vs last week · `}LGU Validated
                    </small>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === "about" && (
          <div className="landing-panel landing-about-panel">
            <h2 className="landing-section-title">About AquaTimbang</h2>
            <p className="landing-about-text">
              AquaTimbang is a predictive analytics-driven fish price
              transparency system designed to provide accessible and
              reliable fish price information for fisherfolk, vendors, and
              local government units. The system allows users to view
              current and historical fish prices, submit suggested prices,
              calculate estimated fish values based on weight, and access
              price trends and forecasts. Through the collection and
              analysis of price information, AquaTimbang aims to support
              informed market decision-making and promote a more organized
              and transparent fish pricing process.
            </p>

            <div className="landing-audience-grid">
              {audiences.map((a) => (
                <div className="landing-audience-card" key={a.title}>
                  <div className="landing-audience-icon">{a.icon}</div>
                  <strong>{a.title}</strong>
                  <p>{a.desc}</p>
                </div>
              ))}
            </div>

            <button className="primary-btn landing-cta" onClick={onGetStarted}>Get Started</button>
          </div>
        )}

        {section === "contact" && (
          <div className="landing-panel landing-contact-panel">
            <h2 className="landing-section-title">Contact Us</h2>
            <p className="landing-contact-intro">
              Have questions about AquaTimbang or need help with your account?
              Reach out to the local LGU market office.
            </p>

            <div className="landing-contact-grid">
              <div className="landing-contact-item">
                <span>📍</span>
                <div><strong>Address</strong><p>Pasil Fish Market, Cebu City, Philippines</p></div>
              </div>
              <div className="landing-contact-item">
                <span>✉️</span>
                <div><strong>Email</strong><p>support@aquatimbang.ph</p></div>
              </div>
              <div className="landing-contact-item">
                <span>📞</span>
                <div><strong>Phone</strong><p>(032) 000 0000</p></div>
              </div>
            </div>
          </div>
        )}

        <footer className="landing-footer">
          <span>© 2026 AquaTimbang — Fish Price Transparency System</span>
        </footer>
      </main>
    </div>
  );
}

export default Landing; 