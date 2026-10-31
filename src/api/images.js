// AquaTimbang - photo helpers: shrink phone photos before upload and
// show protected images (profile, stall and fish photos) that need a login.

import { useEffect, useState } from "react";
import { apiUrl, authHeaders } from "./config.js";

export const MAX_IMAGE_MB = 5;
export const MAX_DOCUMENT_MB = 10;

const MAX_SIDE = 1600;

/**
 * Shrink a large JPG/PNG photo to at most 1600 px on its longest side,
 * saved as JPEG. Small photos and PDFs are returned unchanged.
 */
export async function compressImage(file) {
  if (!file || !/^image\/(jpeg|png)$/.test(file.type) || file.size < 800 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Error message when a chosen file is too large or the wrong type, else "".
export function checkUpload(file, { image = false } = {}) {
  if (!file) return "";
  const allowed = image ? /\.(jpe?g|png)$/i : /\.(pdf|jpe?g|png)$/i;
  if (!allowed.test(file.name)) return image ? "Only JPG or PNG photos are allowed." : "Only PDF, JPG or PNG files are allowed.";
  const limit = image ? MAX_IMAGE_MB : MAX_DOCUMENT_MB;
  if (file.size > limit * 1024 * 1024) return `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${limit} MB.`;
  return "";
}

/**
 * Load an image that needs the login token and return a temporary
 * object URL for an <img>, or "" while loading or when there is none.
 */
export function useProtectedImage(path) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!path) return undefined;
    let objectUrl = "";
    let cancelled = false;
    fetch(apiUrl(path), { headers: authHeaders() })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl("");
    };
  }, [path]);
  return url;
}
