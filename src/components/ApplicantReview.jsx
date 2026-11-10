import React, { useState } from "react";
import { useProtectedImage } from "../api/images.js";
import "./ApplicantReview.css";
import { FishThumb } from "./FishPhoto.jsx";

// What a reviewer must confirm before approving a registration.
// Every item has to be ticked before the account can be approved.
export const APPROVAL_CRITERIA = {
  "Fish Vendor": [
    "The profile photo shows a clear face and the name matches the applicant.",
    "The stall photo shows a real fish stall (fish on display, stall number or market signs visible).",
    "The public market and stall number are in the applicant's municipality (check with the Market Administrator's list when unsure).",
    "The permit or market certification is readable and in the applicant's name. If none was uploaded, the stall was confirmed another way (market office or a phone call).",
    "The fish they sell and their reason for registering make sense for a fish vendor.",
    "No other account already exists for this person or this stall.",
  ],
  "LGU Officer": [
    "The profile photo shows a clear face and the name matches the applicant.",
    "The proof of employment is an official document in the applicant's name: Certificate of Employment, appointment or office order, or an authorization letter signed by the department head, on LGU letterhead.",
    "The department and position match the document, and the office handles fisheries or markets (e.g. City/Municipal Agriculture Office, Market Administration).",
    "The municipality chosen at registration is the LGU named in the document.",
    "The work email, if given, is an official LGU or .gov.ph address.",
    "The reason for registering fits the officer's duties.",
  ],
};

export const criteriaFor = (role) => APPROVAL_CRITERIA[role] || APPROVAL_CRITERIA["Fish Vendor"];

// Applicant photo and reason, then (for vendors) the stall photo and the
// fish they sell as two separate blocks.
// Everything the applicant typed on the registration form, for the reviewer.
const LABELS = {
  market_name: "Public market", stall_number: "Stall number", permit_number: "Vendor permit number",
  department: "Department / Office", position: "Official position", employee_id: "Employee ID", official_email: "Work email",
};
function birthText(iso) {
  if (!iso) return "";
  const born = new Date(`${iso}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) age -= 1;
  return `${born.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })} (${age} years old)`;
}
export function ApplicantDetails({ account }) {
  const verification = account.verification || {};
  const personal = verification.personal || {};
  const details = verification.details || {};
  const fullName = account.name || [account.first_name, account.last_name].filter(Boolean).join(" ");
  const registered = account.registered_at || account.registeredAt;
  const rows = [
    ["Full name", fullName],
    ["Username", account.username],
    ["Registered as", account.role],
    ["Municipality", account.municipality],
    ["Email", personal.email || account.email],
    ["Contact number", personal.contact_number || account.contact_number || account.contact],
    ["Date of birth", birthText(personal.date_of_birth)],
    ["Sex", personal.sex ? personal.sex.charAt(0).toUpperCase() + personal.sex.slice(1) : ""],
    ...Object.entries(details).map(([key, value]) => [LABELS[key] || key.replaceAll("_", " "), value]),
    ["Registered on", registered ? new Date(registered).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : account.registeredDate],
  ];
  return (
    <div className="applicant-details">
      <span className="applicant-label">Everything they entered</span>
      <div className="profile-grid">
        {rows.map(([label, value]) => (
          <div className="profile-field" key={label}>
            <span>{label}</span>
            <strong className={value ? "" : "muted-text"}>{value || "Not provided"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApplicantSummary({ account, onOpenPhoto, onOpenStall, showDetails = true }) {
  const verification = account.verification || {};
  const hasPhoto = Boolean(verification.documents?.profile_photo);
  const hasStall = Boolean(verification.documents?.stall_photo);
  const isVendor = account.role === "Fish Vendor";
  const photo = useProtectedImage(hasPhoto ? `/auth/users/${account.id}/verification/profile-photo/` : "");
  const stall = useProtectedImage(isVendor && hasStall ? `/auth/users/${account.id}/verification/vendor-stall/` : "");
  const species = verification.species_sold || [];

  return (
    <>
      {showDetails && <ApplicantDetails account={account} />}
      <div className="applicant-summary">
        <button
          type="button"
          className="applicant-photo"
          onClick={() => hasPhoto && onOpenPhoto?.()}
          disabled={!hasPhoto}
          title={hasPhoto ? "Open the full photo" : "No photo uploaded"}
        >
          {photo ? <img src={photo} alt={`Photo of ${account.name || account.username}`} /> : <span>{hasPhoto ? "…" : "No photo"}</span>}
        </button>
        <div className="applicant-text">
          <span className="applicant-label">Reason for registering</span>
          <p>{verification.registration_reason || <em>Not given (registered before this question was added).</em>}</p>
        </div>
      </div>

      {isVendor && (
        <div className="applicant-blocks">
          <div className="applicant-block">
            <span className="applicant-label">Stall photo</span>
            {hasStall ? (
              <button type="button" className="stall-preview" onClick={() => onOpenStall?.()} title="Open the full stall photo">
                {stall ? <img src={stall} alt="Market stall" /> : <span>Loading…</span>}
              </button>
            ) : (
              <p className="muted-text">No stall photo uploaded.</p>
            )}
          </div>
          <div className="applicant-block">
            <span className="applicant-label">Fish they sell ({species.length})</span>
            {species.length ? (
              <div className="fish-sold-list">
                {species.map((fish) => (
                  <span className="fish-sold" key={fish.id}>
                    <FishThumb fish={fish} size={40} />
                    {fish.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted-text">Not given.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Checklist the reviewer completes before approving.
export function VerificationChecklist({ role, checked, onChange, disabled }) {
  const items = criteriaFor(role);
  const toggle = (index) =>
    onChange(checked.includes(index) ? checked.filter((i) => i !== index) : [...checked, index]);
  return (
    <div className="verify-checklist">
      <strong>Before approving, confirm each item ({checked.length}/{items.length})</strong>
      {items.map((text, index) => (
        <label key={index} className="verify-item">
          <input type="checkbox" checked={checked.includes(index)} onChange={() => toggle(index)} disabled={disabled} />
          <span>{text}</span>
        </label>
      ))}
    </div>
  );
}

// Approval guidelines shown on the review pages.
export function ApprovalGuidelines({ roles = ["Fish Vendor", "LGU Officer"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel guidelines-panel">
      <button type="button" className="guidelines-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>📋 Approval guidelines: what to check before approving</span>
        <span>{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="guidelines-body">
          {roles.map((role) => (
            <div key={role}>
              <h4>{role}</h4>
              <ol>{criteriaFor(role).map((text) => <li key={text}>{text}</li>)}</ol>
            </div>
          ))}
          <p className="muted-text">Reject the registration, with a reason, when any item cannot be confirmed. The applicant sees the reason when they try to log in.</p>
        </div>
      )}
    </div>
  );
}
