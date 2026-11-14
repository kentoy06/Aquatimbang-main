import { useEffect } from "react";
import { lookupPhrase } from "./vendor.js";

/*
 * Shows the LGU Officer and Administrator screens in Filipino or Cebuano
 * without wrapping every label in t(): text on the page that exactly matches
 * a known English phrase is replaced by its translation, and put back when
 * the language returns to English. Text that is not in the phrase list
 * (fish names, prices, user data) is left as it is.
 *
 *   <AutoTranslate language={language} />
 */
const ATTRS = ["placeholder", "title", "aria-label"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

export default function AutoTranslate({ language }) {
  useEffect(() => {
    const root = document.body;
    const english = new Map();      // text node -> its English text
    const translatedAttr = new Map(); // element -> { attr: English }

    const translateText = (node) => {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName) || parent.closest("[data-no-translate]")) return;
      const value = node.nodeValue;
      const known = english.get(node);
      // Our own translation coming back: nothing to do.
      if (known !== undefined && value === swap(known)) return;
      english.set(node, value);
      const next = swap(value);
      if (next !== value) node.nodeValue = next;
    };
    const swap = (text) => {
      const trimmed = text.trim();
      if (!trimmed) return text;
      const out = lookupPhrase(language, trimmed);
      return out && out !== trimmed ? text.replace(trimmed, out) : text;
    };
    const translateAttrs = (el) => {
      if (el.closest("[data-no-translate]")) return;
      for (const attr of ATTRS) {
        if (!el.hasAttribute(attr)) continue;
        const value = el.getAttribute(attr);
        const saved = translatedAttr.get(el) || {};
        if (saved[attr] !== undefined && value === swap(saved[attr])) continue;
        saved[attr] = value; translatedAttr.set(el, saved);
        const next = swap(value);
        if (next !== value) el.setAttribute(attr, next);
      }
    };
    const walk = (start) => {
      if (start.nodeType === Node.TEXT_NODE) { translateText(start); return; }
      if (start.nodeType !== Node.ELEMENT_NODE) return;
      translateAttrs(start);
      const tw = document.createTreeWalker(start, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) translateText(n); else translateAttrs(n);
      }
    };

    if (language !== "en") walk(root);
    const observer = language === "en" ? null : new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") translateText(r.target);
        else if (r.type === "attributes") translateAttrs(r.target);
        else r.addedNodes.forEach(walk);
      }
    });
    observer?.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

    return () => {
      observer?.disconnect();
      // Put the English text back before the next language is applied.
      english.forEach((text, node) => { if (node.isConnected && node.nodeValue !== text) node.nodeValue = text; });
      translatedAttr.forEach((saved, el) => {
        if (!el.isConnected) return;
        for (const [attr, text] of Object.entries(saved)) el.setAttribute(attr, text);
      });
    };
  }, [language]);
  return null;
}
