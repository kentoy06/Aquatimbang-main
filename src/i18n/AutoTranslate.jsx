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
    // Only what this component changed is remembered: node -> { english, shown }.
    // Text React writes itself (vendor pages use t()) is never put back, so the
    // page follows the new language at once without a refresh.
    const changedText = new Map();
    const changedAttr = new Map(); // element -> { attr: { english, shown } }

    const swap = (text) => {
      const trimmed = text.trim();
      if (!trimmed) return text;
      const out = lookupPhrase(language, trimmed);
      return out && out !== trimmed ? text.replace(trimmed, out) : text;
    };
    const translateText = (node) => {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName) || parent.closest("[data-no-translate]")) return;
      const value = node.nodeValue;
      const done = changedText.get(node);
      if (done && value === done.shown) return; // our own translation
      const next = swap(value);
      if (next !== value) {
        changedText.set(node, { english: value, shown: next });
        node.nodeValue = next;
      } else {
        changedText.delete(node);
      }
    };
    const translateAttrs = (el) => {
      if (el.closest("[data-no-translate]")) return;
      for (const attr of ATTRS) {
        if (!el.hasAttribute(attr)) continue;
        const value = el.getAttribute(attr);
        const saved = changedAttr.get(el) || {};
        if (saved[attr] && value === saved[attr].shown) continue;
        const next = swap(value);
        if (next !== value) {
          saved[attr] = { english: value, shown: next };
          changedAttr.set(el, saved);
          el.setAttribute(attr, next);
        } else {
          delete saved[attr];
        }
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
      // Put back the English only where our translation is still showing.
      changedText.forEach(({ english, shown }, node) => {
        if (node.isConnected && node.nodeValue === shown) node.nodeValue = english;
      });
      changedAttr.forEach((saved, el) => {
        if (!el.isConnected) return;
        for (const [attr, { english, shown }] of Object.entries(saved)) {
          if (el.getAttribute(attr) === shown) el.setAttribute(attr, english);
        }
      });
    };
  }, [language]);
  return null;
}
