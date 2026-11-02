import React from "react";
import { useProtectedImage } from "../api/images.js";

// The logged-in user's photo, or their initials when they have none.
export function UserAvatar({ profile, initials, small = false }) {
  const photo = useProtectedImage(
    profile?.has_photo ? `/auth/me/photo/?v=${encodeURIComponent(profile.photo_version || "")}` : ""
  );
  return (
    <div className={`avatar${small ? " small" : ""}${photo ? " avatar-photo" : ""}`}>
      {photo ? <img src={photo} alt="" /> : initials}
    </div>
  );
}

// Notification button with a bell icon and the number of unread items.
export function NotificationBell({ count = 0, onClick, label = "Notifications" }) {
  return (
    <button className="notification-bell" onClick={onClick} aria-label={count ? `${label}: ${count} unread` : label} title={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {count > 0 && <span className="bell-count">{count > 9 ? "9+" : count}</span>}
    </button>
  );
}
