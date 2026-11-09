import React from "react";

// "5 minutes ago", "2 hours ago", "Nov 3" …
export function timeAgo(iso) {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/** Green "Online" or grey "Offline · last seen …". */
export default function Presence({ online, lastSeen }) {
  return (
    <span className={`presence ${online ? "on" : "off"}`} title={lastSeen ? new Date(lastSeen).toLocaleString("en-PH") : "Never used yet"}>
      <span className="presence-dot" aria-hidden="true" />
      {online ? "Online" : <>Offline<small>{lastSeen ? `last seen ${timeAgo(lastSeen)}` : "never logged in"}</small></>}
    </span>
  );
}
