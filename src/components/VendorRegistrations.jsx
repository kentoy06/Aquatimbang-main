import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";
import { ApplicantSummary, ApprovalGuidelines, VerificationChecklist, criteriaFor } from "./ApplicantReview.jsx";

const DOCUMENTS = [
  { key: "profile_photo", type: "profile-photo", label: "Profile photo" },
  { key: "permit", type: "vendor-permit", label: "Vendor permit" },
  { key: "stall_photo", type: "vendor-stall", label: "Stall photo" },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—";

// Open a protected verification document in a new tab.
async function openDocument(userId, documentType, notify) {
  // Open the tab first so the browser does not block it as a pop-up.
  const tab = window.open("", "_blank");
  if (!tab) {
    notify("Please allow pop-ups to view verification documents.");
    return;
  }
  tab.document.title = "Loading document";
  tab.document.body.textContent = "Loading document securely...";
  try {
    const response = await fetch(apiUrl(`/auth/users/${userId}/verification/${documentType}/`), { headers: authHeaders() });
    if (!response.ok) throw new Error(response.status === 404 ? "Document not found." : `Could not open the document (HTTP ${response.status}).`);
    const url = URL.createObjectURL(await response.blob());
    tab.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    tab.close();
    notify(error.message);
  }
}

// LGU Officers review Fish Vendor registrations from their municipality (UC-1).
function VendorRegistrations({ notify, onReviewed }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewing, setReviewing] = useState(null);
  const [action, setAction] = useState("approve");
  const [checks, setChecks] = useState([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(apiUrl("/auth/users/pending/"), { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || `Could not load registrations (HTTP ${response.status}).`);
        if (!cancelled) { setPending(data.results || []); setError(""); }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const open = (account, nextAction) => {
    setReviewing(account);
    setAction(nextAction);
    setChecks([]);
    setReason("");
  };

  const submit = async () => {
    if (action === "approve" && checks.length < criteriaFor("Fish Vendor").length) {
      notify("Tick every item in the approval checklist first.");
      return;
    }
    if (action === "reject" && !reason.trim()) {
      notify("Give a reason for rejecting the registration.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/auth/users/${reviewing.id}/${action}/`), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(action === "approve" ? { verification_confirmed: true } : { reason: reason.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || `Could not ${action} this registration.`);
      notify(`${reviewing.first_name || reviewing.username} ${action === "approve" ? "approved" : "rejected"}.`);
      setReviewing(null);
      setReloadKey((k) => k + 1);
      onReviewed?.();
    } catch (err) {
      notify(err.message);
    } finally {
      setSaving(false);
    }
  };

  const name = (account) => `${account.first_name || ""} ${account.last_name || ""}`.trim() || account.username;

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Vendor Registrations</h2>
          <p>Review Fish Vendor registrations from your municipality before they can log in.</p>
        </div>
        <button className="secondary-btn" onClick={() => setReloadKey((k) => k + 1)}>↻ Refresh</button>
      </div>

      <ApprovalGuidelines roles={["Fish Vendor"]} />

      {reviewing && (
        <div className="modal-backdrop" onClick={() => setReviewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="review-title">
            <div className="modal-head">
              <h3 id="review-title">{action === "approve" ? "Approve" : "Reject"} {name(reviewing)}</h3>
              <button className="modal-close" onClick={() => setReviewing(null)} aria-label="Close">✕</button>
            </div>

            <ApplicantSummary
              account={{ ...reviewing, name: name(reviewing) }}
              onOpenPhoto={() => openDocument(reviewing.id, "profile-photo", notify)}
              onOpenStall={() => openDocument(reviewing.id, "vendor-stall", notify)}
            />

            {action === "approve" ? (
              <VerificationChecklist role="Fish Vendor" checked={checks} onChange={setChecks} disabled={saving} />
            ) : (
              <div className="form-group">
                <label htmlFor="reject-reason">Reason for rejection</label>
                <input id="reject-reason" value={reason} maxLength={2000} placeholder="e.g. Stall number could not be verified" onChange={(e) => setReason(e.target.value)} />
              </div>
            )}

            <div className="button-row">
              <button className="secondary-btn" onClick={() => setReviewing(null)}>Cancel</button>
              <button className="primary-btn" onClick={submit} disabled={saving || (action === "approve" && checks.length < criteriaFor("Fish Vendor").length)}>
                {saving ? "Saving…" : action === "approve" ? "Approve Account" : "Reject Registration"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>VENDOR</th>
                <th>MARKET / STALL</th>
                <th>FISH SOLD</th>
                <th>PERMIT NO.</th>
                <th>DOCUMENTS</th>
                <th>REGISTERED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="empty-row">Loading registrations…</td></tr>
              ) : error ? (
                <tr><td colSpan="7" className="empty-row">{error}</td></tr>
              ) : pending.length === 0 ? (
                <tr><td colSpan="7" className="empty-row">No pending vendor registrations in your municipality.</td></tr>
              ) : (
                pending.map((account) => {
                  const details = account.verification?.details || {};
                  const documents = account.verification?.documents || {};
                  return (
                    <tr key={account.id}>
                      <td>
                        <strong>{name(account)}</strong>
                        <small style={{ display: "block", color: "#667085" }}>{account.email} · {account.contact_number || "no contact"}</small>
                      </td>
                      <td>{details.market_name || "—"}{details.stall_number ? ` · ${details.stall_number}` : ""}</td>
                      <td>{(account.verification?.species_sold || []).map((s) => s.name).join(", ") || "—"}</td>
                      <td>{details.permit_number || "—"}</td>
                      <td>
                        <div className="action-buttons" style={{ flexWrap: "wrap" }}>
                          {DOCUMENTS.filter((d) => documents[d.key]).map((d) => (
                            <button key={d.type} className="secondary-btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => openDocument(account.id, d.type, notify)}>
                              {d.label}
                            </button>
                          ))}
                          {!DOCUMENTS.some((d) => documents[d.key]) && <span className="muted-text">None uploaded</span>}
                        </div>
                      </td>
                      <td>{formatDate(account.registered_at)}</td>
                      <td>
                        <div className="action-buttons">
                          <button className="approve" onClick={() => open(account, "approve")}>Approve</button>
                          <button className="reject" onClick={() => open(account, "reject")}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default VendorRegistrations;
