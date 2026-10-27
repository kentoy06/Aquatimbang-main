import React, { useState } from "react";
import "./App.css";
import "./Login.css";

import Landing from "./Landing.jsx";
import Register from "./Register.jsx";
import Admin from "./Admin.jsx";
import Vendor from "./Vendor.jsx";
import LGU from "./Lgu.jsx";


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


  // Navigation functions.
  const handleLogout = () => {
    // Remove saved login information when the user logs out.
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");

    setPage("landing");
  };

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
        onLogin={setPage}
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

function Login({ onLogin, onBack, onRegister }) {
  // Login form values.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Error message displayed underneath the form.
  const [error, setError] = useState("");

  // Forgot-password states.
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);


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
        "http://127.0.0.1:8000/api/auth/login/",
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

      // Useful while developing/debugging AquaTimbang.
      console.log("LOGIN RESPONSE:", data);

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

      // Save basic information about the logged-in user.
      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

      // Read the REAL role returned by Django.
      const role = data.user.role;

      console.log("ROLE FROM DJANGO:", role);

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


  /* =========================
     FORGOT PASSWORD
  ========================= */

  const handleForgotSubmit = (e) => {
    // Prevent page refresh.
    e.preventDefault();

    // Require an email address.
    if (!forgotEmail.trim()) {
      setError(
        "Please enter your registered email address."
      );
      return;
    }

    setError("");

    // For now this only displays the confirmation screen.
    setForgotSent(true);
  };


  const backToLoginForm = () => {
    // Return from forgot-password mode.
    setForgotMode(false);
    setForgotSent(false);
    setForgotEmail("");
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

            forgotSent ? (

              <>
                <div className="login-head">

                  <h3>Check your email</h3>

                  <p>
                    If an account matches {forgotEmail},
                    we've sent password reset instructions
                    to it.
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

              <>
                <div className="login-head">

                  <h3>Reset your password</h3>

                  <p>
                    Enter your registered email and we'll
                    send you a reset link.
                  </p>

                </div>

                <form onSubmit={handleForgotSubmit}>

                  <div className="form-group">

                    <label>
                      Email Address
                    </label>

                    <input
                      type="email"
                      placeholder="you@email.com"
                      value={forgotEmail}
                      onChange={(e) =>
                        setForgotEmail(e.target.value)
                      }
                    />

                  </div>

                  {/* Display forgot-password errors. */}
                  {error && (
                    <div className="login-error">
                      ⚠ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="primary-btn full-btn"
                  >
                    Send Reset Link
                  </button>

                </form>

                <div className="login-hint forgot-hint">

                  <button
                    className="login-inline-link"
                    onClick={backToLoginForm}
                  >
                    ← Back to Login
                  </button>

                </div>
              </>

            )

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

                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    autoComplete="current-password"
                  />

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