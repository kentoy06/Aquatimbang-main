// AquaTimbang - report export engine (CSV/PDF) for the Reports module.
// Every export is also recorded in the report log (Table 22).

import { apiUrl, authHeaders } from "./config.js";

// The PDF's built-in fonts have no peso sign, so prices are written "PHP".
const pdfText = (value) => String(value ?? "").replaceAll("₱", "PHP ");

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generatedBy() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "";
    return user.role ? `${name} (${user.role})` : name;
  } catch {
    return "";
  }
}

async function buildPdf({ title, subtitle, columns, rows, filename }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: columns.length > 5 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generated = new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(14, 124, 134);
  doc.text("AquaTimbang", 40, 46);
  doc.setFontSize(13);
  doc.setTextColor(29, 41, 57);
  doc.text(pdfText(title), 40, 66);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 112, 133);
  const lines = [subtitle, `Generated ${generated}${generatedBy() ? ` by ${generatedBy()}` : ""}`, `${rows.length} row${rows.length === 1 ? "" : "s"}`]
    .filter(Boolean)
    .map(pdfText);
  doc.text(lines, 40, 82);

  autoTable(doc, {
    startY: 82 + lines.length * 11 + 8,
    head: [columns.map(pdfText)],
    body: rows.map((row) => row.map(pdfText)),
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [14, 124, 134], textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(152, 162, 179);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
      doc.text("AquaTimbang · Fish Price Transparency System", 40, doc.internal.pageSize.getHeight() - 20);
    },
  });
  doc.save(filename);
}

function buildCsv({ columns, rows, filename }) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = "﻿" + [columns, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/**
 * Export a report and record it in the report log.
 *
 * format:     "PDF" or "CSV"
 * reportType: e.g. "Price History Report"
 * parameters: filters used, e.g. { species: "Galunggong" }
 * columns:    header labels; rows: arrays of cell values
 */
export async function exportReport({ format, reportType, parameters = {}, subtitle = "", columns, rows }) {
  const stamp = new Date().toLocaleDateString("en-CA");
  const base = `${reportType.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${stamp}`;
  if (format === "PDF") {
    await buildPdf({ title: reportType, subtitle, columns, rows, filename: `${base}.pdf` });
  } else {
    buildCsv({ columns, rows, filename: `${base}.csv` });
  }

  // Record the export; a failure here does not undo the download.
  try {
    await fetch(apiUrl("/reports/"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ report_type: reportType, format, parameters, row_count: rows.length }),
    });
  } catch {
    // Offline: the file was still produced.
  }
}

// Describe filters for the report subtitle, e.g. "Species: Galunggong · Status: Published".
export function describeFilters(parameters) {
  return Object.entries(parameters)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(([key, value]) => `${key.charAt(0).toUpperCase()}${key.slice(1).replaceAll("_", " ")}: ${value}`)
    .join(" · ");
}
