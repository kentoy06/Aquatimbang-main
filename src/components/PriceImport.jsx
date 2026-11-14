import React, { useEffect, useState } from "react";
import { apiUrl, authHeaders, fetchAll } from "../api/config.js";
import { parseCsv, parsePriceList, TEMPLATE_CSV, toImportRows } from "../api/csvImport.js";
import { askConfirm } from "./ConfirmDialog.jsx";
import PagedTable from "./PagedTable.jsx";

const CHUNK = 2000;

async function sendChunk(rows, source, dryRun, options) {
  const response = await fetch(apiUrl("/prices/import/"), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ rows, source, dry_run: dryRun, ...options }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.detail || `Import failed (HTTP ${response.status}).`);
  return data;
}

// Send all rows in chunks and add up the results.
async function runImport(rows, source, dryRun, onProgress, options = {}) {
  const total = { ready: 0, imported: 0, already_recorded: 0, error_count: 0, errors: [], first_date: null, last_date: null, new_fish: [], matched_names: [] };
  for (let start = 0; start < rows.length; start += CHUNK) {
    const result = await sendChunk(rows.slice(start, start + CHUNK), source, dryRun, options);
    total.ready += result.ready;
    total.imported += result.imported;
    total.already_recorded += result.already_recorded;
    total.error_count += result.error_count;
    total.errors.push(...result.errors);
    (result.new_fish || []).forEach((name) => { if (!total.new_fish.includes(name)) total.new_fish.push(name); });
    (result.matched_names || []).forEach((m) => { if (!total.matched_names.some((x) => x.from === m.from)) total.matched_names.push(m); });
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
const DRAFT_KEY = "aquatimbang:importDraft";
function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {}; } catch { return {}; }
}
function writeDraft(value) {
  try {
    if (value) localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage unavailable */ }
}

