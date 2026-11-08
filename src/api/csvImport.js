// AquaTimbang - read a price-history spreadsheet saved as CSV.
//
// Two layouts are understood:
//   Long:  one row per price      date, fish, municipality, price
//   Wide:  one column per fish    date, [municipality], Bangus, Galunggong, ...
// A missing municipality column uses the municipality chosen on the page.

const HEADER_NAMES = {
  date: ["date", "petsa", "recorded date", "recorded_date", "day", "petsa sa rekord"],
  fish: ["fish", "species", "fish species", "fish_species", "fish name", "isda", "commodity", "item"],
  municipality: ["municipality", "city", "lgu", "municipality/city", "city/municipality", "munisipyo", "location"],
  price: ["price", "price per kg", "price/kg", "price_per_kg", "price (php)", "price per kilo", "presyo", "amount", "prevailing price"],
};

const clean = (value) => String(value ?? "").replace(/^﻿/, "").trim();
const normal = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

// Split CSV text into rows of cells (handles quotes, commas inside quotes, ; or tab separators).
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((sep) => [sep, firstLine.split(sep).length]);
  const sep = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => clean(c) !== ""));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};
const fullYear = (y) => (y < 100 ? 2000 + y : y);

/**
 * Turn a spreadsheet date into "YYYY-MM-DD", or null when unreadable.
 * Accepts 2024-01-05, 1/5/2024 (month first unless dayFirst), 5-Jan-2024,
 * January 5, 2024 and Excel day numbers such as 45296.
 */
export function parseDate(value, dayFirst = false) {
  const text = clean(value);
  let m;
  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3])];
    return dayFirst ? iso(y, b, a) : iso(y, a, b);
  }
  if ((m = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s,]*(\d{2,4})$/))) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return month ? iso(fullYear(+m[3]), month, +m[1]) : null;
  }
  if ((m = text.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return month ? iso(+m[3], month, +m[2]) : null;
  }
  if (/^\d{5}$/.test(text)) {
    // Excel stores dates as days since 1899-12-30.
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000);
    return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  return null;
}

// Whether slash dates in the file must be day/month (some first number above 12).
export function detectDayFirst(values) {
  return values.some((v) => {
    const m = clean(v).match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/);
    return m && +m[1] > 12;
  });
}

// "price_per_kg_php", "Price (₱)", "PRICE/KG" all read as "price per kg".
const headerKey = (value) => normal(value)
  .replace(/[_\-.]+/g, " ")
  .replace(/[()[\]₱]/g, " ")
  .replace(/\b(php|peso|pesos)\b/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Words that mark a column's meaning when the exact name isn't in HEADER_NAMES.
const HEADER_WORDS = {
  date: /\b(date|petsa|day)\b/,
  fish: /\b(fish|species|isda|commodity)\b/,
  municipality: /\b(municipality|city|lgu|munisipyo|location)\b/,
  price: /\b(price|presyo|amount)\b/,
};

function findColumn(header, kind) {
  const keys = header.map(headerKey);
  const exact = keys.findIndex((k) => HEADER_NAMES[kind].includes(k));
  return exact >= 0 ? exact : keys.findIndex((k) => HEADER_WORDS[kind].test(k));
}

// A column that is clearly not a fish name (never read as one in the wide layout).
const NOT_FISH = /\b(price|presyo|amount|species|fish|isda|market|merkado|unit|note|notes|remarks|source|id|no|stall|weight|kg)\b/;
const cleanPrice = (value) => clean(value).replace(/[₱,]|php/gi, "").trim();

/**
 * Convert the CSV table into import rows: [{ row, date, fish, municipality, price }].
 * `row` is the spreadsheet row number, shown next to any problem.
 */
export function toImportRows(table, { defaultMunicipality = "", dayFirst = null } = {}) {
  if (table.length < 2) return { rows: [], layout: null, problems: ["The file has no data rows."], dayFirst: false };
  const header = table[0].map(clean);
  const body = table.slice(1);
  const dateCol = findColumn(header, "date");
  const fishCol = findColumn(header, "fish");
  const placeCol = findColumn(header, "municipality");
  const priceCol = findColumn(header, "price");
  const problems = [];
  if (dateCol < 0) problems.push(`No date column found. Name one column "Date". Columns found: ${header.join(", ")}`);
  if (placeCol < 0 && !defaultMunicipality) problems.push('No "Municipality" column; choose the municipality on the page.');

  const dayFirstUsed = dayFirst ?? (dateCol >= 0 && detectDayFirst(body.map((r) => r[dateCol])));
  const rows = [];
  const layout = fishCol >= 0 && priceCol >= 0 ? "long" : "wide";
  const fishColumns = layout === "wide"
    ? header.map((name, i) => ({ name, i })).filter(({ name, i }) => name && i !== dateCol && i !== placeCol && !NOT_FISH.test(headerKey(name)))
    : [];
  if (layout === "wide" && !fishColumns.length) problems.push(`No fish columns found. Use "Fish" (or "Species") and "Price" columns, or one column per fish. Columns found: ${header.join(", ")}`);
  if (layout === "wide" && (fishCol >= 0) !== (priceCol >= 0)) {
    problems.push(fishCol >= 0
      ? `Found a fish column ("${header[fishCol]}") but no price column. Name the price column "Price".`
      : `Found a price column ("${header[priceCol]}") but no fish column. Name the fish column "Fish".`);
  }
  if (problems.length) return { rows: [], layout, problems, dayFirst: dayFirstUsed, fishColumns: [] };

  body.forEach((cells, index) => {
    const rowNumber = index + 2;
    const rawDate = clean(cells[dateCol]);
    const date = parseDate(rawDate, dayFirstUsed) || rawDate;
    const municipality = placeCol >= 0 ? clean(cells[placeCol]) || defaultMunicipality : defaultMunicipality;
    if (layout === "long") {
      rows.push({ row: rowNumber, date, fish: clean(cells[fishCol]), municipality, price: cleanPrice(cells[priceCol]) });
    } else {
      fishColumns.forEach(({ name, i }) => {
        const price = cleanPrice(cells[i]);
        // Blank or "-" cells mean no price that day.
        if (price && price !== "-") rows.push({ row: rowNumber, date, fish: name, municipality, price });
      });
    }
  });
  return { rows, layout, problems, dayFirst: dayFirstUsed, fishColumns: fishColumns.map((f) => f.name) };
}

export const TEMPLATE_CSV =
  "Date,Fish,Municipality,Price\r\n2024-01-05,Bangus,Cebu City,180.00\r\n2024-01-05,Galunggong,Cebu City,160.50\r\n2024-01-06,Bangus,Mandaue City,178.25\r\n";
