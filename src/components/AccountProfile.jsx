import React, { useEffect, useState } from "react";
import { askConfirm } from "./ConfirmDialog.jsx";
import PasswordInput from "./PasswordInput.jsx";
import { apiUrl, authHeaders } from "../api/config.js";
import {
  describeActivity,
  formatDate,
  formatDateTime,
  useMyActivity,
} from "../api/account.js";
import { checkUpload, compressImage, useProtectedImage } from "../api/images.js";
import { PhotoSourceButtons } from "./CameraCapture.jsx";

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
      <PasswordInput id={`pw-${key}`} autoComplete={autoComplete} value={form[key]} onChange={(e) => update(key, e.target.value)} />
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

// Upload, change or remove your own profile photo.
function ProfilePhotoCard({ account, photo, notify }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasPhoto = Boolean(account.profile?.has_photo);

  const upload = async (file) => {
    if (!file) return;
    setError("");
    const ready = await compressImage(file);
    const problem = checkUpload(ready, { image: true });
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      await account.changePhoto(ready);
      notify?.("Profile photo updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!await askConfirm("Remove your profile photo?")) return;
    setBusy(true);
    try {
      await account.changePhoto(null);
      notify?.("Profile photo removed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="config-card profile-photo-card">
      <div className="config-header">
        <div className="config-icon blue">📷</div>
        <div><h3>Profile Photo</h3><p>Shown beside your name in AquaTimbang</p></div>
      </div>
      <div className="profile-photo-row">
        <div className="profile-photo-big">
          {photo ? <img src={photo} alt="Your profile" /> : <span>No photo yet</span>}
        </div>
        <div className="profile-photo-actions">
          <PhotoSourceButtons onFile={upload} facing="user" disabled={busy} cameraTitle="Take your profile photo" />
          {busy && <small>Saving…</small>}
          {hasPhoto && <button className="text-link-btn" onClick={remove} disabled={busy}>Remove photo</button>}
          <small>A clear photo of your face. JPG or PNG; large photos are reduced automatically.</small>
          {error && <small style={{ color: "#b42318" }}>{error}</small>}
        </div>
      </div>
    </div>
  );
}

// Profile page shared by the Administrator, LGU Officer and Fish Vendor
// dashboards. Reads and saves the logged-in user's own record in Django.
function AccountProfile({ account, notify, description = "Manage your account details and see your recent activity.", children }) {
  const { profile, loading, error, save } = account;
  const photo = useProtectedImage(profile?.has_photo ? `/auth/me/photo/?v=${encodeURIComponent(profile.photo_version || "")}` : "");
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

      {/* Two independent columns, so a short card never leaves a gap. */}
      <div className="profile-columns">
        <div className="profile-column">
          <ProfilePhotoCard account={account} photo={photo} notify={notify} />
          <ChangePasswordCard notify={notify} />
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

        </div>

        <div className="profile-column">
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
            <div className="profile-field"><span>Registered</span><strong>{formatDate(profile.date_joined)}</strong></div>
            <div className="profile-field"><span>Last Login</span><strong>{formatDateTime(profile.last_login)}</strong></div>
          </div>
          <p style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
            To change your username, role or municipality, contact an Administrator.
          </p>
        </div>

        <RegistrationDetails profile={profile} />

          {children}
        </div>
      </div>
    </>
  );
}

// Everything the person answered when registering, read-only.
function RegistrationDetails({ profile }) {
  const verification = profile.verification || {};
  const details = verification.details || {};
  const documents = verification.documents || {};
  const isVendor = profile.role === "Fish Vendor";
  const isOfficer = profile.role === "LGU Officer";
  const [preview, setPreview] = useState(null); // { label, url, isImage }
  const [previewError, setPreviewError] = useState("");
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  const openDoc = async (label, type) => {
    setPreviewError("");
    try {
      const r = await fetch(apiUrl(`/auth/users/${profile.id}/verification/${type}/`), { headers: authHeaders() });
      if (!r.ok) throw new Error("Could not open this file.");
      const blob = await r.blob();
      setPreview({ label, url: URL.createObjectURL(blob), isImage: blob.type.startsWith("image/") });
    } catch (e) {
      setPreviewError(e.message);
    }
  };
  const doc = (label, sent, type) => (
    <div className="profile-field">
      <span>{label}</span>
      <strong className={sent ? "reg-doc-ok" : "reg-doc-missing"}>
        {sent ? "✓ Submitted" : "Not submitted"}
        {sent && type && (
          <button type="button" className="reg-doc-view" onClick={() => openDoc(label, type)}>View</button>
        )}
      </strong>
    </div>
  );
  const field = (label, value) => (
    <div className="profile-field"><span>{label}</span><strong>{value || "—"}</strong></div>
  );
  return (
    <div className="config-card">
      <div className="config-header">
        <div className="config-icon green">✓</div>
        <div>
          <h3>Registration Details</h3>
          <p>What you gave when you registered{profile.reviewed_at ? `, approved ${formatDate(profile.reviewed_at)}` : ""}</p>
        </div>
      </div>
      <div className="profile-grid">
        {field("Registered as", profile.role)}
        {field("Account status", profile.account_status ? profile.account_status.charAt(0).toUpperCase() + profile.account_status.slice(1) : "")}
        {field("Date of birth", profile.date_of_birth ? formatDate(profile.date_of_birth) : "")}
        {field("Sex", profile.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : "")}
        {field("Municipality", profile.municipality)}
        {isVendor && (
          <>
            {field("Public market", details.market_name)}
            {field("Stall number", details.stall_number)}
            {field("Vendor permit number", details.permit_number)}
            {doc("Permit or certification", documents.permit, "vendor-permit")}
            {doc("Stall photo", documents.stall_photo, "vendor-stall")}
          </>
        )}
        {isOfficer && (
          <>
            {field("Department / Office", details.department)}
            {field("Official position", details.position)}
            {field("Employee ID", details.employee_id)}
            {field("Work email", details.official_email)}
            {doc("Authorization letter", documents.authorization, "lgu-authorization")}
          </>
        )}
        {doc("Face photo", documents.profile_photo, "profile-photo")}
      </div>
      {isVendor && (
        <div className="reg-reason">
          <span>Why you registered</span>
          <p>{profile.registration_reason || verification.registration_reason || "—"}</p>
        </div>
      )}
      <p style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
        These were checked when your account was approved. To correct one, contact {isVendor ? "your LGU Officer" : "an Administrator"}.
      </p>
      {previewError && <p className="reg-doc-error" role="alert">{previewError}</p>}
      {preview && (
        <div className="doc-preview-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="doc-preview" role="dialog" aria-modal="true" aria-label={preview.label}>
            <div className="doc-preview-head">
              <strong>{preview.label}</strong>
              <button type="button" className="secondary-btn" onClick={() => setPreview(null)}>Close</button>
            </div>
            {preview.isImage
              ? <img src={preview.url} alt={preview.label} />
              : <iframe src={preview.url} title={preview.label} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountProfile;
