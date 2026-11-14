import React from "react";

/*
 * Grouped menu items. A sidebar item may hold several pages as tabs:
 *   { name: "Fish Prices", icon: "₱", tabs: ["Current Fish Prices", "Price Trends"] }
 * The active page stays the page's own name, so links and notifications
 * that open a page by name keep working; the sidebar highlights its group.
 */

/** The sidebar item that holds this page (itself or a group with it as a tab). */
export function itemFor(menuGroups, page) {
  for (const group of menuGroups) {
    for (const item of group.items) {
      if (item.name === page || item.tabs?.includes(page)) return item;
    }
  }
  return null;
}

/** True when this sidebar item is (or holds) the open page. */
export const isActiveItem = (item, page) => item.name === page || Boolean(item.tabs?.includes(page));

/** The page a sidebar item opens: its first tab, or itself. */
export const firstPage = (item) => (item.tabs ? item.tabs[0] : item.name);

// A picture for each tab, so it is recognised before it is read.
const TAB_ICONS = {
  "Current Fish Prices": "🐟", "Price Trends": "📈", "Price Forecast": "🔮",
  "Submit Suggested Price": "✍️", "My Suggested Prices": "📋", "Community Average": "👥",
  "Vendor Registrations": "🆕", "Vendor Management": "🧑‍🤝‍🧑",
  "Official Reference Prices": "₱", "Price Comparison": "⚖️",
  "Market Insights": "💡", "Price Anomalies": "⚠️", "External Factors": "🌦️",
  "Reports": "📄", "Validation History": "✅", "Audit Log": "🕘",
  "Price Records": "₱", "Vendor Suggestions": "💬", "Import Price History": "⬆️",
  "Predictive Analytics": "🔮", "Data Monitoring": "📊",
  "Reports Management": "📄", "Activity Logs": "🕘",
  "System Configuration": "⚙️", "System Announcements": "📢",
};

/** Tab bar shown above a page that belongs to a group. */
export default function PageTabs({ menuGroups, page, onSelect, translate = (text) => text }) {
  const item = itemFor(menuGroups, page);
  if (!item?.tabs || item.tabs.length < 2) return null;
  return (
    <div className="page-tabs" role="tablist" aria-label={translate(item.name)}>
      {item.tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === page}
          className={tab === page ? "active" : ""}
          onClick={() => onSelect(tab)}
        >
          <span className="page-tab-icon" aria-hidden="true">{TAB_ICONS[tab] || "•"}</span>
          <span>{translate(tab)}</span>
        </button>
      ))}
    </div>
  );
}
