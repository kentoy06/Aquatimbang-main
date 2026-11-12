import React, { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * A table in the shared AquaTimbang layout: the body scrolls under a header
 * that stays in place, and a footer shows "Showing 1–10 of 46" with
 * Previous / Page 1 of 5 / Next.
 *
 * Use it exactly like <table>:
 *
 *   <PagedTable className="inner-table"><thead>…</thead><tbody>…</tbody></PagedTable>
 *
 * Paging works on the rendered rows, so the code that builds the rows does
 * not change. A row that holds only one wide cell right after a normal row
 * (a details row) stays on the same page as that row. A table whose only
 * row is a message ("Loading…", "No records") shows no footer.
 *
 * pageSize  rows per page (default 10)
 * paged     false keeps the frame and header but shows every row
 */
// Words that stay in capitals when a header is written in sentence case.
const KEEP_CAPS = new Set(["LGU", "MAPE", "RMSE", "ID", "PDF", "CSV", "BFAR", "DVMF", "SARIMAX", "DOE", "PH", "KG/L"]);

// "PRICE / KG" -> "Price / kg", "ADOPTED BY LGU" -> "Adopted by LGU".
function sentenceCaseHeaders(table) {
  const head = table?.tHead;
  if (!head) return;
  for (const th of Array.from(head.querySelectorAll("th"))) {
    const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
    let first = true;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue;
      if (!/[A-Za-z]/.test(text)) continue;
      if (/[a-z]/.test(text)) { first = false; continue; } // already mixed case
      let next = text.replace(/[A-Z][A-Z./]*/g, (word) => (KEEP_CAPS.has(word.replace(/[.]$/, "")) ? word : word.toLowerCase()));
      if (first) next = next.replace(/[a-z]/, (ch) => ch.toUpperCase());
      first = false;
      if (next !== text) node.nodeValue = next;
    }
  }
}

export default function PagedTable({ pageSize = 10, paged = true, children, ...tableProps }) {
  const tableRef = useRef(null);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const lastCount = useRef(0);

  // Group rows: each normal row plus the detail rows that follow it.
  const groups = useCallback(() => {
    const body = tableRef.current?.tBodies?.[0];
    if (!body) return [];
    const result = [];
    for (const row of Array.from(body.rows)) {
      const cells = row.cells;
      const wide = cells.length === 1 && cells[0].colSpan > 1;
      if (wide && result.length) result[result.length - 1].push(row);
      else if (wide) result.push([row, "message"]);
      else result.push([row]);
    }
    return result;
  }, []);

  const apply = useCallback(() => {
    sentenceCaseHeaders(tableRef.current);
    const all = groups();
    const real = all.filter((g) => g[1] !== "message");
    const total = real.length;
    if (total !== lastCount.current) {
      // The list changed (new search or filter): go back to the first page,
      // unless rows were only added at the end (e.g. "load more").
      if (total < lastCount.current || lastCount.current === 0) setPage(1);
      lastCount.current = total;
      setCount(total);
    }
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(page, pages);
    const from = paged ? (current - 1) * pageSize : 0;
    const to = paged ? from + pageSize : Infinity;
    let index = 0;
    for (const group of all) {
      if (group[1] === "message") { group[0].hidden = false; continue; }
      const show = index >= from && index < to;
      group.forEach((row) => { row.hidden = !show; });
      index += 1;
    }
  }, [groups, page, pageSize, paged]);

  useLayoutEffect(() => {
    apply();
    const table = tableRef.current;
    if (!table) return undefined;
    const observer = new MutationObserver(() => apply());
    // New rows, and header text that changes (e.g. another language).
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [apply]);

  const pages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page, pages);
  const first = count ? (paged ? (current - 1) * pageSize + 1 : 1) : 0;
  const last = paged ? Math.min(count, current * pageSize) : count;

  const go = (next) => {
    setPage(next);
    tableRef.current?.closest(".table-frame")?.querySelector(".table-scroll")?.scrollTo({ top: 0 });
  };

  return (
    <div className="table-frame">
      <div className="table-scroll">
        <table ref={tableRef} {...tableProps}>{children}</table>
      </div>
      {count > 0 && (
        <div className="table-footer">
          <span className="table-showing">Showing {first}–{last} of {count}</span>
          {paged && pages > 1 && (
            <div className="table-pager">
              <button type="button" onClick={() => go(current - 1)} disabled={current <= 1}>‹ Previous</button>
              <span>Page {current} of {pages}</span>
              <button type="button" onClick={() => go(current + 1)} disabled={current >= pages}>Next ›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
