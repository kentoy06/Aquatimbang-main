import { BrandMark } from "./components/BrandLogo.jsx";
import PasswordInput from "./components/PasswordInput.jsx";
import React, { useEffect, useState } from "react";
import LanguagePicker from "./components/LanguagePicker.jsx";
import { useT } from "./i18n/vendor.js";
import { createPortal } from "react-dom";
import "./App.css";
import "./Login.css";
import { API_BASE_URL } from "./api/config.js";
import { MAX_DOCUMENT_MB, checkUpload, compressImage } from "./api/images.js";
import FishMultiSelect from "./components/FishMultiSelect.jsx";
import { TakePhotoButton } from "./components/CameraCapture.jsx";

const OTHER_MARKET = "__other__";

function Register({ onBack, onGoToLogin }) {
  const t = useT();
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

  // Photo and purpose (every applicant)
  profile_photo: null,
  registration_reason: "",

  // Fish Vendor verification
  market_name: "",
  stall_number: "",
  permit_number: "",
  permit_document: null,
  stall_photo: null,
  species_sold: [],

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
  const [fishSpecies, setFishSpecies] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [fileErrors, setFileErrors] = useState({});
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
        setFishSpecies(data.fish_species || []);
        setMarkets(data.markets || []);

        // Select the first municipality returned by Django.
        if (data.municipalities.length > 0) {
          setForm((previous) => ({
            ...previous,
            municipality: String(data.municipalities[0].id),
          }));
        }

      } catch (err) {
        setError(t("Unable to load registration options. Please check your connection."));
      } finally {
        setLoadingOptions(false);
      }
    };

    loadRegistrationOptions();
  }, []);

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  // Markets listed by the Administrator for the chosen municipality.
  const [marketChoice, setMarketChoice] = useState("");
  const marketsHere = markets.filter((m) => String(m.municipality) === String(form.municipality));

  // Check a chosen file, shrinking large photos before they are uploaded.
  const pickFile = async (key, file, image) => {
    if (!file) {
      // Removed with the ✕ button.
      setFileErrors((previous) => ({ ...previous, [key]: "" }));
      update(key, null);
      return;
    }
    const ready = image ? await compressImage(file) : file;
    const problem = checkUpload(ready, { image });
    setFileErrors((previous) => ({ ...previous, [key]: problem }));
    update(key, problem ? null : ready);
  };

  const toggleSpecies = (id) =>
    setForm((previous) => ({
      ...previous,
      species_sold: previous.species_sold.includes(id)
        ? previous.species_sold.filter((value) => value !== id)
        : [...previous.species_sold, id],
    }));

  const handleSubmit = async (e) => {
  e.preventDefault();

  // Validate the registration form.
  if (
    !form.first_name.trim() ||
    !form.last_name.trim() ||
    !form.username.trim() ||
    !form.password.trim() ||
    !form.contact.trim() ||
    // Vendors without an email can still register; LGU staff need one.
    (role !== "Fish Vendor" && !form.email.trim()) ||
    !form.dob ||
    !form.sex
  ) {
    setError(t("Please fill in every field."));
    return;
  }

  // Match Django's minimum password length.
  if (form.password.length < 8) {
    setError(t("Password must be at least 8 characters."));
    return;
  }

  if (form.password !== form.confirmPassword) {
    setError(t("Passwords don't match."));
    return;
  }

  if (!form.agree) {
    setError(t("Please agree to the Privacy Policy and Terms to continue."));
    return;
  }

    setError("");

  // Find the database role matching the selected role.
  const selectedRole = roles.find(
    (item) => item.name === role
  );

  if (!selectedRole) {
    setError(t("Selected role is unavailable. Please refresh the page."));
    return;
  }

  // Confirm that the municipality has a valid database ID.
  const selectedMunicipality = municipalities.find(
    (item) => String(item.id) === form.municipality
  );

  if (!selectedMunicipality) {
    setError(t("Please select a valid municipality."));
    return;
  }

  if (!form.profile_photo) {
    setError(t("Please upload a clear photo of your face."));
    return;
  }

  if (role === "Fish Vendor" && form.registration_reason.trim().length < 15) {
    setError(t("Please tell us why you are registering (at least 15 characters)."));
    return;
  }

  const firstName = form.first_name.trim();
  const lastName = form.last_name.trim();

  // Required verification details for the selected role.
  if (role === "Fish Vendor" && (!form.market_name.trim() || !form.stall_number.trim())) {
    setError(t("Please enter your public market name and stall number."));
    return;
  }

  if (role === "Fish Vendor" && form.species_sold.length === 0) {
    setError(t("Please select at least one fish species that you sell."));
    return;
  }

  if (role === "Fish Vendor" && !form.stall_photo) {
    setError(t("Please upload a photo of your market stall."));
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
registrationData.append("profile_photo", form.profile_photo);
registrationData.append("registration_reason", form.registration_reason.trim());

// Add verification information for the selected role only.
if (role === "Fish Vendor") {
  registrationData.append("market_name", form.market_name.trim());
  registrationData.append("stall_number", form.stall_number.trim());
  registrationData.append("permit_number", form.permit_number.trim());
  form.species_sold.forEach((id) => registrationData.append("species_sold", String(id)));

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
    setError(t("Unable to connect to the server. Please try again."));
    }
  };

  if (submitted) {
    return (
      <div className="login-page">
        <div className="login-card register-confirm-card">
          <div className="register-confirm-icon">✔</div>
          <h3>{t("Registration submitted")}</h3>
          <p>
            {t(role === "Fish Vendor"
              ? "Thanks, {name}! Your Fish Vendor account is pending approval from an LGU Officer of your municipality. You'll be able to log in once it's reviewed and approved."
              : "Thanks, {name}! Your LGU Officer account is pending approval from an Administrator. You'll be able to log in once it's reviewed and approved.",
            { name: form.first_name.trim() })}
          </p>
          <div className="button-row" style={{ marginTop: 22 }}>
            <button className="secondary-btn" onClick={onBack}>{t("← Back to Home")}</button>
            <button className="primary-btn" onClick={onGoToLogin}>{t("Go to Login")}</button>
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
          <button className="login-back-btn" onClick={onBack}>{t("← Back to Home")}</button>

          <div className="login-brand login-brand-spaced">
            <div className="brand-icon brand-icon-logo"><BrandMark /></div>
            <div>
              <h2>AquaTimbang</h2>
              <span>{t("Fish Price Transparency")}</span>
            </div>
          </div>

          <h1>{t("Join as a")}<br />{t("registered user.")}</h1>

          <p>
            {t("Registering lets you access AquaTimbang as a Fish Vendor or LGU Officer. New accounts are monitored and reviewed by an Administrator before they're activated.")}
          </p>

          <div className="login-points">
            <div className="login-point"><span>✔</span>{" "}{t("Free to register")}</div>
            <div className="login-point"><span>✔</span>{" "}{t("Reviewed by an Administrator")}</div>
            <div className="login-point"><span>✔</span>{" "}{t("Track your own activity once approved")}</div>
          </div>

          <div className="login-fish">🐟</div>
        </div>

        {/* RIGHT PANEL */}
        <div className="login-right">
          <LanguagePicker className="auth-lang" />

          <div className="auth-tabs">
            <button className="auth-tab" onClick={onGoToLogin}>{t("Login")}</button>
            <button className="auth-tab auth-tab-active">{t("Register")}</button>
          </div>

          <div className="login-head">
            <h3>{t("Create your account")}</h3>
            <p>{t("Select your role and fill in your details below.")}</p>
          </div>

          <div className="admin-watch-note">
            <span>🛈</span>
            <p>{t("Every registration is reviewed by an Administrator before your account is activated.")}</p>
          </div>

          <div className="role-toggle-label">{t("I am registering as:")}</div>
          <div className="role-toggle">
            <button
              type="button"
              className={`role-toggle-btn ${role === "Fish Vendor" ? "role-toggle-btn-active" : ""}`}
              onClick={() => setRole("Fish Vendor")}
            >
              {t("🐟 Fish Vendor")}
            </button>
            <button
              type="button"
              className={`role-toggle-btn ${role === "LGU Officer" ? "role-toggle-btn-active" : ""}`}
              onClick={() => setRole("LGU Officer")}
            >
              {t("✔ LGU Officer")}
            </button>
          </div>

          <div className="registering-as-note">
            {t("You are registering as a")}{" "}<strong>{t(role)}</strong>.
            {role === "LGU Officer" && (
              <> LGU Officer requests require identity verification by the
              Administrator and may take longer to approve.</>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate>

            {/* PERSONAL INFORMATION */}
            <section className="register-section">
              <h4 className="register-section-title">{t("Personal Information")}</h4>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-first-name">{t("First Name")}</label>
                  <input id="reg-first-name" value={form.first_name} placeholder={t("e.g. Juan")} autoComplete="given-name" onChange={(e) => update("first_name", e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-last-name">{t("Last Name")}</label>
                  <input id="reg-last-name" value={form.last_name} placeholder={t("e.g. Dela Cruz")} autoComplete="family-name" onChange={(e) => update("last_name", e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-dob">{t("Date of Birth")}</label>
                  <input id="reg-dob" type="date" value={form.dob} autoComplete="bday" onChange={(e) => update("dob", e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-sex">{t("Sex")}</label>
                  <select id="reg-sex" value={form.sex} onChange={(e) => update("sex", e.target.value)}>
                    <option value="">{t("Select")}</option>
                    <option>{t("Male")}</option>
                    <option>{t("Female")}</option>
                    <option>{t("Prefer not to say")}</option>
                  </select>
                </div>
              </div>
            </section>

            {/* ACCOUNT DETAILS */}
            <section className="register-section">
              <h4 className="register-section-title">{t("Account Details")}</h4>

              <div className="form-group">
                <label htmlFor="reg-username">{t("Username")}</label>
                <input id="reg-username" value={form.username} placeholder={t("Choose a username")} autoComplete="username" onChange={(e) => update("username", e.target.value)} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-password">{t("Password")}</label>
                  <PasswordInput id="reg-password" value={form.password} placeholder={t("At least 8 characters")} autoComplete="new-password" onChange={(e) => update("password", e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-confirm">{t("Confirm Password")}</label>
                  <PasswordInput id="reg-confirm" value={form.confirmPassword} placeholder={t("Re-enter your password")} autoComplete="new-password" onChange={(e) => update("confirmPassword", e.target.value)} />
                </div>
              </div>
            </section>

            {/* CONTACT & LOCATION */}
            <section className="register-section">
              <h4 className="register-section-title">{t("Contact & Location")}</h4>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-email">{t("Email Address")}{role === "Fish Vendor" && <>{" "}<span className="optional">{t("(optional)")}</span></>}</label>
                  <input id="reg-email" type="email" value={form.email} placeholder={t("you@email.com")} autoComplete="email" onChange={(e) => update("email", e.target.value)} />
                  {role === "Fish Vendor" && !form.email.trim() && (
                    <small className="field-help">{t("No email? You can still register. If you forget your password, ask your LGU Officer to reset it.")}</small>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="reg-contact">{t("Contact Number")}</label>
                  <input id="reg-contact" type="tel" value={form.contact} placeholder={t("e.g. 0917 555 0198")} autoComplete="tel" onChange={(e) => update("contact", e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="reg-municipality">{t("Municipality")}</label>
                <select
                  id="reg-municipality"
                  value={form.municipality}
                  onChange={(e) => {
                    update("municipality", e.target.value);
                    // A different municipality has different markets.
                    setMarketChoice("");
                    update("market_name", "");
                  }}
                  disabled={loadingOptions || municipalities.length === 0}
                >
                  {loadingOptions ? (
                    <option value="">{t("Loading municipalities...")}</option>
                  ) : municipalities.length === 0 ? (
                    <option value="">{t("No municipalities available")}</option>
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

            {/* PHOTO & PURPOSE */}
            <section className="register-section">
              <h4 className="register-section-title">{t("Photo & Purpose")}</h4>

              <FileField
                id="reg-profile-photo"
                label="Your Photo"
                hint="A clear, front-facing photo of your face, like an ID picture (no sunglasses or caps) · JPG or PNG"
                accept=".jpg,.jpeg,.png"
                file={form.profile_photo}
                error={fileErrors.profile_photo}
                onChange={(file) => pickFile("profile_photo", file, true)}
                camera="user"
                cameraTitle="Take a photo of your face"
              />

              {role === "Fish Vendor" && <div className="form-group">
                <label htmlFor="reg-reason">{t("Why are you registering?")}</label>
                <textarea
                  id="reg-reason"
                  rows={3}
                  maxLength={500}
                  value={form.registration_reason}
                  placeholder={t("e.g. I sell bangus and tilapia at Carbon Market and want to check the official prices before selling.")}
                  onChange={(e) => update("registration_reason", e.target.value)}
                />
                <small className="field-help">{form.registration_reason.trim().length}/500 · {t("The LGU officer reads this before approving your account.")}</small>
              </div>}
            </section>

            {/* FISH YOU SELL (vendors only) */}
            {role === "Fish Vendor" && (
              <section className="register-section">
                <h4 className="register-section-title">{t("Fish You Sell")}</h4>
                <p className="register-section-desc">
                  {t("Choose every fish you usually sell. Their prices will appear first on your dashboard.")}
                </p>
                {fishSpecies.length === 0 ? (
                  <small className="field-help">{loadingOptions ? "Loading fish species…" : "No fish species are registered yet."}</small>
                ) : (
                  <FishMultiSelect fish={fishSpecies} selected={form.species_sold} onToggle={toggleSpecies} />
                )}
              </section>
            )}

            {/* FISH VENDOR VERIFICATION */}
            {role === "Fish Vendor" && (
              <section className="register-section register-section-verify">
                <h4 className="register-section-title">{t("Fish Vendor Verification")}</h4>
                <p className="register-section-desc">
                  {t("Tell us where you sell and show your stall so a reviewer can confirm you are a fish vendor.")}
                </p>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="reg-market">{t("Public Market Name")}</label>
                    {marketsHere.length > 0 && (
                      <select
                        id="reg-market"
                        value={marketChoice}
                        onChange={(e) => {
                          setMarketChoice(e.target.value);
                          update("market_name", e.target.value === OTHER_MARKET ? "" : e.target.value);
                        }}
                      >
                        <option value="">{t("Select your market")}</option>
                        {marketsHere.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                        <option value={OTHER_MARKET}>{t("Other (not listed)")}</option>
                      </select>
                    )}
                    {(marketsHere.length === 0 || marketChoice === OTHER_MARKET) && (
                      <input
                        id={marketsHere.length ? "reg-market-other" : "reg-market"}
                        type="text"
                        placeholder={t("e.g. Carbon Market")}
                        value={form.market_name}
                        onChange={(e) => update("market_name", e.target.value)}
                        style={marketsHere.length ? { marginTop: 8 } : undefined}
                        aria-label={t("Market name")}
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-stall">{t("Stall Number")}</label>
                    <input id="reg-stall" type="text" placeholder={t("e.g. A-15")} value={form.stall_number} onChange={(e) => update("stall_number", e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-permit-number">{t("Vendor Permit Number")}{" "}<span className="optional">{t("(optional)")}</span></label>
                  <input id="reg-permit-number" type="text" placeholder={t("Enter your vendor permit number")} value={form.permit_number} onChange={(e) => update("permit_number", e.target.value)} />
                </div>

                <FileField
                  id="reg-permit-document"
                  label="Vendor Permit or Market Certification"
                  optional
                  hint={`Any one: Mayor's or business permit, stall lease or certificate from the Market Administrator, or a barangay certification that you sell fish · PDF, JPG or PNG · up to ${MAX_DOCUMENT_MB} MB`}
                  accept=".pdf,.jpg,.jpeg,.png"
                  file={form.permit_document}
                  error={fileErrors.permit_document}
                  onChange={(file) => pickFile("permit_document", file, false)}
                  camera="environment"
                  cameraTitle="Take a photo of your permit"
                />

                <FileField
                  id="reg-stall-photo"
                  label="Photo of Your Market Stall"
                  hint="Show your stall with fish on display and the stall number or market sign visible · JPG or PNG"
                  accept=".jpg,.jpeg,.png"
                  file={form.stall_photo}
                  error={fileErrors.stall_photo}
                  onChange={(file) => pickFile("stall_photo", file, true)}
                  camera="environment"
                  cameraTitle="Take a photo of your stall"
                />
              </section>
            )}

            {/* LGU OFFICER VERIFICATION */}
            {role === "LGU Officer" && (
              <section className="register-section register-section-verify">
                <h4 className="register-section-title">{t("LGU Officer Verification")}</h4>
                <p className="register-section-desc">
                  <strong>{t("All fields here are optional.")}</strong>{" "}{t("Fill in what you can. You can register even if some details are missing; an Administrator will check them and may ask you for the rest before approving.")}
                </p>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="reg-department">{t("Department / Office")}</label>
                    <input id="reg-department" type="text" placeholder={t("e.g. Agriculture Office")} value={form.department} onChange={(e) => update("department", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-position">{t("Official Position")}</label>
                    <input id="reg-position" type="text" placeholder={t("e.g. Fisheries Officer")} value={form.position} onChange={(e) => update("position", e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="reg-official-email">{t("Work Email")}</label>
                    <input id="reg-official-email" type="email" placeholder={t("name@lgu.gov.ph")} value={form.official_email} onChange={(e) => update("official_email", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="reg-employee-id">{t("Employee ID")}</label>
                    <input id="reg-employee-id" type="text" placeholder={t("e.g. 2024-0153")} value={form.employee_id} onChange={(e) => update("employee_id", e.target.value)} />
                  </div>
                </div>

                <FileField
                  id="reg-authorization"
                  label="Proof of Employment or Authorization"
                  hint={`Any one: Certificate of Employment, appointment or office order, or an authorization letter signed by your department head on official letterhead · PDF preferred (JPG or PNG accepted) · up to ${MAX_DOCUMENT_MB} MB`}
                  accept=".pdf,.jpg,.jpeg,.png"
                  file={form.authorization_document}
                  error={fileErrors.authorization_document}
                  onChange={(file) => pickFile("authorization_document", file, false)}
                  optional
                  camera="environment"
                  cameraTitle="Take a photo of your document"
                />
              </section>
            )}

            {error && <div className="login-error" role="alert">⚠ {error}</div>}

            <label className="consent-row">
              <input type="checkbox" checked={form.agree} onChange={(e) => update("agree", e.target.checked)} />
              <span>{t("I agree to AquaTimbang's Privacy Policy and Terms of Use, and consent to my data being processed for account verification.")}</span>
            </label>

            <button type="submit" className="primary-btn full-btn">{t("Create Account")}</button>
          </form>

          <div className="login-hint login-hint-big">
            {t("Already have an account?")}{" "}
            <button className="login-inline-link login-inline-link-big" onClick={onGoToLogin}>{t("Log in instead")}</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// File picker styled as an upload box that shows the chosen file name,
// with View (check it is the right file) and ✕ (remove it) once chosen.
function FileField({ id, label, hint, accept, file, onChange, error = "", optional = false, camera = "", cameraTitle }) {
  const t = useT();
  const [previewUrl, setPreviewUrl] = useState("");
  const [inputKey, setInputKey] = useState(0);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const isImage = file?.type?.startsWith("image/");
  const remove = () => { setInputKey((k) => k + 1); onChange(null); };
  return (
    <div className="form-group">
      <span className="file-field-label">
        {t(label)} {optional && <span className="optional">{t("(optional)")}</span>}
      </span>
      <div className="file-field-row">
        <label htmlFor={id} className={`file-field ${file ? "file-field-filled" : ""}`}>
          <span className="file-field-icon">{file ? "✓" : "⇪"}</span>
          <span className="file-field-text">
            <strong>{file ? file.name : t("Click to upload a file")}</strong>
            <small>{file ? t("Click to choose a different file") : t(hint)}</small>
          </span>
          <input key={inputKey} id={id} type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] || null)} />
        </label>
        {file && (
          <div className="file-field-actions">
            <button type="button" className="file-field-view" onClick={() => setPreviewUrl(URL.createObjectURL(file))}>{t("View")}</button>
            <button type="button" className="file-field-remove" onClick={remove} aria-label={`Remove ${file.name}`} title={t("Remove this file")}>✕</button>
          </div>
        )}
      </div>
      {camera && (
        <div className="file-field-camera">
          <span>{t("or")}</span>
          <TakePhotoButton onFile={onChange} facing={camera} cameraTitle={cameraTitle && t(cameraTitle)} />
        </div>
      )}
      {error && <small className="field-error" role="alert">{error}</small>}
      {previewUrl && createPortal(
        <div className="doc-preview-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreviewUrl(""); }}>
          <div className="doc-preview" role="dialog" aria-modal="true" aria-label={file?.name || label}>
            <div className="doc-preview-head">
              <strong>{file?.name || label}</strong>
              <button type="button" className="secondary-btn" onClick={() => setPreviewUrl("")}>{t("Close")}</button>
            </div>
            {isImage ? <img src={previewUrl} alt={label} /> : <iframe src={previewUrl} title={label} />}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default Register;