export default function PriceImport({ notify, onImported }) {
  const [municipalities, setMunicipalities] = useState([]);
  const [markets, setMarkets] = useState([]);
  // Market for rows without a Market column (each market has its own prices).
  const [marketId, setMarketId] = useState("");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState(null);
  const [defaultMunicipality, setDefaultMunicipality] = useState("");
  const [dayFirst, setDayFirst] = useState(null); // null: detect from the file
  const [source, setSource] = useState("DVFM historical data");
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(null);
  // Import as published prices (old official records) or send them to Review & Publish.
  const [sendToReview, setSendToReview] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  // "file": a CSV file. "paste": a price list copied from a document
  // (one date, then one fish and price per line).
  // A pasted list is kept as a draft on this device, so typing is not lost
  // when you open another page and come back.
  const draft = readDraft();
  const [mode, setMode] = useState(draft.text ? "paste" : "file");
  const [pasteText, setPasteText] = useState(draft.text || "");
  const [pasteDate, setPasteDate] = useState(draft.date || "");
  // Name shown in Recent Imports (e.g. "DVMF printout – Oct 6, 2026").
  const [importName, setImportName] = useState(draft.name || "");
  useEffect(() => {
    writeDraft(pasteText.trim() ? { text: pasteText, date: pasteDate, name: importName } : null);
  }, [pasteText, pasteDate, importName]);
  // Pasted lines the officer unticked (not fish, or not to import).
  const [skipped, setSkipped] = useState(() => new Set());

  useEffect(() => {
    fetchAll("/municipalities/").then((rows) => {
      const active = rows.filter((m) => m.is_active !== false);
      setMunicipalities(active);
      // The study covers Cebu City; it is chosen at first and can be changed.
      const cebu = active.find((m) => /^cebu city$/i.test(m.name));
      if (cebu) setDefaultMunicipality((current) => current || cebu.name);
    }).catch(() => {});
    fetchAll("/markets/").then((rows) => setMarkets(rows.filter((m) => m.is_active !== false))).catch(() => {});
  }, []);

  const parsed = mode === "file"
    ? (table ? toImportRows(table, { defaultMunicipality, dayFirst }) : null)
    : (pasteText.trim() ? parsePriceList(pasteText, { date: pasteDate, municipality: defaultMunicipality, dayFirst: Boolean(dayFirst) }) : null);
  // Markets of the chosen municipality; Pasil Fish Market first.
  const placeId = municipalities.find((m) => m.name === defaultMunicipality)?.id;
  const marketsHere = markets.filter((m) => String(m.municipality) === String(placeId));
  useEffect(() => {
    if (marketsHere.some((m) => String(m.id) === String(marketId))) return;
    const preferred = marketsHere.find((m) => /pasil/i.test(m.name)) || marketsHere[0];
    setMarketId(preferred ? String(preferred.id) : "");
  }, [placeId, markets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sourceName = mode === "file" ? fileName : `Pasted price list${parsed?.rows[0]?.date ? ` (${parsed.rows[0].date})` : ""}`;
  const isList = parsed?.layout === "list";
  const rowsToImport = parsed ? parsed.rows.filter((r) => !(isList && skipped.has(r.row))) : [];
  const toggleSkip = (row) => {
    setSkipped((prev) => { const next = new Set(prev); if (next.has(row)) next.delete(row); else next.add(row); return next; });
    setCheck(null);
  };

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
    if (!rowsToImport.length) return;
    setBusy(dryRun ? "check" : "import");
    setProgress(0);
    try {
      // One batch id for every chunk of this file, so the whole import can be undone.
      const batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const market = marketId ? { market: Number(marketId) } : {};
      const result = await runImport(rowsToImport, source.trim(), dryRun, setProgress, dryRun ? market : {
        ...market, batch_id: batchId, file_name: importName.trim() || sourceName, send_to_review: sendToReview,
      });
      if (dryRun) {
        setCheck(result);
      } else {
        setDone(result);
        setCheck(null);
        // Imported: the pasted draft is no longer needed.
        if (mode === "paste") { setPasteText(""); setPasteDate(""); setImportName(""); writeDraft(null); }
        notify(`${result.imported.toLocaleString()} prices imported${sendToReview ? " and sent to Review & Publish" : ""}.`);
        setHistoryKey((k) => k + 1);
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
          <p>Add past prices (for example from DVFM records) from a spreadsheet saved as CSV, on their original dates. A wrong file can be undone under Recent Imports.</p>
        </div>
        <button className="secondary-btn" onClick={downloadTemplate}>↓ Download template</button>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <div className="price-mode import-tabs" role="tablist" aria-label="How to add prices">
            <button type="button" role="tab" aria-selected={mode === "file"} className={mode === "file" ? "active" : ""} onClick={() => { setMode("file"); setCheck(null); setDone(null); }}>Upload a CSV file</button>
            <button type="button" role="tab" aria-selected={mode === "paste"} className={mode === "paste" ? "active" : ""} onClick={() => { setMode("paste"); setCheck(null); setDone(null); }}>Paste a price list</button>
          </div>
          {mode === "file" ? (
            <>
              <div className="config-header">
                <div className="config-icon blue">⇪</div>
                <div><h3>1. Choose the file</h3><p>Excel: File → Save As → <strong>CSV UTF-8 (Comma delimited)</strong></p></div>
              </div>
              <div className="form-group">
                <label htmlFor="import-file">CSV file</label>
                <input id="import-file" type="file" accept=".csv,text/csv" onChange={(e) => chooseFile(e.target.files?.[0] || null)} />
              </div>
            </>
          ) : (
            <>
              <div className="config-header">
                <div className="config-icon blue">✎</div>
                <div><h3>1. Paste the price list</h3><p>For a document with one date and one price per fish (Word, PDF, message)</p></div>
              </div>
              <div className="form-group">
                <label htmlFor="import-paste">Price list</label>
                <textarea id="import-paste" className="import-paste" rows={9} value={pasteText}
                  placeholder={"Date: March 4, 2024\nBangus - ₱180\nGalunggong 160.50\nTulingan 150-160"}
                  onChange={(e) => { setPasteText(e.target.value); setCheck(null); setDone(null); setSkipped(new Set()); }} />
                <small className="field-help">One fish per line with its price. A range like 150-160 uses the middle price (₱155). Lines without a price are ignored.</small>
                {pasteText.trim() && (
                  <small className="field-help draft-note-inline">
                    ✓ Saved on this device. It stays here if you open another page, and is cleared after importing.{" "}
                    <button type="button" className="msg-link" onClick={() => { setPasteText(""); setPasteDate(""); setImportName(""); setSkipped(new Set()); setCheck(null); }}>Clear</button>
                  </small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="import-date">Date of these prices</label>
                <input id="import-date" type="date" value={pasteDate || parsed?.foundDate || ""} max={new Date().toLocaleDateString("en-CA")}
                  onChange={(e) => changeSetting(() => setPasteDate(e.target.value))} />
                {!pasteDate && parsed?.foundDate && <small className="field-help">Taken from the list. Change it if needed.</small>}
              </div>
            </>
          )}
          <div className="form-group">
            <label htmlFor="import-municipality">{mode === "file" ? "Municipality (when the file has no Municipality column)" : "Municipality"}</label>
            <select id="import-municipality" value={defaultMunicipality} onChange={(e) => changeSetting(() => setDefaultMunicipality(e.target.value))}>
              <option value="">{mode === "file" ? "Use the file's Municipality column" : "Choose the municipality…"}</option>
              {municipalities.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          {defaultMunicipality && (
            <div className="form-group">
              <label htmlFor="import-market">Market</label>
              <select id="import-market" value={marketId} onChange={(e) => changeSetting(() => setMarketId(e.target.value))}>
                {!marketsHere.length && <option value="">No markets listed (add them in Municipality &amp; Market)</option>}
                {marketsHere.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <small className="field-help">Each market has its own prices. A file with a <code>Market</code> column uses that instead.</small>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="import-name">Name this import <span className="optional">(optional)</span></label>
            <input id="import-name" maxLength={200} value={importName} placeholder={sourceName || "e.g. DVMF printout – October 6, 2026"}
              onChange={(e) => setImportName(e.target.value)} />
            <small className="field-help">Shown in Recent Imports so you can find (or undo) it later.</small>
          </div>
          <div className="form-group">
            <label htmlFor="import-source">Source</label>
            <input id="import-source" maxLength={150} value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          {mode === "file" && <div className="info-box">
            <strong>Accepted layouts</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>One row per price: <code>Date, Fish, Municipality, Price</code> (also <code>species</code>, <code>price_per_kg_php</code> and similar names)</li>
              <li>One column per fish: <code>Date, Bangus, Galunggong, …</code> (choose the municipality above, or add a Municipality column)</li>
            </ul>
            Fish and municipality names must match the ones in AquaTimbang. Blank cells are skipped. Prices already recorded for the same fish, municipality and day are kept and not overwritten.
          </div>}
        </div>

        <div className="config-card">
          <div className="config-header">
            <div className="config-icon green">✔</div>
            <div><h3>2. Check, then import</h3><p>Nothing is saved until you click Import</p></div>
          </div>

          {!parsed && <div className="info-box">{mode === "file" ? "Choose a file to see what will be imported." : "Paste a price list to see what will be imported."}</div>}

          {parsed && parsed.problems.length > 0 && (
            <div className="warn-box" role="alert">{parsed.problems.map((p) => <div key={p}>{p}</div>)}</div>
          )}

          {parsed && !parsed.problems.length && (
            <>
              <div className="profile-grid">
                <div className="profile-field"><span>{mode === "file" ? "File" : "From"}</span><strong>{sourceName}</strong></div>
                <div className="profile-field"><span>Prices found</span><strong>{isList && skipped.size ? `${rowsToImport.length} of ${parsed.rows.length}` : parsed.rows.length.toLocaleString()}</strong></div>
                <div className="profile-field"><span>Layout</span><strong>{parsed.layout === "list" ? "Price list (one date)" : parsed.layout === "long" ? "One row per price" : `One column per fish (${parsed.fishColumns.length})`}</strong></div>
                {isList && parsed.rows[0] && <div className="profile-field"><span>Date of these prices</span><strong>{new Date(`${parsed.rows[0].date}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</strong></div>}
                {isList && parsed.rows[0]?.municipality && <div className="profile-field"><span>Municipality</span><strong>{parsed.rows[0].municipality}</strong></div>}
                {parsed.layout !== "list" && <div className="profile-field">
                  <span>Dates like 03/04/2024 mean</span>
                  <select value={parsed.dayFirst ? "dmy" : "mdy"} onChange={(e) => changeSetting(() => setDayFirst(e.target.value === "dmy"))}>
                    <option value="mdy">March 4 (month/day/year)</option>
                    <option value="dmy">3 April (day/month/year)</option>
                  </select>
                </div>}
              </div>

              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <PagedTable className="inner-table">
                  <thead><tr>{isList && <th>IMPORT</th>}<th>ROW</th><th>DATE</th><th>FISH</th><th>MUNICIPALITY</th><th>PRICE</th></tr></thead>
                  <tbody>
                    {(isList ? parsed.rows : parsed.rows.slice(0, 8)).map((r, i) => isList ? (
                      <tr key={i} className={skipped.has(r.row) ? "import-skipped" : ""}>
                        <td><input type="checkbox" checked={!skipped.has(r.row)} onChange={() => toggleSkip(r.row)} aria-label={`Import ${r.fish}`} /></td>
                        <td>{r.row}</td><td>{r.date}</td><td>{r.fish}</td><td>{r.municipality || "—"}</td>
                        <td>{r.price}{r.range ? <small className="muted-text"> (middle of {r.range})</small> : null}</td>
                      </tr>
                    ) : (
                      <tr key={i}><td>{r.row}</td><td>{r.date}</td><td>{r.fish}</td><td>{r.municipality || "—"}</td><td>{r.price}{r.range ? <small className="muted-text"> (middle of {r.range})</small> : null}</td></tr>
                    ))}
                  </tbody>
                </PagedTable>
                {isList
                  ? <p className="chart-note">Untick anything that is not a fish you track (for example shellfish or squid) and it will not be imported.</p>
                  : parsed.rows.length > 8 && <p className="chart-note">First 8 of {parsed.rows.length.toLocaleString()} prices.</p>}
              </div>

              {busy && (
                <div className="info-box">
                  {busy === "check" ? "Checking" : "Importing"}… {progress.toLocaleString()} / {rowsToImport.length.toLocaleString()}
                  <div style={{ height: 6, background: "#e4e7ec", borderRadius: 4, marginTop: 6 }}>
                    <div style={{ height: 6, width: `${(progress / Math.max(1, rowsToImport.length)) * 100}%`, background: "#0e7c86", borderRadius: 4 }} />
                  </div>
                </div>
              )}

              {check && (
                <div className={check.error_count ? "warn-box" : "info-box"} style={{ marginTop: 12 }}>
                  <strong>{check.ready.toLocaleString()} prices ready to import</strong>
                  {check.first_date && <> ({check.first_date} to {check.last_date})</>}.
                  {check.already_recorded > 0 && <> {check.already_recorded.toLocaleString()} already recorded (will be skipped).</>}
                  {check.error_count > 0 && <> {check.error_count.toLocaleString()} rows have problems and will be skipped.</>}
                  {check.new_fish.length > 0 && (
                    <p style={{ margin: "6px 0 0" }}>
                      🐟 <strong>{check.new_fish.length} new fish will be added</strong> to Fish Species: {check.new_fish.join(", ")}.
                    </p>
                  )}
                  {check.matched_names?.length > 0 && (
                    <div style={{ margin: "6px 0 0" }}>
                      🔤 <strong>{check.matched_names.length} name{check.matched_names.length === 1 ? " was" : "s were"} read as another spelling</strong> of a fish already in the list:
                      <ul className="import-matched">
                        {check.matched_names.map((m) => <li key={m.from}>"{m.from}" → <strong>{m.fish}</strong></li>)}
                      </ul>
                      <small>If one of these is really a different fish, untick it, then add it in Fish Species first.</small>
                    </div>
                  )}
                </div>
              )}

              {check?.errors.length > 0 && (
                <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8 }}>
                  <PagedTable className="inner-table">
                    <thead><tr><th>ROW</th><th>PROBLEM</th></tr></thead>
                    <tbody>
                      {check.errors.slice(0, 200).map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>)}
                    </tbody>
                  </PagedTable>
                  {check.error_count > 200 && <p className="chart-note">Showing 200 of {check.error_count.toLocaleString()} problems.</p>}
                </div>
              )}

              <fieldset className="import-mode">
                <legend>After importing, the prices should be</legend>
                <label>
                  <input type="radio" name="import-mode" checked={!sendToReview} onChange={() => setSendToReview(false)} />
                  <span><strong>Published right away</strong><small>For past official records (e.g. DVFM history) that were already checked.</small></span>
                </label>
                <label>
                  <input type="radio" name="import-mode" checked={sendToReview} onChange={() => setSendToReview(true)} />
                  <span><strong>Sent to Review &amp; Publish</strong><small>For new or unchecked data: an officer approves them before vendors see them.</small></span>
                </label>
              </fieldset>

              <div className="button-row" style={{ marginTop: 14 }}>
                <button className="secondary-btn" onClick={() => run(true)} disabled={Boolean(busy)}>{mode === "file" ? "Check File" : "Check List"}</button>
                <button className="primary-btn" onClick={() => run(false)} disabled={Boolean(busy) || !check || check.ready === 0}>
                  {check ? `Import ${check.ready.toLocaleString()} Prices` : "Import"}
                </button>
              </div>
            </>
          )}

          {done && (
            <div className="info-box" style={{ marginTop: 12 }} role="status">
              ✔ <strong>{done.imported.toLocaleString()} prices imported</strong>
              {done.first_date && <> ({done.first_date} to {done.last_date})</>}.{" "}
              {sendToReview ? "They are waiting in Review & Publish." : "They now appear in Price Trends, Reports and the forecasts."}
              {" "}Wrong file? Undo it under Recent Imports below.
              {done.already_recorded > 0 && <> {done.already_recorded.toLocaleString()} were already recorded and kept.</>}
              {done.error_count > 0 && <> {done.error_count.toLocaleString()} rows with problems were skipped.</>}
              {done.new_fish?.length > 0 && <> 🐟 Added {done.new_fish.length} new fish to Fish Species: {done.new_fish.join(", ")}. Add their photos there.</>}
            </div>
          )}
        </div>
      </div>

      <RecentImports reloadKey={historyKey} notify={notify} onUndone={onImported} />
    </>
  );
}

// Past imports with an Undo button for a wrong file.
function RecentImports({ reloadKey, notify, onUndone }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/prices/import-batches/"), { headers: authHeaders() })
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.message || "Could not load past imports."); return d; })
      .then((d) => { if (!cancelled) { setRows(d); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [reloadKey, refresh]);

  const undo = async (batch) => {
    setBusy(true);
    try {
      const response = await fetch(apiUrl(`/prices/import-batches/${batch.id}/undo/`), { method: "POST", headers: authHeaders() });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Could not undo the import.");
      notify(data.message);
      setConfirming(null);
      setRefresh((k) => k + 1);
      onUndone?.();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const when = (iso) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-header">
        <div>
          <h3>Recent Imports</h3>
          <p>Imported a wrong file? Undo import removes every price from it, or open Show fish to remove just one fish. Each import and undo is kept in the Audit Log.</p>
        </div>
      </div>
      {error && <div className="warn-box" style={{ margin: "0 18px 18px" }}>{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <PagedTable>
          <thead><tr><th>IMPORTED</th><th>FILE</th><th>DATES</th><th>PRICES</th><th>STATUS</th><th>ACTION</th></tr></thead>
          <tbody>
            {rows === null && !error && <tr><td colSpan="6" className="empty-row">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan="6" className="empty-row">No imports yet.</td></tr>}
            {rows?.map((b) => (
              <React.Fragment key={b.id}>
              <tr>
                <td>{when(b.created_at)}<small style={{ display: "block", color: "#64748b" }}>by {b.imported_by}</small></td>
                <td><strong>{b.file_name || "—"}</strong><small style={{ display: "block", color: "#64748b" }}>{b.source}</small></td>
                <td>{b.first_date ? `${b.first_date} to ${b.last_date}` : "—"}</td>
                <td>{b.undone_at ? b.record_count.toLocaleString() : `${b.remaining.toLocaleString()} of ${b.record_count.toLocaleString()}`}</td>
                <td>
                  {b.undone_at
                    ? <span className="badge inactive" title={`Undone by ${b.undone_by} on ${when(b.undone_at)}`}>Undone</span>
                    : <span className={`badge ${b.sent_to_review ? "pending" : "success"}`}>{b.sent_to_review ? "Sent to review" : "Published"}</span>}
                </td>
                <td>
                  {b.undone_at ? <small style={{ color: "#64748b" }}>by {b.undone_by}</small>
                    : confirming === b.id ? (
                      <div className="undo-confirm">
                        <span>Remove {b.remaining.toLocaleString()} prices?</span>
                        <button className="secondary-btn" disabled={busy} onClick={() => setConfirming(null)}>Keep</button>
                        <button className="reject" disabled={busy} onClick={() => undo(b)}>{busy ? "Undoing…" : "Yes, undo"}</button>
                      </div>
                    ) : (
                      <div className="undo-buttons">
                        <button className="secondary-btn" onClick={() => setOpenId(openId === b.id ? null : b.id)} aria-expanded={openId === b.id}>
                          {openId === b.id ? "Hide fish" : "Show fish"}
                        </button>
                        <button className="secondary-btn" onClick={() => setConfirming(b.id)}>↶ Undo import</button>
                      </div>
                    )}
                </td>
              </tr>
              {openId === b.id && !b.undone_at && (
                <tr className="import-fish-row">
                  <td colSpan="6">
                    <ImportFishList batch={b} notify={notify} onChanged={() => { setRefresh((k) => k + 1); onUndone?.(); }} />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </PagedTable>
      </div>
    </div>
  );
}

// The fish in one import, each with its own Undo.
function ImportFishList({ batch, notify, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl(`/prices/import-batches/${batch.id}/fish/`), { headers: authHeaders() })
      .then(async (r) => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.message || "Could not load the fish."); return d; })
      .then((d) => { if (!cancelled) { setData(d); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [batch.id, reload]);

  const peso = (n) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const undoFish = async (fish) => {
    const ok = await askConfirm(
      `Remove ${fish.name} from ${batch.file_name || "this import"}?\n\n${fish.prices.toLocaleString()} price${fish.prices === 1 ? "" : "s"} (${fish.first_date} to ${fish.last_date}) will be removed. The other fish in this import stay.`,
      { confirmLabel: `Remove ${fish.name}`, danger: true },
    );
    if (!ok) return;
    setBusyId(fish.id);
    try {
      const response = await fetch(apiUrl(`/prices/import-batches/${batch.id}/undo/`), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ fish_species: fish.id }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || result?.fish_species || "Could not remove this fish.");
      notify(result.message);
      setReload((k) => k + 1);
      onChanged();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <div className="warn-box">{error}</div>;
  if (!data) return <p className="import-fish-muted">Loading the fish in this import…</p>;
  if (data.fish.length === 0) return <p className="import-fish-muted">Nothing from this import is left.</p>;
  return (
    <div className="import-fish">
      <p className="import-fish-muted">
        {data.fish.length} fish in this import{data.municipalities.length ? ` · ${data.municipalities.join(", ")}` : ""}. Remove only the fish that was wrong.
      </p>
      <PagedTable className="inner-table">
        <thead><tr><th>FISH</th><th>PRICES</th><th>DATES</th><th>PRICE RANGE</th><th>ACTION</th></tr></thead>
        <tbody>
          {data.fish.map((fish) => (
            <tr key={fish.id}>
              <td><strong>{fish.name}</strong></td>
              <td>{fish.prices.toLocaleString()}</td>
              <td>{fish.first_date === fish.last_date ? fish.first_date : `${fish.first_date} to ${fish.last_date}`}</td>
              <td>{fish.low === fish.high ? peso(fish.low) : `${peso(fish.low)} – ${peso(fish.high)}`}</td>
              <td>
                <button className="reject" disabled={busyId !== null} onClick={() => undoFish(fish)}>
                  {busyId === fish.id ? "Removing…" : "↶ Undo this fish"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </PagedTable>
    </div>
  );
}
