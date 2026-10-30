import React, { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./Login.css";

import Landing from "./Landing.jsx";
import Register from "./Register.jsx";
import Admin from "./Admin.jsx";
import Vendor from "./Vendor.jsx";
import LGU from "./Lgu.jsx";
import { API_BASE_URL } from "./api/config.js";
import { logout, SESSION_ENDED_EVENT, useIdleLogout } from "./api/session.js";


function App() {
  // Controls which page/dashboard is currently displayed.
  
// Restore the correct dashboard when refreshing the browser.
  const [page, setPage] = useState(() => {
  // Retrieve the saved authentication information.
  const token = localStorage.getItem("authToken");
  const savedUser = localStorage.getItem("user");

  // No saved session means the visitor starts on Landing.
  if (!token || !savedUser) {
    return "landing";
  }

  try {
    // Read the role returned by Django during login.
  const user = JSON.parse(savedUser);

    // Restore the dashboard based on the user's role.
    if (user.role === "LGU Officer") return "LGU";
    if (user.role === "Fish Vendor") return "Vendor";
    if (user.role === "Administrator") return "Admin";
  } catch (error) {
    // Invalid saved data should not crash the website.
    console.error("Unable to restore login:", error);
  }

  // Default to Landing if the role is unknown.
  return "landing";
});


  // Message shown on the login page after the session ends on its own.
  const [loginNotice, setLoginNotice] = useState("");

  // Navigation functions.
  const handleLogout = async () => {
    // End the session on the server and forget the saved login.
    await logout();
    setLoginNotice("");
    setPage("landing");
  };

  // Session expired, logged out elsewhere, or account disabled.
  const showSessionEnded = useCallback((message) => {
    setLoginNotice(message);
    setPage("login");
  }, []);

  useEffect(() => {
    const onEnded = (event) => showSessionEnded(event.detail?.message || "Please log in again.");
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [showSessionEnded]);

  // Automatic logout after inactivity on any dashboard.
  useIdleLogout(["Admin", "Vendor", "LGU"].includes(page), showSessionEnded);

  const goLanding = () => setPage("landing");
  const goLogin = () => setPage("login");
  const goRegister = () => setPage("register");

  // Display the correct dashboard.
  if (page === "Admin") {
    return <Admin onLogout={handleLogout} />;
  }

  if (page === "Vendor") {
  const savedUser = localStorage.getItem("user");

  let currentUser = null;

  try {
    currentUser = savedUser ? JSON.parse(savedUser) : null;
  } catch (error) {
    console.error("Unable to load vendor information:", error);
  }

  return (
    <Vendor
      onLogout={handleLogout}
      currentUser={currentUser}
    />
  );
}

  if (page === "LGU") {
    return <LGU onLogout={handleLogout} />;
  }

  // Display registration page.
  if (page === "register") {
    return (
      <Register
        onBack={goLanding}
        onGoToLogin={goLogin}
      />
    );
  }

  // Display login page.
  if (page === "login") {
    return (
      <Login
        onLogin={(next) => { setLoginNotice(""); setPage(next); }}
        notice={loginNotice}
        onBack={goLanding}
        onRegister={goRegister}
      />
    );
  }

  // Default page.
  return (
    <Landing
      onGetStarted={goLogin}
      onRegister={goRegister}
    />
  );
}


/* =========================
   LOGIN
========================= */

function Login({ onLogin, onBack, onRegister, notice = "" }) {
  // Login form values.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Error message displayed underneath the form.
  const [error, setError] = useState("");

  // Forgot-password states.
  const [forgotMode, setForgotMode] = useState(false);


  /* =========================
     REAL DJANGO LOGIN
  ========================= */

  const handleSubmit = async (e) => {
    // Prevent the browser from refreshing the page.
    e.preventDefault();

    // Make sure both fields were filled in.
    if (!username.trim() || !password.trim()) {
      setError("Please enter your username and password.");
      return;
    }

    // Remove an old error before trying again.
    setError("");

    try {
      // Send the username and password to Django.
      const response = await fetch(
        `${API_BASE_URL}/auth/login/`,
        {
          method: "POST",

          // Tell Django that JSON is being sent.
          headers: {
            "Content-Type": "application/json",
          },

          // Convert the username/password into JSON.
          body: JSON.stringify({
            username: username,
            password: password,
          }),
        }
      );

      // Read Django's JSON response.
      const data = await response.json();

      // Django rejected the login.
      if (!response.ok) {
        setError(
          data.message ||
          data.detail ||
          "Invalid username or password."
        );

        return;
      }

      // Make sure Django actually returned a token.
      if (!data.token) {
        setError("The server did not return an authentication token.");
        return;
      }

      // Make sure user information exists.
      if (!data.user) {
        setError("The server did not return user information.");
        return;
      }

      // Save the token so other API requests can use it.
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("sessionIdleMinutes", String(data.session_idle_minutes || 30));

      // Save basic information about the logged-in user.
      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

      // Read the REAL role returned by Django.
      const role = data.user.role;

      // Open the correct dashboard.
      if (role === "Fish Vendor") {
        onLogin("Vendor");
      } else if (role === "LGU Officer") {
        onLogin("LGU");
      } else if (role === "Administrator") {
        onLogin("Admin");
      } else {
        // Unknown roles should not be allowed into a dashboard.
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");

        setError(
          `Unknown AquaTimbang role: ${role || "No role assigned"}`
        );
      }
    } catch (error) {
      // This normally means Django is offline or unreachable.
      console.error("Login error:", error);

      setError(
        "Unable to connect to the AquaTimbang server."
      );
    }
  };


  const backToLoginForm = () => {
    // Return from forgot-password mode.
    setForgotMode(false);
    setError("");
  };


  return (
    <div className="login-page">
      <div className="login-card">

        {/* =========================
            LEFT PANEL
        ========================= */}

        <div className="login-left">

          <button
            className="login-back-btn"
            onClick={onBack}
          >
            ← Back to Home
          </button>

          <div className="login-brand login-brand-spaced">

            <div className="brand-icon">
              🐟
            </div>

            <div>
              <h2>AquaTimbang</h2>
              <span>Fish Price Transparency</span>
            </div>

          </div>

          <h1>
            Fair prices,
            <br />
            clearly shown.
          </h1>

          <p>
            AquaTimbang publishes LGU-validated fish prices
            so vendors and buyers work from the same
            official rates.
          </p>

          <div className="login-points">

            <div className="login-point">
              <span>✔</span>
              {" "}Prices validated by LGU officers
            </div>

            <div className="login-point">
              <span>✔</span>
              {" "}Instant fair price computation
            </div>

            <div className="login-point">
              <span>✔</span>
              {" "}Short-term price forecasting
            </div>

          </div>

          <div className="login-fish">
            🐟
          </div>

        </div>


        {/* =========================
            RIGHT PANEL
        ========================= */}

        <div className="login-right">

          <div className="auth-tabs">

            <button
              className="auth-tab auth-tab-active"
            >
              Login
            </button>

            <button
              className="auth-tab"
              onClick={onRegister}
            >
              Register
            </button>

          </div>


          {/* =========================
              FORGOT PASSWORD PAGE
          ========================= */}

          {forgotMode ? (

            <>
              <div className="login-head">

                <h3>Reset your password</h3>

                <p>
                  AquaTimbang does not send password reset emails yet.
                  Please contact your AquaTimbang Administrator to
                  have your password reset.
                </p>

              </div>

              <button
                className="primary-btn full-btn"
                onClick={backToLoginForm}
              >
                ← Back to Login
              </button>
            </>

          ) : (

            /* =========================
               LOGIN FORM
            ========================= */

            <>

              <div className="login-head">

                <h3>
                  Sign in to your account
                </h3>

                <p>
                  Enter your username and password.
                </p>

              </div>


              {notice && !error && (
                <div className="session-notice" role="status">
                  🔒 {notice}
                </div>
              )}

              <form onSubmit={handleSubmit}>

                {/* Username */}
                <div className="form-group">

                  <label>
                    Username
                  </label>

                  <input
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value)
                    }
                    autoComplete="username"
                  />

                </div>


                {/* Password */}
                <div className="form-group">

                  <label>
                    Password
                  </label>

                  <div className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((shown) => !shown)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>

                </div>


                {/* Forgot password */}
                <div className="forgot-link-row">

                  <button
                    type="button"
                    className="forgot-link"
                    onClick={() => {
                      setError("");
                      setForgotMode(true);
                    }}
                  >
                    Forgot password?
                  </button>

                </div>


                {/* Login errors */}
                {error && (
                  <div className="login-error">
                    ⚠ {error}
                  </div>
                )}


                {/* Submit real Django login */}
                <button
                  type="submit"
                  className="primary-btn full-btn"
                >
                  Sign In
                </button>

              </form>


              {/* Registration link */}
              <div className="login-hint login-hint-big">

                New here?{" "}

                <button
                  className="login-inline-link login-inline-link-big"
                  onClick={onRegister}
                >
                  Register instead
                </button>

              </div>

            </>

          )}

        </div>

      </div>
    </div>
  );
}


export default App;