import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import {
  describeActivity,
  formatDate,
  formatDateTime,
  useMyActivity,
} from "../api/account.js";
import { useProtectedImage } from "../api/images.js";

// Change your own password. The server returns a new login token, which
// replaces the old one so this browser stays logged in.
function ChangePasswordCard({ notify }) {
  const empty = { current_password: "", new_password: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (form.new_password !== form.confirm) {
      setErrors({ confirm: "The new passwords don't match." });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const response = await fetch(apiUrl("/auth/change-password/"), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(data && typeof data === "object" ? data : { new_password: "Could not change your password." });
        return;
      }
      localStorage.setItem("authToken", data.token);
      setForm(empty);
      notify?.("Password changed. Other devices have been logged out.");
    } catch {
      setErrors({ new_password: "Unable to connect to the server." });
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, autoComplete) => (
    <div className="form-group">
      <label htmlFor={`pw-${key}`}>{label}</label>
      <input id={`pw-${key}`} type="password" autoComplete={autoComplete} value={form[key]} onChange={(e) => update(key, e.target.value)} />
      {(errors[key] || (key === "new_password" && errors.message)) && (
        <small style={{ display: "block", marginTop: 4, color: "#b42318", fontSize: 12 }}>{errors[key] || errors.message}</small>
      )}
    </div>
  );

  return (
    <div className="config-card">
      <div className="config-header">
        <div className="config-icon purple">🔑</div>
        <div><h3>Change Password</h3><p>Use at least 8 characters that are hard to guess</p></div>
      </div>
      {field("current_password", "Current Password", "current-password")}
      {field("new_password", "New Password", "new-password")}
      {field("confirm", "Confirm New Password", "new-password")}
      <button
        className="primary-btn full-btn"
        onClick={submit}
        disabled={saving || !form.current_password || !form.new_password}
      >
        {saving ? "Saving…" : "Change Password"}
      </button>
    </div>
  );
}

// Profile page shared by the Administrator, LGU Officer and Fish Vendor
// dashboards. Reads and saves the logged-in user's own record in Django.
function AccountProfile({ account, notify, description = "Manage your account details and see your recent activity.", children }) {
  const { profile, loading, error, save } = account;
  const photo = useProtectedImage(profile?.has_photo ? "/auth/me/photo/" : "");
  const { activity, loading: activityLoading, error: activityError } = useMyActivity();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Start editing from the latest saved profile.
  useEffect(() => {
    if (profile) {
      setDraft({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        email: profile.email || "",
        contact_number: profile.contact_number || "",
      });
    }
  }, [profile]);

  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!draft.first_name.trim() || !draft.email.trim()) {
      setSaveError("First name and email are required.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await save(draft);
      notify?.("Profile saved.");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="info-box">Loading your profile…</div>;
  if (error || !profile || !draft) return <div className="warn-box" role="alert">{error || "Unable to load your profile."}</div>;

  const details = profile.verification?.details || {};

  return (
    <>
      <div className="page-title">
        <div>
          <h2>My Profile</h2>
          <p>{description}</p>
        </div>
        <button className="primary-btn" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            {photo
              ? <img src={photo} alt="Your profile" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
              : <div className="config-icon blue">♙</div>}
            <div>
              <h3>Profile Information</h3>
              <p>Your registered account details</p>
            </div>
          </div>

          <div className="form-group">
            <label>First Name</label>
            <input value={draft.first_name} onChange={(e) => update("first_name", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input value={draft.last_name} onChange={(e) => update("last_name", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Contact Number</label>
            <input value={draft.contact_number} onChange={(e) => update("contact_number", e.target.value)} />
          </div>

          {saveError && <div className="warn-box" role="alert">{saveError}</div>}

          <div className="profile-grid" style={{ marginTop: 14 }}>
            <div className="profile-field"><span>Username</span><strong>{profile.username}</strong></div>
            <div className="profile-field"><span>Role</span><strong>{profile.role}</strong></div>
            <div className="profile-field"><span>Municipality</span><strong>{profile.municipality || "—"}</strong></div>
            {details.market_name && <div className="profile-field"><span>Market</span><strong>{details.market_name}{details.stall_number ? ` · Stall ${details.stall_number}` : ""}</strong></div>}
            {details.department && <div className="profile-field"><span>Office</span><strong>{details.department}{details.position ? ` · ${details.position}` : ""}</strong></div>}
            <div className="profile-field"><span>Registered</span><strong>{formatDate(profile.date_joined)}</strong></div>
            <div className="profile-field"><span>Last Login</span><strong>{formatDateTime(profile.last_login)}</strong></div>
          </div>
          <p style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
            To change your username, role or municipality, contact an Administrator.
          </p>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon orange">◷</div>
            <div>
              <h3>My Activity</h3>
              <p>Your recent actions recorded by AquaTimbang</p>
            </div>
          </div>

          {activityLoading && <div className="info-box">Loading activity…</div>}
          {activityError && <div className="warn-box" role="alert">{activityError}</div>}
          {!activityLoading && !activityError && activity.length === 0 && (
            <div className="info-box">No recorded activity yet.</div>
          )}
          <div className="history-list">
            {activity.slice(0, 15).map((log) => (
              <div className="history-item" key={log.id}>
                <div><strong>{describeActivity(log)}</strong></div>
                <small>{formatDateTime(log.created_at)}</small>
              </div>
            ))}
          </div>
        </div>

        {children}

        <ChangePasswordCard notify={notify} />
      </div>
    </>
  );
}

export default AccountProfile;
