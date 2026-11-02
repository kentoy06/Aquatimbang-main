import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders, fetchAll } from "../api/config.js";
import { parseCsv, TEMPLATE_CSV, toImportRows } from "../api/csvImport.js";

const CHUNK = 2000;

async function sendChunk(rows, source, dryRun) {
  const response = await fetch(apiUrl("/prices/import/"), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ rows, source, dry_run: dryRun }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.detail || `Import failed (HTTP ${response.status}).`);
  return data;
}

// Send all rows in chunks and add up the results.
async function runImport(rows, source, dryRun, onProgress) {
  const total = { ready: 0, imported: 0, already_recorded: 0, error_count: 0, errors: [], first_date: null, last_date: null };
  for (let start = 0; start < rows.length; start += CHUNK) {
    const result = await sendChunk(rows.slice(start, start + CHUNK), source, dryRun);
    total.ready += result.ready;
    total.imported += result.imported;
    total.already_recorded += result.already_recorded;
    total.error_count += result.error_count;
    total.errors.push(...result.errors);
    if (result.first_date && (!total.first_date || result.first_date < total.first_date)) total.first_date = result.first_date;
    if (result.last_date && (!total.last_date || result.last_date > total.last_date)) total.last_date = result.last_date;
    onProgress(Math.min(rows.length, start + CHUNK));
  }
  return total;
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "aquatimbang_price_history_template.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Import historical prices (e.g. DVFM records) from a CSV file.
 * Shared by the LGU Officer and Administrator dashboards.
 */
export default function PriceImport({ notify, onImported }) {
  const [municipalities, setMunicipalities] = useState([]);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState(null);
  const [defaultMunicipality, setDefaultMunicipality] = useState("");
  const [dayFirst, setDayFirst] = useState(null); // null: detect from the file
  const [source, setSource] = useState("DVFM historical data");
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetchAll("/municipalities/").then((rows) => setMunicipalities(rows.filter((m) => m.is_active !== false))).catch(() => {});
  }, []);

  const parsed = table ? toImportRows(table, { defaultMunicipality, dayFirst }) : null;

  const chooseFile = async (file) => {
    setCheck(null);
    setDone(null);
    setDayFirst(null);
    if (!file) { setTable(null); setFileName(""); return; }
    if (!/\.csv$/i.test(file.name)) {
      notify("Choose a .csv file. In Excel: File → Save As → CSV UTF-8 (Comma delimited).");
      return;
    }
    setFileName(file.name);
    setTable(parseCsv(await file.text()));
  };

  const run = async (dryRun) => {
    if (!parsed?.rows.length) return;
    setBusy(dryRun ? "check" : "import");
    setProgress(0);
    try {
      const result = await runImport(parsed.rows, source.trim(), dryRun, setProgress);
      if (dryRun) {
        setCheck(result);
      } else {
        setDone(result);
        setCheck(null);
        notify(`${result.imported.toLocaleString()} prices imported.`);
        onImported?.();
      }
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy("");
    }
  };

  const changeSetting = (apply) => { apply(); setCheck(null); };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Import Price History</h2>
          <p>Add past prices (for example from DVFM records) from a spreadsheet saved as CSV. They are saved as published prices on their original dates.</p>
        </div>
        <button className="secondary-btn" onClick={downloadTemplate}>↓ Download template</button>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="config-header">
            <div className="config-icon blue">⇪</div>
            <div><h3>1. Choose the file</h3><p>Excel: File → Save As → <strong>CSV UTF-8 (Comma delimited)</strong></p></div>
          </div>
          <div className="form-group">
            <label htmlFor="import-file">CSV file</label>
            <input id="import-file" type="file" accept=".csv,text/csv" onChange={(e) => chooseFile(e.target.files?.[0] || null)} />
          </div>
          <div className="form-group">
            <label htmlFor="import-municipality">Municipality (when the file has no Municipality column)</label>
            <select id="import-municipality" value={defaultMunicipality} onChange={(e) => changeSetting(() => setDefaultMunicipality(e.target.value))}>
              <option value="">Use the file's Municipality column</option>
              {municipalities.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="import-source">Source</label>
            <input id="import-source" maxLength={150} value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          <div className="info-box">
            <strong>Accepted layouts</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>One row per price: <code>Date, Fish, Municipality, Price</code></li>
              <li>One column per fish: <code>Date, Bangus, Galunggong, …</code> (choose the municipality above, or add a Municipality column)</li>
            </ul>
            Fish and municipality names must match the ones in AquaTimbang. Blank cells are skipped. Prices already recorded for the same fish, municipality and day are kept and not overwritten.
          </div>
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon green">✔</div>
            <div><h3>2. Check, then import</h3><p>Nothing is saved until you click Import</p></div>
          </div>

          {!parsed && <div className="info-box">Choose a file to see what will be imported.</div>}

          {parsed && parsed.problems.length > 0 && (
            <div className="warn-box" role="alert">{parsed.problems.map((p) => <div key={p}>{p}</div>)}</div>
          )}

          {parsed && !parsed.problems.length && (
            <>
              <div className="profile-grid">
                <div className="profile-field"><span>File</span><strong>{fileName}</strong></div>
                <div className="profile-field"><span>Prices found</span><strong>{parsed.rows.length.toLocaleString()}</strong></div>
                <div className="profile-field"><span>Layout</span><strong>{parsed.layout === "long" ? "One row per price" : `One column per fish (${parsed.fishColumns.length})`}</strong></div>
                <div className="profile-field">
                  <span>Dates like 03/04/2024 mean</span>
                  <select value={parsed.dayFirst ? "dmy" : "mdy"} onChange={(e) => changeSetting(() => setDayFirst(e.target.value === "dmy"))}>
                    <option value="mdy">March 4 (month/day/year)</option>
                    <option value="dmy">3 April (day/month/year)</option>
                  </select>
                </div>
              </div>

              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="inner-table">
                  <thead><tr><th>ROW</th><th>DATE</th><th>FISH</th><th>MUNICIPALITY</th><th>PRICE</th></tr></thead>
                  <tbody>
                    {parsed.rows.slice(0, 8).map((r, i) => (
                      <tr key={i}><td>{r.row}</td><td>{r.date}</td><td>{r.fish}</td><td>{r.municipality || "—"}</td><td>{r.price}</td></tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 8 && <p className="chart-note">First 8 of {parsed.rows.length.toLocaleString()} prices.</p>}
              </div>

              {busy && (
                <div className="info-box">
                  {busy === "check" ? "Checking" : "Importing"}… {progress.toLocaleString()} / {parsed.rows.length.toLocaleString()}
                  <div style={{ height: 6, background: "#e4e7ec", borderRadius: 4, marginTop: 6 }}>
                    <div style={{ height: 6, width: `${(progress / parsed.rows.length) * 100}%`, background: "#0e7c86", borderRadius: 4 }} />
                  </div>
                </div>
              )}

              {check && (
                <div className={check.error_count ? "warn-box" : "info-box"} style={{ marginTop: 12 }}>
                  <strong>{check.ready.toLocaleString()} prices ready to import</strong>
                  {check.first_date && <> ({check.first_date} to {check.last_date})</>}.
                  {check.already_recorded > 0 && <> {check.already_recorded.toLocaleString()} already recorded (will be skipped).</>}
                  {check.error_count > 0 && <> {check.error_count.toLocaleString()} rows have problems and will be skipped.</>}
                </div>
              )}

              {check?.errors.length > 0 && (
                <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8 }}>
                  <table className="inner-table">
                    <thead><tr><th>ROW</th><th>PROBLEM</th></tr></thead>
                    <tbody>
                      {check.errors.slice(0, 200).map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>)}
                    </tbody>
                  </table>
                  {check.error_count > 200 && <p className="chart-note">Showing 200 of {check.error_count.toLocaleString()} problems.</p>}
                </div>
              )}

              <div className="button-row" style={{ marginTop: 14 }}>
                <button className="secondary-btn" onClick={() => run(true)} disabled={Boolean(busy)}>Check File</button>
                <button className="primary-btn" onClick={() => run(false)} disabled={Boolean(busy) || !check || check.ready === 0}>
                  {check ? `Import ${check.ready.toLocaleString()} Prices` : "Import"}
                </button>
              </div>
            </>
          )}

          {done && (
            <div className="info-box" style={{ marginTop: 12 }} role="status">
              ✔ <strong>{done.imported.toLocaleString()} prices imported</strong>
              {done.first_date && <> ({done.first_date} to {done.last_date})</>}. They now appear in Price Trends, Reports and the forecasts.
              {done.already_recorded > 0 && <> {done.already_recorded.toLocaleString()} were already recorded and kept.</>}
              {done.error_count > 0 && <> {done.error_count.toLocaleString()} rows with problems were skipped.</>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
