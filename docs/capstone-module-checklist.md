# AquaTimbang — Capstone vs. System Checklist

Compares the capstone paper (`aquatimbang-final-print.pdf`) with the system in this
repository. Update the status column as features are built.

**Legend:** ✅ Done · 🟡 Partly done / works differently · ❌ Missing

References: UC = use case (Chapter III, Tables 7–14), Table 27 = List of Modules,
Tables 15–23 = Data Dictionary, Tables 24/41 = Security.

---

## 1. User Authentication Module (UC-1)

| Function | Status | Notes |
|---|---|---|
| Fish Vendor self-registration | ✅ | Register page with market/stall verification. |
| LGU Officer accounts | ✅ | Administrators create LGU Officer accounts (active immediately). Self-registration as LGU Officer is still possible and needs Administrator approval. |
| Approve / reject registrations | ✅ | LGU Officers review Fish Vendors in their municipality (Vendor Registrations page); Administrators review everyone. Approval requires ticking every item of a role-specific checklist (Approval guidelines). A rejected applicant sees the reason when logging in. |
| Profile photo, reason for registering, fish sold | ✅ | Every applicant uploads a face photo and writes why they are registering. Vendors pick the fish they sell (shown first on their dashboard; editable in My Profile). |
| Verification uploads | ✅ | Documents: PDF, JPG or PNG up to 10 MB. Photos: JPG or PNG up to 5 MB; large phone photos are shrunk in the browser first. Vendors must upload a stall photo; the permit is optional. LGU Officers must upload proof of employment. |
| Login with role-based dashboard | ✅ | |
| "Pending approval" / "Registration rejected" / "Account disabled" login messages | ✅ | UC-1 3b, 3c and E2 wording. A wrong password never reveals the account status. |
| Logout ends the session | ✅ | The server deletes the login token (`/api/auth/logout/`). |
| Lock account for 15 min after 5 failed logins (UC-1 3d) | 🟡 | Locked even with the right password; logged. The email notice needs an email server. |
| Forgot password → reset link valid 1 hour (UC-1 3e) | ❌ | Login page currently says to contact an Administrator. |
| Session expires after inactivity (Table 24/41) | ✅ | 30 minutes by default (`SESSION_IDLE_MINUTES`); enforced by the server and by an idle timer in the browser. |
| Log every login with timestamp (UC-1 step 6, AccessLogs) | ✅ | Logged in, logged out, login failed and locked appear in Activity Logs. |

## 2. Municipal Fish Price Dashboard Module (UC-2)

| Function | Status | Notes |
|---|---|---|
| Real-time (latest) price display | ✅ | Vendor, LGU and Admin dashboards. |
| Historical price visualization | ✅ | Price Trends pages. |
| Filters: species, date range, municipality | 🟡 | Species and municipality yes; date-range filter not on every view. |
| Interactive charts (Chart.js / Recharts in the paper) | 🟡 | Forecast pages use Recharts (hover tooltips, confidence band); trend pages still use simple charts. |
| Forecast integration (SARIMAX) | ✅ | Vendor, LGU and Admin forecast pages use the SARIMAX API. |
| Data export & sharing (LGU, Admin) | ✅ | CSV and PDF export. |
| Responsive interface | 🟡 | Login/Register checked on phone width; dashboards not yet checked. |
| "No data available for the selected filters" message | ✅ | |

## 3. Fair Price Calculator Module (UC-3)

| Function | Status | Notes |
|---|---|---|
| Select species, enter weight | ✅ | |
| Total = weight × latest LGU-validated price per kg | ✅ | |
| "Weight must be greater than zero" / "No current price" messages | ✅ | |
| Save calculation history (WeightEntries, Table 20) | ✅ | "Save to History" stores species, municipality, weight, the published price used and the total (`/api/weight-entries/`). The server recomputes the total from the latest published price. Vendors can remove their own entries. |

## 4. Price Entry and Validation Module (UC-4)

| Function | Status | Notes |
|---|---|---|
| Daily price input | ✅ | |
| Submission & review panel | ✅ | Draft → Pending → Approved → Published, plus Flag/Reject. |
| Official price publication | ✅ | Paper UC-4 says prices publish **immediately**; system requires review first. Decide which is correct. |
| Audit & logging | ✅ | Every create/edit/submit/approve/publish/flag/reject is logged. |
| Configurable min/max price bounds | ✅ | Admin sets the range in System Configuration; the backend rejects prices outside it (UC-4 4.1). |
| Corrections keep the original record (IsCorrection / OriginalPriceID, Table 19) | ✅ | Published prices can only be corrected with a reason; `is_correction` flag plus a `PriceCorrection` history (old price, new price, reason, who, when). Published prices cannot be deleted. |
| External factor integration (fuel, weather, holidays) | ✅ | External Factors page for LGU Officers and Administrators (`/api/external-factors/`). |

## 5. Predictive Analytics Module — SARIMAX (UC-6, Table 27)

| Function | Status | Notes |
|---|---|---|
| SARIMAX forecasting core (statsmodels + pmdarima auto_arima) | ✅ | `backend/api/forecasting.py`; auto_arima picks the order with weekly seasonality (m=7). |
| External regressors (fuel price, weather, holidays) | ✅ | Used when logged on at least half of the training days; each factor's effect is shown. |
| Confidence intervals | ✅ | 95% intervals from the SARIMAX model, drawn as a band on the chart. |
| Store forecasts (Predictions table, Table 21) | ✅ | `ForecastRun` + `Prediction` tables; reused until new prices or factors are recorded. |
| Accuracy evaluation (MAPE, RMSE) | ✅ | Measured on the last 7 days held out from training. |
| Require ≥ 4 weeks of data; fall back to trend if the model fails | ✅ | Under 28 days or on a model error, a trend line is shown with the UC-6 warning. |
| Visualization & insights | ✅ | Forecast chart, daily table, insight text, CSV export, forecast history (Admin). |

