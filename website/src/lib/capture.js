// Photo capture and processing pipeline: shared by ScanView's main capture
// and FieldCorrectionModal/ThreeDCaptureModal's evidence-photo capture, so
// there's one HEIC check and one decode-error message instead of
// independently-drifting copies.

// Bug fix: this used to create a blob URL and never revoke it — for every
// front/side/back photo and every field-correction evidence photo an
// inspector captures in a session, one more URL stayed pinned in the
// browser (its backing file data unreleasable) until the tab closed. A
// short demo never notices; a full day of field inspections doing dozens
// of scans would. The image is already fully decoded onto the <img>/canvas
// by the time onload/onerror fire, so revoking right there is safe.
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function dataUrlToBytes(dataUrl) {
  // NOTE: deliberately decoded with atob rather than fetch() on the data: URL
  // itself, since fetch() against a data: URL is unreliable in sandboxed
  // contexts.
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function fallbackHex(bytes) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761);
    h2 = Math.imul(h2 ^ bytes[i], 1597334677);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  const hex = h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  return (hex + hex + hex + hex).slice(0, 64);
}

// Bug fix: this used to return a bare hex string, and every report template
// printed "hashed ... using SHA-256" unconditionally — true only when
// window.crypto.subtle was actually available (a secure context: HTTPS or
// localhost). Off that path (plain HTTP, some embedded webviews, or the
// digest call throwing) it silently used the much weaker fallbackHex
// instead, so a filed compliance report could claim a cryptographic
// tamper-evidence guarantee it never had. Returning the algorithm alongside
// the hex lets every caller/report state accurately which one actually ran.
export async function hashDataUrl(dataUrl) {
  const bytes = dataUrlToBytes(dataUrl);
  try {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return { hex, algorithm: "SHA-256" };
    }
  } catch (e) {
    /* fall through to non-crypto fallback below */
  }
  return { hex: fallbackHex(bytes), algorithm: "non-cryptographic 64-bit fallback (SHA-256 unavailable)" };
}

export async function processImageFile(file) {
  const img = await loadImage(file);
  const maxDim = 1024;
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const { hex: hashHex, algorithm: hashAlgorithm } = await hashDataUrl(dataUrl);
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg", hashHex, hashAlgorithm };
}

// Shared by every "pick a photo" flow that actually uses the file (the main
// scan capture, and the evidence-photo capture for corrections): one HEIC
// check and one error message instead of independently-drifting copies.
// Throws an Error with a user-facing message on failure; callers just catch
// and display err.message.
export async function captureEvidencePhoto(file) {
  const name = (file.name || "").toLowerCase();
  if (file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif")) {
    throw new Error("This looks like a HEIC/HEIF photo, which browsers can't preview directly. Try a JPEG or PNG instead.");
  }
  try {
    return await processImageFile(file);
  } catch (e) {
    throw new Error("Couldn't decode that image file. It may be corrupted or in an unsupported format; try a JPEG or PNG.");
  }
}
