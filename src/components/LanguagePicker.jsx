import React, { useContext } from "react";
import { LANGUAGES, LanguageSetterContext } from "../i18n/vendor.js";

/** Language dropdown for the login and register pages. */
export default function LanguagePicker({ className = "" }) {
  const setting = useContext(LanguageSetterContext);
  if (!setting) return null;
  return (
    <label className={`lang-picker ${className}`}>
      <span aria-hidden="true">🌐</span>
      <select value={setting.language} onChange={(e) => setting.setLanguage(e.target.value)} aria-label="Language">
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
