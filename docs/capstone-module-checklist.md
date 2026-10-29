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
| LGU Officer accounts | 🟡 | Paper: **created by the System Administrator**. System: LGU Officers self-register and wait for approval. |
| Approve / reject registrations | 🟡 | Paper: vendors are approved by **LGU Personnel or the Administrator**. System: Administrator only. |
| Login with role-based dashboard | ✅ | |
| "Pending approval" / "Registration rejected" login messages | 🟡 | Pending shows "account is inactive"; rejected shows "Invalid username or password". |
| Logout ends the session | 🟡 | Clears the browser only; the server token stays valid. |
| Lock account for 15 min after 5 failed logins (UC-1 3d) | ❌ | |
| Forgot password → reset link valid 1 hour (UC-1 3e) | ❌ | Login page currently says to contact an Administrator. |
| Session expires after inactivity (Table 24/41) | ❌ | Tokens never expire. |
| Log every login with timestamp (UC-1 step 6, AccessLogs) | ❌ | Activity log does not record logins. |

## 2. Municipal Fish Price Dashboard Module (UC-2)

| Function | Status | Notes |
|---|---|---|
| Real-time (latest) price display | ✅ | Vendor, LGU and Admin dashboards. |
| Historical price visualization | ✅ | Price Trends pages. |
| Filters: species, date range, municipality | 🟡 | Species and municipality yes; date-range filter not on every view. |
| Interactive charts (Chart.js / Recharts in the paper) | 🟡 | Forecast pages use Recharts (hover tooltips, confidence band); trend pages still use simple charts. |
| Forecast integration (SARIMAX) | ✅ | Vendor, LGU and Admin forecast pages use the SARIMAX API. |
| Data export & sharing (LGU, Admin) | ✅ | CSV export. |
| Responsive interface | 🟡 | Login/Register checked on phone width; dashboards not yet checked. |
| "No data available for the selected filters" message | ✅ | |

## 3. Fair Price Calculator Module (UC-3)

| Function | Status | Notes |
|---|---|---|
| Select species, enter weight | ✅ | |
| Total = weight × latest LGU-validated price per kg | ✅ | |
| "Weight must be greater than zero" / "No current price" messages | ✅ | |
| Save calculation history (WeightEntries, Table 20) | ❌ | Calculations are not stored. |

## 4. Price Entry and Validation Module (UC-4)

| Function | Status | Notes |
|---|---|---|
| Daily price input | ✅ | |
| Submission & review panel | ✅ | Draft → Pending → Approved → Published, plus Flag/Reject. |
| Official price publication | ✅ | Paper UC-4 says prices publish **immediately**; system requires review first. Decide which is correct. |
| Audit & logging | ✅ | Every create/edit/submit/approve/publish/flag/reject is logged. |
| Configurable min/max price bounds | 🟡 | Fixed ₱50–₱1,000 in the LGU front-end; not configurable, not enforced by the backend. |
| Corrections keep the original record (IsCorrection / OriginalPriceID, Table 19) | 🟡 | Edits overwrite the record; the change is only kept in the activity log. |
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
| Validation log report | ✅ | LGU Validation History. |
| User activity logs (Admin) | ✅ | Admin Activity Logs. |
| Export CSV | ✅ | |
| Export PDF | 🟡 | Uses the browser's Print → Save as PDF. |
| External factor summaries | ❌ | External factor data now exists; a report for it is not built yet. |
| Log generated reports (Reports table, Table 22) | ❌ | |

## 7. User Management Module (UC-7)

| Function | Status | Notes |
|---|---|---|
| Review pending registrations, approve/reject | ✅ | With verification documents. |
| Create user accounts (needed for LGU Officers per UC-1) | ❌ | |
| Edit / update user information | ❌ | |
| Deactivate / delete accounts | ❌ | |
| Role assignment & management | ❌ | |
| Password reset & recovery | ❌ | |
| User activity logs | ✅ | |
| Block approval when required fields are missing (e.g. no municipality) | ❌ | |

## 8. Fish Species Management Module (UC-8)

| Function | Status | Notes |
|---|---|---|
| Species list maintenance (add/edit) | ✅ | |
| Common & scientific name registry | ✅ | |
| Active/inactive status | ✅ | Inactive species hidden from price entry. |
| Duplicate-name check | ✅ | |
| Warn before deactivating a species with price entries | 🟡 | LGU page confirms; deletion is blocked when prices exist. |

## Security requirements (Tables 24 and 41)

| Requirement | Status | Notes |
|---|---|---|
| Passwords hashed (Django PBKDF2) | ✅ | |
| Role-based access control | ✅ | |
| Credentials in environment variables, no hardcoding | ✅ | `backend/.env`. |
| CORS restricted to trusted domains | ✅ | `CORS_ALLOWED_ORIGINS`. |
| Login lockout, session timeout | ❌ | See Module 1. |
| API rate limiting | ❌ | |
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
3. **User Management** — create, edit, deactivate, role assignment, password reset; let
   LGU Officers approve vendors.
4. **Authentication security** — clear pending/rejected messages, lockout after 5 failed
   logins, session timeout, server-side logout, login logging.
5. **Price corrections and bounds** — keep original records on correction; configurable
   min/max bounds (System Configuration).
6. **Smaller items** — save calculator history, PDF export, log generated reports.