## 6. Reports Module (UC-5)

| Function | Status | Notes |
|---|---|---|
| Price history report | ✅ | LGU Reports, Admin Reports Management. |
| Validation log report | ✅ | LGU Reports and Validation History. |
| User activity logs (Admin) | ✅ | Admin Activity Logs. |
| Export CSV | ✅ | |
| Export PDF | ✅ | Real PDF files (title, filters, summary, who generated it, page numbers). |
| External factor summaries | ✅ | LGU "External Factor Summary" (days logged, average fuel price, rainy/stormy days, holidays) and Admin "External Factor Report". |
| Log generated reports (Reports table, Table 22) | ✅ | Every CSV/PDF export is saved (`/api/reports/`): type, format, filters, row count, who, when. Administrators see all of them under Reports Management → Generated Reports. |

## 7. User Management Module (UC-7)

| Function | Status | Notes |
|---|---|---|
| Review pending registrations, approve/reject | ✅ | With verification documents. |
| Create user accounts (needed for LGU Officers per UC-1) | ✅ | + Add User. |
| Edit / update user information | ✅ | Name, username, email, contact, municipality. |
| Deactivate / delete accounts | ✅ | Deactivating logs the user out. Accounts with price suggestions can only be deactivated, to keep their history. |
| Role assignment & management | ✅ | One role per account; changing it logs the user out. The last active Administrator cannot be removed or demoted. |
| Password reset & recovery | 🟡 | Administrator gives a one-time temporary password; users change their password in My Profile. Email reset links (UC-1 3e) need an email server. |
| User activity logs | ✅ | |
| Block approval when required fields are missing (e.g. no municipality) | ✅ | |

## 8. Fish Species Management Module (UC-8)

| Function | Status | Notes |
|---|---|---|
| Species list maintenance (add/edit) | ✅ | |
| Common & scientific name registry | ✅ | |
| Active/inactive status | ✅ | Inactive species hidden from price entry. |
| Duplicate-name check | ✅ | |
| Species photo | ✅ | LGU Officers and Administrators upload a photo. Vendors choose fish by photo (Submit Suggested Price, Fair Price Calculator, Price Trends, registration) and tap a fish name to see its photo, description and latest price. Fish photos are public; all other uploads need a login. |
| Warn before deactivating a species with price entries | 🟡 | LGU page confirms; deletion is blocked when prices exist. |

## Accessibility (not in the paper)

| Function | Status | Notes |
|---|---|---|
| Vendor dashboard in English, Filipino and Cebuano | ✅ | Language picker in the vendor header, remembered on the device. Menus, dashboard, current prices, calculator, suggestions, notifications, help and My Profile are translated; Price Trends, Community Average and Export Reports details stay in English. Translations should be checked by a native speaker. |

## Security requirements (Tables 24 and 41)

| Requirement | Status | Notes |
|---|---|---|
| Passwords hashed (Django PBKDF2) | ✅ | |
| Role-based access control | ✅ | |
| Credentials in environment variables, no hardcoding | ✅ | `backend/.env`. |
| CORS restricted to trusted domains | ✅ | `CORS_ALLOWED_ORIGINS`. |
| Login lockout, session timeout | ✅ | See Module 1. |
| API rate limiting | ✅ | 120 requests/minute without login, 1,200 with login (configurable in `.env`). |
| HTTPS, firewall, hosting | ❌ | Backend is not deployed yet. |

---

## In the system but not in the paper

| Feature | Decide |
|---|---|
| Vendor suggested prices, community average, LGU/Admin suggestion review | UC-2 says "No vendor suggestions are shown", but its postcondition mentions "average suggestions". Keep and add to the paper, or remove? |
| Markets list, System Announcements, Notifications pages | Not described in the paper. |
| Fisherfolk Management (LGU) | Not described in the paper. |

## Contradictions inside the paper to settle with the team

1. **External factors:** Functional Feature 5 and Table 27 say forecasts use weather, fuel prices and holidays; Limitation 3 says "No external regressors … are employed".
2. **Daily vs weekly prices:** the ERD description says PriceRecords stores "weekly" prices; everywhere else says daily.
3. **Who approves vendors:** UC-1 says LGU Personnel; UC-7 and Figure 17 say the Administrator.
4. **Publishing:** UC-4 says entered prices publish immediately; Figure 16 describes validating before publishing.

## Suggested build order

1. Settle the contradictions above.
2. ~~**Predictive Analytics (SARIMAX)**~~ — done: external factors, SARIMAX forecast API,
   confidence intervals, saved predictions, MAPE/RMSE.
3. ~~**User Management**~~ — done: create, edit, deactivate, delete, roles, password reset,
   LGU Officers approve vendors.
4. ~~**Authentication security**~~ — done: lockout, session timeout, server-side logout,
   login logging, rate limiting. Still needs an email server for reset links and lock notices.
5. ~~**Price corrections and bounds**~~ — done: correction history, configurable price range.
6. ~~**Smaller items**~~ — done: calculator history, PDF export, external factor reports, report log.
7. **Email server** (optional) — reset links and lockout notices (UC-1 3d, 3e).
