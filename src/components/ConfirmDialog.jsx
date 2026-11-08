import React, { useEffect, useRef, useState } from "react";

// The mounted <ConfirmHost /> registers itself here.
let show = null;

// Verbs that start a question, used for the button label and the colour.
const ACTIONS = [
  ["delete", "Delete", true], ["deactivate", "Deactivate", true], ["remove", "Remove", true],
  ["reject", "Reject", true], ["withdraw", "Withdraw", true],
  ["submit", "Submit", false], ["adopt", "Adopt", false], ["approve", "Approve", false],
];

function guess(message) {
  const words = String(message).trim().toLowerCase().replace(/^permanently\s+/, "").split(/\s+/);
  const verb = ACTIONS.find(([word]) => words[0] === word) || ACTIONS.find(([word]) => /approve anyway/.test(message.toLowerCase()) && word === "approve");
  return verb ? { confirmLabel: verb[1], danger: verb[2] } : { confirmLabel: "Yes", danger: false };
}

/**
 * Ask a yes/no question in an AquaTimbang pop-up instead of the browser's
 * own confirm box. Resolves to true (confirmed) or false (cancelled).
 *
 *   if (!(await askConfirm("Delete this record?"))) return;
 */
export function askConfirm(message, options = {}) {
  if (!show) return Promise.resolve(window.confirm(message));
  const guessed = guess(message);
  return new Promise((resolve) => {
    show({
      message,
      title: options.title || (guessed.danger ? "Please confirm" : "Are you sure?"),
      confirmLabel: options.confirmLabel || guessed.confirmLabel,
      cancelLabel: options.cancelLabel || "Cancel",
      danger: options.danger ?? guessed.danger,
      resolve,
    });
  });
}

/**
 * Ask for a typed answer in an AquaTimbang pop-up instead of the browser's
 * prompt box. Resolves to the text, or null when cancelled (like prompt).
 * Questions about a price get a number box; others get a text area.
 */
export function askText(message, defaultValue = "", options = {}) {
  if (!show) return Promise.resolve(window.prompt(message, defaultValue));
  const numeric = options.numeric ?? /price per kg/i.test(message);
  return new Promise((resolve) => {
    show({
      message,
      input: { defaultValue: defaultValue ?? "", numeric },
      title: options.title || (numeric ? "Enter the price" : "Add a note"),
      confirmLabel: options.confirmLabel || "Save",
      cancelLabel: options.cancelLabel || "Cancel",
      danger: false,
      resolve,
    });
  });
}

// Mount once at the top of the app.
export function ConfirmHost() {
  const [request, setRequest] = useState(null);
  const [text, setText] = useState("");
  const confirmRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    show = setRequest;
    return () => { show = null; };
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    if (request.input) {
      setText(String(request.input.defaultValue));
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select?.(); }, 0);
    } else {
      confirmRef.current?.focus();
    }
    const onKey = (event) => {
      if (event.key === "Escape") { request.resolve(request.input ? null : false); setRequest(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [request]);

  if (!request) return null;
  const answer = (ok) => {
    request.resolve(request.input ? (ok ? text : null) : ok);
    setRequest(null);
  };
  // A blank line in the question separates the question from extra details.
  const [question, ...details] = String(request.message).split(/\n\s*\n/);

  return (
    <div className="confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
      <div className={`confirm-box${request.danger ? " danger" : ""}${request.input ? " with-input" : ""}`} role={request.input ? "dialog" : "alertdialog"} aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-icon" aria-hidden="true">{request.input ? (request.input.numeric ? "₱" : "✎") : request.danger ? "!" : "?"}</div>
        <h3 id="confirm-title">{request.title}</h3>
        <div id="confirm-message" className="confirm-message">
          <p>{question}</p>
          {details.map((d) => <p key={d} className="confirm-detail">{d}</p>)}
        </div>
        {request.input && (
          request.input.numeric ? (
            <div className="confirm-input-unit">
              <span>₱</span>
              <input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={text}
                aria-label={question}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") answer(true); }}
              />
              <span>/ kg</span>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              className="confirm-textarea"
              rows={3}
              maxLength={500}
              value={text}
              aria-label={question}
              onChange={(e) => setText(e.target.value)}
            />
          )
        )}
        <div className="confirm-actions">
          <button type="button" className="secondary-btn" onClick={() => answer(false)}>{request.cancelLabel}</button>
          <button type="button" ref={confirmRef} className={request.danger ? "confirm-danger-btn" : "primary-btn"} onClick={() => answer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
