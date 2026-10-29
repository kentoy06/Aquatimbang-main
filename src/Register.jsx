import React, { useEffect, useState } from "react";
import "./App.css";
import "./Login.css";
import { API_BASE_URL } from "./api/config.js";

function Register({ onBack, onGoToLogin }) {
  const [role, setRole] = useState("Fish Vendor");
  const [form, setForm] = useState({
  // Basic account information
  first_name: "",
  last_name: "",
  username: "",
  password: "",
  confirmPassword: "",
  contact: "",
  email: "",
  dob: "",
  sex: "",
  municipality: "",
  municipalityOther: "",

  // Fish Vendor verification
  market_name: "",
  stall_number: "",
  permit_number: "",
  permit_document: null,
  stall_photo: null,

  // LGU Officer verification
  department: "",
  position: "",
  official_email: "",
  employee_id: "",
  authorization_document: null,

  // Privacy agreement
  agree: false,
});
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

    // Registration options retrieved from Django.
  const [roles, setRoles] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

    useEffect(() => {
    const loadRegistrationOptions = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/auth/registration-options/`
        );

        if (!response.ok) {
          throw new Error("Failed to load registration options.");
        }

        const data = await response.json();

        setRoles(data.roles);
        setMunicipalities(data.municipalities);

        // Select the first municipality returned by Django.
        if (data.municipalities.length > 0) {
          setForm((previous) => ({
            ...previous,
            municipality: String(data.municipalities[0].id),
          }));
        }

      } catch (err) {
        setError(
          "Unable to load registration options. Please check your connection."
        );
      } finally {
        setLoadingOptions(false);
      }
    };

    loadRegistrationOptions();
  }, []);

  const update = (key, value) => setForm({ ...form, [key]: value });

  const handleSubmit = async (e) => {
  e.preventDefault();

  // Validate the registration form.
  if (
    !form.first_name.trim() ||
    !form.last_name.trim() ||
    !form.username.trim() ||
    !form.password.trim() ||
    !form.contact.trim() ||
    !form.email.trim() ||
    !form.dob ||
    !form.sex
  ) {
    setError("Please fill in every field.");
    return;
  }

  // Match Django's minimum password length.
  if (form.password.length < 8) {
    setError("Password must be at least 8 characters.");
    return;
  }

  if (form.password !== form.confirmPassword) {
    setError("Passwords don't match.");
    return;
  }

  if (!form.agree) {
    setError("Please agree to the Privacy Policy and Terms to continue.");
    return;
  }

    setError("");

  // Find the database role matching the selected role.
  const selectedRole = roles.find(
    (item) => item.name === role
  );

  if (!selectedRole) {
    setError("Selected role is unavailable. Please refresh the page.");
    return;
  }

  // Confirm that the municipality has a valid database ID.
  const selectedMunicipality = municipalities.find(
    (item) => String(item.id) === form.municipality
  );

  if (!selectedMunicipality) {
    setError("Please select a valid municipality.");
    return;
  }

  const firstName = form.first_name.trim();
  const lastName = form.last_name.trim();

  // Required verification details for the selected role.
  if (role === "Fish Vendor" && (!form.market_name.trim() || !form.stall_number.trim())) {
    setError("Please enter your public market name and stall number.");
    return;
  }

  if (role === "LGU Officer" && (!form.department.trim() || !form.position.trim() || !form.authorization_document)) {
    setError("Please enter your department, position, and upload your proof of employment.");
    return;
  }

 // Prepare registration data, including uploaded files.
const registrationData = new FormData();

// Basic account information
registrationData.append("username", form.username.trim());
registrationData.append("email", form.email.trim());
registrationData.append("password", form.password);
registrationData.append("first_name", firstName);
registrationData.append("last_name", lastName);
registrationData.append("role", String(selectedRole.id));
registrationData.append("municipality", String(selectedMunicipality.id));
registrationData.append("contact_number", form.contact.trim());
registrationData.append("date_of_birth", form.dob);
registrationData.append("sex", form.sex);

// Add verification information for the selected role only.
if (role === "Fish Vendor") {
  registrationData.append("market_name", form.market_name.trim());
  registrationData.append("stall_number", form.stall_number.trim());
  registrationData.append("permit_number", form.permit_number.trim());

  if (form.permit_document) {
    registrationData.append("permit_document", form.permit_document);
  }

  if (form.stall_photo) {
    registrationData.append("stall_photo", form.stall_photo);
  }
}

if (role === "LGU Officer") {
  registrationData.append("department", form.department.trim());
  registrationData.append("position", form.position.trim());
  registrationData.append("official_email", form.official_email.trim());
  registrationData.append("employee_id", form.employee_id.trim());

  if (form.authorization_document) {
    registrationData.append(
      "authorization_document",
      form.authorization_document
    );
  }
}

  try {
    const response = await fetch(
  `${API_BASE_URL}/auth/register/`,
  {
    method: "POST",
    body: registrationData,
  }
);

    const data = await response.json();

    if (!response.ok) {
      const message =
        Object.values(data)
          .flat()
          .map(String)
          .join(" ") || "Registration failed.";

      setError(message);
      return;
    }

    // Only show success after Django confirms registration.
    setError("");
    setSubmitted(true);

  } catch (err) {
    setError(
      "Unable to connect to the server. Please try again."
      );
    }
  };

  if (submitted) {
    return (
      <div className="login-page">
        <div className="login-card register-confirm-card">
          <div className="register-confirm-icon">✔</div>
          <h3>Registration submitted</h3>
          <p>
            Thanks, {form.first_name.trim()}! Your {role} account is pending
            approval from an Administrator. You'll be able to log in once
            it's reviewed and approved.
          </p>
          <div className="button-row" style={{ marginTop: 22 }}>
            <button className="secondary-btn" onClick={onBack}>← Back to Home</button>
            <button className="primary-btn" onClick={onGoToLogin}>Go to Login</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">

        {/* LEFT PANEL */}
        <div className="login-left">
          <button className="login-back-btn" onClick={onBack}>← Back to Home</button>

          <div className="login-brand login-brand-spaced">
            <div className="brand-icon">🐟</div>
            <div>
              <h2>AquaTimbang</h2>
              <span>Fish Price Transparency</span>
            </div>
          </div>

          <h1>Join as a<br />registered user.</h1>

          <p>
            Registering lets you access AquaTimbang as a Fish Vendor or LGU
            Officer. New accounts are monitored and reviewed by an
            Administrator before they're activated.
          </p>

          <div className="login-points">
            <div className="login-point"><span>✔</span> Free to register</div>
            <div className="login-point"><span>✔</span> Reviewed by an Administrator</div>
            <div className="login-point"><span>✔</span> Track your own activity once approved</div>
          </div>

          <div className="login-fish">🐟</div>
        </div>

        {/* RIGHT PANEL */}
        <div className="login-right">

          <div className="auth-tabs">
            <button className="auth-tab" onClick={onGoToLogin}>Login</button>
            <button className="auth-tab auth-tab-active">Register</button>
          </div>

          <div className="login-head">
            <h3>Create your account</h3>
            <p>Select your role and fill in your details below.</p>
          </div>

          <div className="admin-watch-note">
            <span>🛈</span>
            <p>Every registration is reviewed by an Administrator before your account is activated.</p>
          </div>

          <div className="role-toggle-label">I am registering as:</div>
          <div className="role-toggle">
            <button
              type="button"
              className={`role-toggle-btn ${role === "Fish Vendor" ? "role-toggle-btn-active" : ""}`}
              onClick={() => setRole("Fish Vendor")}
            >
              🐟 Fish Vendor
            </button>
            <button
              type="button"
              className={`role-toggle-btn ${role === "LGU Officer" ? "role-toggle-btn-active" : ""}`}
              onClick={() => setRole("LGU Officer")}
            >
              ✔ LGU Officer
            </button>
          </div>

          <div className="registering-as-note">
            You are registering as a <strong>{role}</strong>.
            {role === "LGU Officer" && (
              <> LGU Officer requests require identity verification by the
              Administrator and may take longer to approve.</>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate>

            {/* PERSONAL INFORMATION */}
            <section className="register-section">
              <h4 className="register-section-title">Personal Information</h4>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-first-name">First Name</label>
                  <input id="reg-first-name" value={form.first_name} placeholder="e.g. Juan" autoComplete="given-name" onChange={(e) => update("first_name", e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-last-name">Last Name</label>
                  <input id="reg-last-name" value={form.last_name} placeholder="e.g. Dela Cruz" autoComplete="family-name" onChange={(e) => update("last_name", e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-dob">Date of Birth</label>
                  <input id="reg-dob" type="date" value={form.dob} autoComplete="bday" onChange={(e) => update("dob", e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-sex">Sex</label>
                  <select id="reg-sex" value={form.sex} onChange={(e) => update("sex", e.target.value)}>
                    <option value="">Select</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Prefer not to say</option>
                  </select>
                </div>
              </div>
            </section>

            {/* ACCOUNT DETAILS */}
            <section className="register-section">
              <h4 className="register-section-title">Account Details</h4>

              <div className="form-group">
                <label htmlFor="reg-username">Username</label>
                <input id="reg-username" value={form.username} placeholder="Choose a username" autoComplete="username" onChange={(e) => update("username", e.target.value)} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-password">Password</label>
                  <input id="reg-password" type="password" value={form.password} placeholder="At least 8 characters" autoComplete="new-password" onChange={(e) => update("password", e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-confirm">Confirm Password</label>
                  <input id="reg-confirm" type="password" value={form.confirmPassword} placeholder="Re-enter your password" autoComplete="new-password" onChange={(e) => update("confirmPassword", e.target.value)} />
                </div>
              </div>
            </section>

            {/* CONTACT & LOCATION */}
            <section className="register-section">
              <h4 className="register-section-title">Contact &amp; Location</h4>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-email">Email Address</label>
                  <input id="reg-email" type="email" value={form.email} placeholder="you@email.com" autoComplete="email" onChange={(e) => update("email", e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-contact">Contact Number</label>
                  <input id="reg-contact" type="tel" value={form.contact} placeholder="e.g. 0917 555 0198" autoComplete="tel" onChange={(e) => update("contact", e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="reg-municipality">Municipality</label>
                <select
                  id="reg-municipality"
                  value={form.municipality}
                  onChange={(e) => update("municipality", e.target.value)}
                  disabled={loadingOptions || municipalities.length === 0}
                >
                  {loadingOptions ? (
                    <option value="">Loading municipalities...</option>
                  ) : municipalities.length === 0 ? (
                    <option value="">No municipalities available</option>
                  ) : (
                    municipalities.map((municipality) => (
                      <option key={municipality.id} value={String(municipality.id)}>
                        {municipality.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </section>

            {/* FISH VENDOR VERIFICATION */}
            {role === "Fish Vendor" && (
              <section className="register-section register-section-verify">
                <h4 className="register-section-title">Fish Vendor Verification</h4>
                <p className="register-section-desc">
                  Tell us where you sell so an Administrator can confirm you are a registered fish vendor.
                </p>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="reg-market">Public Market Name</label>
                    <input id="reg-market" type="text" placeholder="e.g. Carbon Market" value={form.market_name} onChange={(e) => update("market_name", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-stall">Stall Number</label>
                    <input id="reg-stall" type="text" placeholder="e.g. A-15" value={form.stall_number} onChange={(e) => update("stall_number", e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-permit-number">Vendor Permit Number <span className="optional">(optional)</span></label>
                  <input id="reg-permit-number" type="text" placeholder="Enter your vendor permit number" value={form.permit_number} onChange={(e) => update("permit_number", e.target.value)} />
                </div>

                <FileField
                  id="reg-permit-document"
                  label="Vendor Permit or Market Certification"
                  optional
                  hint="PDF, JPG or PNG"
                  accept=".pdf,.jpg,.jpeg,.png"
                  file={form.permit_document}
                  onChange={(file) => update("permit_document", file)}
                />

                <FileField
                  id="reg-stall-photo"
                  label="Photo of Your Market Stall"
                  optional
                  hint="JPG or PNG"
                  accept=".jpg,.jpeg,.png"
                  file={form.stall_photo}
                  onChange={(file) => update("stall_photo", file)}
                />
              </section>
            )}

            {/* LGU OFFICER VERIFICATION */}
            {role === "LGU Officer" && (
              <section className="register-section register-section-verify">
                <h4 className="register-section-title">LGU Officer Verification</h4>
                <p className="register-section-desc">
                  Provide your official employment details. Your account stays pending until an
                  Administrator has reviewed your credentials.
                </p>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="reg-department">Department / Office</label>
                    <input id="reg-department" type="text" placeholder="e.g. Agriculture Office" value={form.department} onChange={(e) => update("department", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-position">Official Position</label>
                    <input id="reg-position" type="text" placeholder="e.g. Fisheries Officer" value={form.position} onChange={(e) => update("position", e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="reg-official-email">Official Work Email <span className="optional">(optional)</span></label>
                    <input id="reg-official-email" type="email" placeholder="name@lgu.gov.ph" value={form.official_email} onChange={(e) => update("official_email", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-employee-id">Employee ID <span className="optional">(optional)</span></label>
                    <input id="reg-employee-id" type="text" placeholder="e.g. 2024-0153" value={form.employee_id} onChange={(e) => update("employee_id", e.target.value)} />
                  </div>
                </div>

                <FileField
                  id="reg-authorization"
                  label="Proof of Employment or Authorization"
                  hint="Official employment certificate or authorization letter · PDF, JPG or PNG"
                  accept=".pdf,.jpg,.jpeg,.png"
                  file={form.authorization_document}
                  onChange={(file) => update("authorization_document", file)}
                />
              </section>
            )}

            {error && <div className="login-error" role="alert">⚠ {error}</div>}

            <label className="consent-row">
              <input type="checkbox" checked={form.agree} onChange={(e) => update("agree", e.target.checked)} />
              <span>I agree to AquaTimbang's Privacy Policy and Terms of Use, and consent to my data being processed for account verification.</span>
            </label>

            <button type="submit" className="primary-btn full-btn">Create Account</button>
          </form>

          <div className="login-hint login-hint-big">
            Already have an account?{" "}
            <button className="login-inline-link login-inline-link-big" onClick={onGoToLogin}>Log in instead</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// File picker styled as an upload box that shows the chosen file name.
function FileField({ id, label, hint, accept, file, onChange, optional = false }) {
  return (
    <div className="form-group">
      <span className="file-field-label">
        {label} {optional && <span className="optional">(optional)</span>}
      </span>
      <label htmlFor={id} className={`file-field ${file ? "file-field-filled" : ""}`}>
        <span className="file-field-icon">{file ? "✓" : "⇪"}</span>
        <span className="file-field-text">
          <strong>{file ? file.name : "Click to upload a file"}</strong>
          <small>{file ? "Click to choose a different file" : hint}</small>
        </span>
        <input id={id} type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] || null)} />
      </label>
    </div>
  );
}

export default Register;
