import React, { useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { BrandMark } from "./BrandLogo.jsx";
import PasswordInput from "./PasswordInput.jsx";

/**
 * Shown right after logging in with a temporary password from the
 * Administrator: the user must choose their own password first.
 */
export default function ChooseNewPassword({ temporaryPassword, onDone, onCancel }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("The passwords don't match."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/auth/change-password/"), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ current_password: temporaryPassword, new_password: password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data && typeof data === "object" ? Object.values(data).flat().map(String).join(" ") : "Could not change your password.");
        return;
      }
      localStorage.setItem("authToken", data.token);
      onDone();
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card register-confirm-card" style={{ textAlign: "left" }}>
        <div className="login-brand" style={{ marginBottom: 18 }}>
          <div className="brand-icon brand-icon-logo"><BrandMark /></div>
          <div><h2>AquaTimbang</h2><span>Fish Price Transparency</span></div>
        </div>
        <form onSubmit={submit} noValidate>
          <h3>Choose your own password</h3>
          <p style={{ color: "#667085" }}>
            You logged in with a temporary password from the Administrator. Choose a new password that only you
            know before continuing. Use at least 8 characters.
          </p>
          <div className="form-group">
            <label htmlFor="new-own-password">New Password</label>
            <PasswordInput id="new-own-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="new-own-confirm">Confirm New Password</label>
            <PasswordInput id="new-own-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <div className="login-error" role="alert">⚠ {error}</div>}
          <button type="submit" className="primary-btn full-btn" disabled={saving}>{saving ? "Saving…" : "Save and Continue"}</button>
          <button type="button" className="secondary-btn full-btn" style={{ marginTop: 10 }} onClick={onCancel}>Cancel and log out</button>
        </form>
      </div>
    </div>
  );
}
