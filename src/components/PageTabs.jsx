import React from "react";
import Icon from "./Icon.jsx";

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
  "Current Fish Prices": "fish", "Price Trends": "trend", "Price Forecast": "forecast",
  "Submit Suggested Price": "pencil", "My Suggested Prices": "list", "Community Average": "users",
  "Vendor Registrations": "check", "Vendor Management": "users",
  "Official Reference Prices": "tag", "Price Comparison": "scale",
  "Market Insights": "chart", "Price Anomalies": "alert", "External Factors": "cloud",
  "Reports": "file", "Validation History": "check", "Audit Log": "history",
  "Price Records": "tag", "Vendor Suggestions": "message", "Import Price History": "upload",
  "Predictive Analytics": "forecast", "Data Monitoring": "activity",
  "Reports Management": "file", "Activity Logs": "history",
  "System Configuration": "settings", "System Announcements": "megaphone",
};

// One plain sentence under the tabs saying what the open tab is for.
const TAB_HINTS = {
  "Current Fish Prices": "Today's price of each fish. Tap a fish to see its picture.",
  "Price Trends": "How the price of a fish went up or down over the past days.",
  "Price Forecast": "What the price of a fish may be in the coming days.",
  "Submit Suggested Price": "Think the price is wrong? Enter your price and choose why.",
  "My Suggested Prices": "Your suggestions, and a \u201cUsed\u201d mark when your price was published.",
  "Community Average": "The average price other vendors suggested, without their names.",
  "Vendor Registrations": "New vendors waiting for your approval.",
  "Vendor Management": "All vendors of your municipality.",
  "Official Reference Prices": "The latest published price of each fish.",
  "Price Comparison": "The price of one fish in different municipalities.",
  "Market Insights": "Conditions that often come with higher or lower prices.",
  "Price Anomalies": "Prices that look too high or too low compared with usual.",
  "External Factors": "Record fuel price, weather, holidays, and closed seasons.",
  "Reports": "Make and download reports.",
  "Validation History": "Every price action you took.",
  "Audit Log": "Everything you changed, with the date and time.",
  "Price Records": "All prices in the system.",
  "Vendor Suggestions": "Prices suggested by vendors, with their reasons.",
  "Import Price History": "Add past prices from a CSV file or a pasted list.",
  "Predictive Analytics": "Price forecasts and their accuracy.",
  "Data Monitoring": "How complete the price data is.",
  "Reports Management": "Make and download reports.",
  "Activity Logs": "Every important action, with who did it and when.",
  "System Configuration": "Price limits and the automatic publishing rule.",
  "System Announcements": "Messages shown to vendors and LGU officers.",
};

/** Tab bar shown above a page that belongs to a group. */
export default function PageTabs({ menuGroups, page, onSelect, translate = (text) => text }) {
  const item = itemFor(menuGroups, page);
  if (!item?.tabs || item.tabs.length < 2) return null;
  return (
    <>
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
          <span className="page-tab-icon" aria-hidden="true"><Icon name={TAB_ICONS[tab] || "list"} size={16} /></span>
          <span>{translate(tab)}</span>
        </button>
      ))}
    </div>
    {TAB_HINTS[page] && <p className="page-tab-hint"><span className="page-tab-hint-icon" aria-hidden="true"><Icon name="bulb" size={15} /></span>{translate(TAB_HINTS[page])}</p>}
    </>
  );
}
