import React, { useEffect, useRef, useState } from "react";
import "./CameraCapture.css";

const canUseCamera = () => Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Live camera window: shows the camera, takes a picture, lets the user
 * retake it or use it. `facing` is "user" (front camera) or "environment" (back).
 */
export function CameraModal({ facing = "user", onCapture, onClose, title = "Take a Photo" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [mode, setMode] = useState(facing);
  const [error, setError] = useState("");
  const [shot, setShot] = useState(null); // { url, file }

  useEffect(() => {
    let cancelled = false;
    setError("");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.name === "NotAllowedError"
            ? "Camera permission was blocked. Allow the camera in your browser, or choose a photo from your album instead."
            : "No camera was found on this device. Choose a photo from your album instead.");
        }
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [mode]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (mode === "user") {
      // Front cameras show a mirror image; save it the right way round.
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setShot({ url: URL.createObjectURL(blob), file });
    }, "image/jpeg", 0.9);
  };

  return (
    <div className="modal-backdrop camera-backdrop" onClick={onClose}>
      <div className="modal camera-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="camera-title">
        <div className="modal-head">
          <h3 id="camera-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error ? (
          <div className="warn-box" role="alert">{error}</div>
        ) : (
          <div className="camera-view">
            {shot
              ? <img src={shot.url} alt="Captured" />
              : <video ref={videoRef} autoPlay playsInline muted className={mode === "user" ? "mirrored" : ""} />}
          </div>
        )}

        <div className="camera-actions">
          {!error && !shot && (
            <>
              <button className="secondary-btn" onClick={() => setMode((m) => (m === "user" ? "environment" : "user"))}>⟲ Switch Camera</button>
              <button className="primary-btn camera-shutter" onClick={capture}>● Capture</button>
            </>
          )}
          {shot && (
            <>
              <button className="secondary-btn" onClick={() => setShot(null)}>↺ Retake</button>
              <button className="primary-btn" onClick={() => onCapture(shot.file)}>✔ Use Photo</button>
            </>
          )}
          {error && <button className="secondary-btn" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

/**
 * Two buttons: "Take Photo" (camera) and "Choose from Album" (gallery / files).
 * Calls onFile(file) with the chosen or captured photo.
 */
export function PhotoSourceButtons({ onFile, facing = "user", disabled = false, takeLabel = "Take Photo", albumLabel = "Choose from Album", cameraTitle }) {
  const [open, setOpen] = useState(false);
  const albumRef = useRef(null);
  const phoneCameraRef = useRef(null);

  const takePhoto = () => {
    // Live camera when the browser supports it; otherwise the phone's camera app.
    if (canUseCamera()) setOpen(true);
    else phoneCameraRef.current?.click();
  };

  const picked = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  };

  return (
    <div className="photo-source-buttons">
      <button type="button" className="primary-btn" onClick={takePhoto} disabled={disabled}>📷 {takeLabel}</button>
      <button type="button" className="secondary-btn" onClick={() => albumRef.current?.click()} disabled={disabled}>🖼 {albumLabel}</button>
      <input ref={albumRef} type="file" accept="image/jpeg,image/png" hidden onChange={picked} />
      <input ref={phoneCameraRef} type="file" accept="image/*" capture={facing} hidden onChange={picked} />
      {open && (
        <CameraModal
          facing={facing}
          title={cameraTitle || takeLabel}
          onClose={() => setOpen(false)}
          onCapture={(file) => { setOpen(false); onFile(file); }}
        />
      )}
    </div>
  );
}

// A single "Take Photo" button (used next to an upload box).
export function TakePhotoButton({ onFile, facing = "user", label = "Take a photo with your camera", cameraTitle, className = "secondary-btn" }) {
  const [open, setOpen] = useState(false);
  const phoneCameraRef = useRef(null);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => (canUseCamera() ? setOpen(true) : phoneCameraRef.current?.click())}
      >
        📷 {label}
      </button>
      <input
        ref={phoneCameraRef}
        type="file"
        accept="image/*"
        capture={facing}
        hidden
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onFile(file); }}
      />
      {open && (
        <CameraModal
          facing={facing}
          title={cameraTitle || label}
          onClose={() => setOpen(false)}
          onCapture={(file) => { setOpen(false); onFile(file); }}
        />
      )}
    </>
  );
}
