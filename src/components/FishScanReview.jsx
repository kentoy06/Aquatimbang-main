import React, { useEffect, useState } from "react";
import { useProtectedImage } from "../api/images.js";
import { deleteScan, downloadScanZip, getScanSummary, listScans, reviewScan } from "../api/fishScans.js";

const TABS = [
  { status: "pending", label: "Waiting for review" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

const when = (iso) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

function ScanCard({ scan, species, onReviewed, onDeleted, notify }) {
  const src = useProtectedImage(scan.image_url);
  const [fishId, setFishId] = useState(String(scan.fish_species));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const relabelled = fishId !== String(scan.fish_species);

  const review = async (status) => {
    setBusy(true);
    try {
      const updated = await reviewScan(scan.id, { status, fishSpecies: fishId });
      notify(status === "approved"
        ? `Approved as ${updated.fish_name}${relabelled ? " (fish name corrected)" : ""}.`
        : "Photo rejected. It won't be used for training.");
      onReviewed(updated);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteScan(scan.id);
      notify("Photo deleted.");
      onDeleted(scan.id);
    } catch (err) {
      notify(err.message);
      setBusy(false);
    }
  };

  return (
    <article className="scan-card">
      <div className="scan-card-img">
        {src ? <img src={src} alt={`Photo labelled ${scan.fish_name}`} /> : <span>Loading…</span>}
      </div>
      <div className="scan-card-body">
        <div className="scan-card-top">
          <strong>{scan.fish_name}</strong>
          <span className={`badge ${scan.status === "approved" ? "success" : scan.status === "rejected" ? "inactive" : "pending"}`}>
            {scan.status === "pending" ? "Waiting" : scan.status === "approved" ? "Approved" : "Rejected"}
          </span>
        </div>
        <small>{scan.uploaded_by_name}{scan.municipality_name ? ` · ${scan.municipality_name}` : ""}</small>
        <small>{when(scan.created_at)}</small>
        {scan.reviewed_by_name && <small>Reviewed by {scan.reviewed_by_name}</small>}

        <label className="scan-relabel">
          <span>Fish in the photo</span>
          <select value={fishId} onChange={(e) => setFishId(e.target.value)} disabled={busy}>
            {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        {confirmDelete ? (
          <div className="scan-actions">
            <button className="secondary-btn" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep</button>
            <button className="reject" onClick={remove} disabled={busy}>Delete photo</button>
          </div>
        ) : (
          <div className="scan-actions">
            {scan.status !== "approved" && <button className="approve" onClick={() => review("approved")} disabled={busy}>✓ Approve</button>}
            {scan.status === "approved" && relabelled && <button className="approve" onClick={() => review("approved")} disabled={busy}>Save fish name</button>}
            {scan.status !== "rejected" && <button className="reject" onClick={() => review("rejected")} disabled={busy}>✕ Reject</button>}
            <button className="secondary-btn" title="Delete photo" aria-label="Delete photo" onClick={() => setConfirmDelete(true)} disabled={busy}>🗑</button>
          </div>
        )}
      </div>
    </article>
  );
}

// LGU Officers and Administrators: review vendor fish photos for the scanner.
export default function FishScanReview({ notify }) {
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("pending");
  const [fishFilter, setFishFilter] = useState("");
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getScanSummary(), listScans({ status: tab, species: fishFilter })])
      .then(([sum, rows]) => { if (!cancelled) { setSummary(sum); setScans(rows); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, fishFilter, reloadKey]);

  const species = summary?.species || [];
  const target = summary?.target || 30;
  const withPhotos = species.filter((s) => s.approved + s.pending > 0);
  const ready = species.filter((s) => s.ready).length;
  const totalApproved = species.reduce((a, s) => a + s.approved, 0);
  const totalPending = species.reduce((a, s) => a + s.pending, 0);

  // A reviewed photo leaves the current tab; counts are refreshed.
  const afterChange = (id) => {
    setScans((rows) => rows.filter((r) => r.id !== id));
    getScanSummary().then(setSummary).catch(() => {});
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadScanZip();
      notify("Approved photos downloaded.");
    } catch (err) {
      notify(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Fish Scanner Photos</h2>
          <p>Vendors' labelled fish photos. Approved photos will train the AquaTimbang fish scanner.</p>
        </div>
        <button className="primary-btn" onClick={download} disabled={downloading || totalApproved === 0}>
          {downloading ? "Preparing…" : `↓ Download ${totalApproved} approved photo${totalApproved === 1 ? "" : "s"} (ZIP)`}
        </button>
      </div>

      <div className="info-box" style={{ marginBottom: 16 }}>
        <strong>Phase 1: collecting photos.</strong> Check that each photo shows the fish it is labelled as, and fix the
        name when it's wrong. A fish is ready for training at <strong>{target} approved photos</strong>. The ZIP has one
        folder per fish, which is the format Google Teachable Machine uses.
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon orange">⏳</div><div><span>Waiting for review</span><h2>{totalPending}</h2></div></div>
        <div className="stat-card"><div className="stat-icon green">✓</div><div><span>Approved photos</span><h2>{totalApproved}</h2></div></div>
        <div className="stat-card"><div className="stat-icon blue">🐟</div><div><span>Fish with photos</span><h2>{withPhotos.length}</h2></div></div>
        <div className="stat-card"><div className="stat-icon purple">🎯</div><div><span>Ready for training</span><h2>{ready} of {species.length}</h2></div></div>
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
        <div className="panel-header" style={{ padding: 0, marginBottom: 12 }}><div><h3>Progress per fish</h3><p>Approved photos out of {target}; waiting photos in light colour</p></div></div>
        {withPhotos.length === 0 ? (
          <p className="scan-muted">No photos yet. Vendors add them with <strong>📷 Scan fish</strong> in the Fair Price Calculator.</p>
        ) : (
          <div className="scan-progress">
            {withPhotos.map((s) => (
              <button type="button" key={s.id} className={`scan-progress-row${fishFilter === String(s.id) ? " on" : ""}`} onClick={() => setFishFilter(fishFilter === String(s.id) ? "" : String(s.id))}>
                <span className="scan-progress-name">{s.name}{s.ready && " ✓"}</span>
                <span className="scan-meter-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (s.approved / target) * 100)}%` }} />
                  <span className="pending" style={{ width: `${Math.min(100 - Math.min(100, (s.approved / target) * 100), (s.pending / target) * 100)}%` }} />
                </span>
                <span className="scan-progress-num">{s.approved}/{target}{s.pending ? ` · ${s.pending} waiting` : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scan-toolbar">
        <div className="tabs" role="tablist">
          {TABS.map((tb) => (
            <button key={tb.status} role="tab" aria-selected={tab === tb.status} className={tab === tb.status ? "tab active-tab" : "tab"} onClick={() => { setLoading(true); setTab(tb.status); }}>
              {tb.label}
            </button>
          ))}
        </div>
        <select value={fishFilter} onChange={(e) => { setLoading(true); setFishFilter(e.target.value); }} aria-label="Filter by fish">
          <option value="">All fish</option>
          {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {error && <div className="warn-box" role="alert">{error}</div>}
      {loading ? (
        <div className="panel" style={{ padding: 20 }}>Loading photos…</div>
      ) : scans.length === 0 ? (
        <div className="panel" style={{ padding: 20 }}>No {TABS.find((x) => x.status === tab).label.toLowerCase()} photos{fishFilter ? " for this fish" : ""}.</div>
      ) : (
        <div className="scan-grid">
          {scans.map((scan) => (
            <ScanCard
              key={scan.id}
              scan={scan}
              species={species}
              notify={notify}
              onReviewed={(updated) => (updated.status === tab ? setScans((rows) => rows.map((r) => (r.id === updated.id ? updated : r))) : afterChange(updated.id))}
              onDeleted={afterChange}
            />
          ))}
        </div>
      )}
      <button className="secondary-btn" style={{ marginTop: 14 }} onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }}>↻ Refresh</button>
    </>
  );
}
