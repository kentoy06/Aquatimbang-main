import React, { useState } from "react";
import { apiUrl } from "../api/config.js";

async function post(path, body) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 429
      ? "Too many requests. Please wait a while and try again."
      : data && typeof data === "object" ? Object.values(data).flat().map(String).join(" ") : "";
    throw new Error(message || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

// "Forgot password?" on the login page: ask for the account's email.
export function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address of your account.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const data = await post("/auth/password-reset/", { email: email.trim() });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="login-head">
        <h3>Reset your password</h3>
        <p>Enter the email address of your account. We'll send you a link to choose a new password. The link expires in 1 hour.</p>
      </div>
      {message ? (
        <div className="admin-watch-note" role="status"><span>✉</span><p>{message}</p></div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="form-group">
            <label htmlFor="forgot-email">Email Address</label>
            <input id="forgot-email" type="email" autoComplete="email" value={email} placeholder="you@email.com" onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <div className="login-error" role="alert">⚠ {error}</div>}
          <button type="submit" className="primary-btn full-btn" disabled={sending}>{sending ? "Sending…" : "Send Reset Link"}</button>
        </form>
      )}
      <button type="button" className="secondary-btn full-btn" style={{ marginTop: 10 }} onClick={onBack}>← Back to Login</button>
    </>
  );
}

// Page opened from the link in the reset email.
export function ResetPasswordPage({ uid, token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await post("/auth/password-reset/confirm/", { uid, token, new_password: password });
      setDone(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card register-confirm-card" style={{ textAlign: "left" }}>
        <div className="login-brand" style={{ marginBottom: 18 }}>
          <div className="brand-icon">🐟</div>
          <div><h2>AquaTimbang</h2><span>Fish Price Transparency</span></div>
        </div>
        {done ? (
          <>
            <h3>Password changed</h3>
            <p>{done}</p>
            <button className="primary-btn full-btn" style={{ marginTop: 16 }} onClick={onDone}>Go to Login</button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <h3>Choose a new password</h3>
            <p style={{ color: "#667085" }}>Use at least 8 characters that are hard to guess.</p>
            <div className="form-group">
              <label htmlFor="reset-password">New Password</label>
              <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="reset-confirm">Confirm New Password</label>
              <input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="login-error" role="alert">⚠ {error}</div>}
            <button type="submit" className="primary-btn full-btn" disabled={saving}>{saving ? "Saving…" : "Change Password"}</button>
            <button type="button" className="secondary-btn full-btn" style={{ marginTop: 10 }} onClick={onDone}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}
