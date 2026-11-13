import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, authHeaders } from "../api/config.js";

const key = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Same rule as the server: "Andohaw" and "Anduhaw", "Lagao" and "Lagaw"
// read the same (ao = aw, o = u, e = i, repeated letters count once).
export const spellingKey = (text) => key(text).replace(/ao/g, "aw").replace(/o/g, "u").replace(/e/g, "i").replace(/(.)\1+/g, "$1");

// "Andohaw, Andoaw" -> ["Andohaw", "Andoaw"]
export const splitNames = (text) => String(text || "").split(/[,;\n]/).map((n) => n.trim()).filter(Boolean);

/** Other names or spellings of a fish, separated by commas. */
export function OtherNamesField({ id, value, onChange }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>Other names or spellings <span className="optional">(optional)</span></label>
      <input id={id} value={value} maxLength={400} placeholder="e.g. Andohaw, Indian mackerel" onChange={(e) => onChange(e.target.value)} />
      <small className="field-help">Separate with commas. Imports that use these names are matched to this fish.</small>
    </div>
  );
}

let cached = null; // shown at once next time; refreshed every time the form opens

/**
 * Common Name field for adding a fish: type a name, or click the field to
 * pick from fish commonly sold in Cebu markets. Picking one also passes its
 * scientific name. Fish already in the list are shown too, marked, so a duplicate is easy to spot.
 *
 * currentName  when editing: the fish's saved name (not reported as a duplicate)
 *
 *   <FishNameField id="…" value={name} onChange={setName}
 *     onPick={(fish) => setScientific(fish.scientific_name)} />
 */
export default function FishNameField({ id, value, onChange, onPick, autoFocus, required, placeholder, currentName }) {
  const [known, setKnown] = useState(cached || []);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    fetch(apiUrl("/fish-species/known-names/"), { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { cached = Array.isArray(rows) ? rows : []; setKnown(cached); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const typed = key(value);
  const shown = useMemo(() => {
    const matches = typed ? known.filter((f) => key(f.name).includes(typed)) : known;
    // Fish not in the list yet come first.
    return [...matches].sort((a, b) => Number(a.registered) - Number(b.registered) || a.name.localeCompare(b.name));
  }, [known, typed]);

  useEffect(() => { setActive(-1); }, [typed]);
  useEffect(() => {
    if (active < 0 || !list.current) return;
    list.current.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (fish) => {
    onChange(fish.name);
    onPick?.(fish);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  };

  // When editing, the fish's own name is not a duplicate.
  const exact = typed !== key(currentName) && known.find((f) => key(f.name) === typed && f.registered);
  // Another spelling of a fish already saved ("Andohaw" for "Anduhaw").
  const sameSpelling = !exact && typed.length >= 3 && spellingKey(value) !== spellingKey(currentName)
    && known.find((f) => f.registered && [f.name, ...(f.aliases || [])].some((n) => spellingKey(n) === spellingKey(value)));

  return (
    <div className="fish-name-field" ref={box}>
      <div className="fish-name-input">
        <input id={id} value={value} autoFocus={autoFocus} required={required} maxLength={100} autoComplete="off"
          placeholder={placeholder || "Type a name or pick from the list"}
          role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }} onKeyDown={onKeyDown} />
        <button type="button" className="fish-name-toggle" tabIndex={-1} aria-label="Show fish names"
          onClick={() => setOpen((o) => !o)}>▾</button>
      </div>
      {open && shown.length > 0 && (
        <ul className="fish-name-list" id={`${id}-list`} role="listbox" ref={list}>
          {shown.map((fish, i) => (
            <li key={fish.name} role="option" aria-selected={i === active}
              className={`${i === active ? "active" : ""}${fish.registered ? " registered" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(fish); }} onMouseEnter={() => setActive(i)}>
              <span><strong>{fish.name}</strong><em>{fish.scientific_name}</em></span>
              {fish.registered && <small>Already in the list</small>}
            </li>
          ))}
        </ul>
      )}
      {exact && <p className="field-hint warn">{exact.name} is already in the fish list.</p>}
      {sameSpelling && (
        <p className="field-hint warn">
          "{value.trim()}" looks like another spelling of <strong>{sameSpelling.name}</strong>, which is already in the list.
          Edit {sameSpelling.name} and add this spelling under Other names instead.
        </p>
      )}
    </div>
  );
}
