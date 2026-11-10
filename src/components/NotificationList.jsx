import React, { useEffect, useState } from "react";

const plain = (text) => text;

// "Today", "Yesterday" or "Earlier" for a date (missing dates count as today:
// they are things that need attention now, like items waiting for review).
export function dayGroup(iso) {
  if (!iso) return "Today";
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "Today";
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "Earlier";
}

export const GROUP_ORDER = ["Today", "Yesterday", "Earlier"];

// Split items into Today / Yesterday / Earlier, newest first inside each.
export function groupByDay(items, dateOf) {
  const sorted = [...items].sort((a, b) => String(dateOf(b) || "9999").localeCompare(String(dateOf(a) || "9999")));
  return GROUP_ORDER
    .map((label) => ({ label, items: sorted.filter((item) => dayGroup(dateOf(item)) === label) }))
    .filter((group) => group.items.length);
}

const when = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
  if (String(iso).length === 10) return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  return dayGroup(iso) === "Earlier"
    ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    : d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

/**
 * Notifications page body shared by the Vendor, LGU and Admin dashboards.
 *
 * Each notification: { id, type, title, detail, page?, at?, announcement? }
 *   at:           when it happened (ISO date or date-time)
 *   announcement: the full announcement, opened by the eye button
 *   page:         where the eye button goes for other notifications
 */
export default function NotificationList({ notifications, dismissedNotifs, setDismissedNotifs, goTo, title, subtitle, t = plain }) {
  const [open, setOpen] = useState(null);
  const dismiss = (id) => setDismissedNotifs((prev) => [...prev, id]);
  const visible = notifications.filter((n) => !dismissedNotifs.includes(n.id));
  const groups = groupByDay(visible, (n) => n.at);
  const iconFor = (type) => (type === "danger" ? "⚠" : type === "warning" ? "⏳" : "ℹ");
  const bgFor = (type) => (type === "danger" ? "purple-bg" : "blue-bg");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const view = (n) => {
    if (n.announcement) setOpen(n.announcement);
    else if (n.page && n.page !== "Notifications") goTo(n.page);
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {dismissedNotifs.length > 0 && (
          <button className="secondary-btn" onClick={() => setDismissedNotifs([])}>{t("Restore Dismissed")}</button>
        )}
      </div>

      <div className="panel notif-panel">
        {groups.length === 0 ? (
          <p className="empty-row">{t("You're all caught up.")}</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="notif-group">
              <h4 className="notif-group-title">{t(group.label)}</h4>
              {group.items.map((n) => (
                <div className="activity" key={n.id}>
                  <div className={`activity-icon ${bgFor(n.type)}`}>{iconFor(n.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{n.title}</strong>
                    <p className="notif-detail">{n.detail}</p>
                    {n.at && <small className="notif-when">{when(n.at)}</small>}
                  </div>
                  <div className="action-icons" style={{ alignSelf: "center" }}>
                    {(n.announcement || (n.page && n.page !== "Notifications")) && (
                      <button title={n.announcement ? t("Read announcement") : t("Open")} onClick={() => view(n)}>👁</button>
                    )}
                    <button title={t("Dismiss")} onClick={() => dismiss(n.id)}>✕</button>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      {open && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="modal announce-modal" role="dialog" aria-modal="true" aria-labelledby="notif-announce-title">
            <div className="announce-head">
              <span className="announce-icon" aria-hidden="true">📢</span>
              <div>
                <small>{t("Announcement")}</small>
                <h3 id="notif-announce-title">{open.title}</h3>
              </div>
            </div>
            <div className="announce-list">
              <article>
                <p>{open.message}</p>
                <small>
                  {new Date(open.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                  {open.created_by_name ? ` · ${t("from")} ${open.created_by_name}` : ""}
                </small>
              </article>
            </div>
            <div className="button-row"><button className="primary-btn" onClick={() => setOpen(null)} autoFocus>{t("Close")}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
