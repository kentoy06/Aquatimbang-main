import React, { useEffect, useRef, useState } from "react";
import { FishThumb } from "./FishPhoto.jsx";

/**
 * Dropdown for choosing several fish: a button that opens a searchable
 * checklist, with the chosen fish shown as removable chips below.
 * fish: [{ id, name, ... }], selected: [id], onToggle(id)
 */
export default function FishMultiSelect({ fish, selected, onToggle, id = "fish-multi" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chosen = fish.filter((f) => selected.includes(f.id));
  const visible = fish.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));
  const label = chosen.length === 0
    ? "Select the fish you sell"
    : `${chosen.length} selected: ${chosen.map((f) => f.name).join(", ")}`;

  return (
    <div className="fish-multi" ref={boxRef}>
      <button
        type="button"
        id={id}
        className={`fish-multi-button${chosen.length ? "" : " placeholder"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="fish-multi-caret">▾</span>
      </button>

      {open && (
        <div className="fish-multi-panel">
          <input
            ref={searchRef}
            type="search"
            className="fish-multi-search"
            placeholder="Search fish…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search fish"
          />
          <ul role="listbox" aria-multiselectable="true" aria-label="Fish you sell">
            {visible.length === 0 && <li className="fish-multi-empty">No fish named "{query}".</li>}
            {visible.map((f) => {
              const on = selected.includes(f.id);
              return (
                <li key={f.id} role="option" aria-selected={on}>
                  <label className={on ? "on" : ""}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(f.id)} />
                    <FishThumb fish={f} size={28} />
                    <span>{f.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="fish-multi-foot">
            <small>{chosen.length} selected</small>
            <button type="button" className="primary-btn" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="fish-multi-chips">
          {chosen.map((f) => (
            <span key={f.id} className="fish-multi-chip">
              {f.name}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onToggle(f.id)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
