/**
 * Live shutter from akshaykumarhudedmani/metriq-ai ScanMetrics + ScanPhotoGate.
 * Preview convenience only: it does not measure the pack or accept a reading.
 * A clock alone cannot fire — the view must be bright enough, detailed,
 * steady, and different from the last saved photo.
 */

export function sampleLuma(width, height, luma) {
  if (width < 40 || height < 40) {
    throw new Error("Preview is too small to judge.");
  }
  const signature = new Array(32 * 24);
  let sum = 0;
  let bright = 0;
  let n = 0;
  let lapSum = 0;
  let lapSquared = 0;
  for (let gy = 0; gy < 24; gy++) {
    for (let gx = 0; gx < 32; gx++) {
      const x0 = Math.floor(width * (0.1 + (0.8 * gx) / 32));
      const x1 = Math.floor(width * (0.1 + (0.8 * (gx + 1)) / 32));
      const y0 = Math.floor(height * (0.1 + (0.8 * gy) / 24));
      const y1 = Math.floor(height * (0.1 + (0.8 * (gy + 1)) / 24));
      let blockSum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const value = luma(x, y);
          blockSum += value;
          count += 1;
          sum += value;
          n += 1;
          if (value > 245) bright += 1;
        }
      }
      signature[gy * 32 + gx] = count ? blockSum / count : 0;
      const x = Math.floor((x0 + x1) / 2);
      const y = Math.floor((y0 + y1) / 2);
      const lap = luma(x - 1, y) + luma(x + 1, y) + luma(x, y - 1) + luma(x, y + 1) - 4 * luma(x, y);
      lapSum += lap;
      lapSquared += lap * lap;
    }
  }
  return {
    signature,
    mean: sum / n,
    glare: bright / n,
    detail: lapSquared / 768 - (lapSum / 768) * (lapSum / 768),
  };
}

export function sampleImageData(image) {
  const { data, width, height } = image;
  return sampleLuma(width, height, (x, y) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const i = (cy * width + cx) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  });
}

function normalize(values) {
  if (!values || values.length < 4 || values.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const spread = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
  if (spread < 4) return null;
  return values.map((v) => (v - mean) / spread);
}

function difference(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export class ScanPhotoGate {
  constructor({ holdMs = 1100, limit = 120, maxGapMs = 450, stableSamples = 6, noveltyMs = 250 } = {}) {
    if (!(holdMs > 0 && limit > 0 && maxGapMs > 0 && stableSamples >= 3 && noveltyMs >= 0)) {
      throw new Error("Invalid shutter settings.");
    }
    this.holdMs = holdMs;
    this.limit = limit;
    this.maxGapMs = maxGapMs;
    this.stableSamples = stableSamples;
    this.noveltyMs = noveltyMs;
    this.savedCount = 0;
    this.lastSaved = null;
    this.lastSavedPreview = null;
    this.latestPreview = null;
    this.pendingPreview = null;
    this.previous = null;
    this.anchor = null;
    this.stableSince = null;
    this.stableCount = 0;
    this.novelSince = null;
    this.novelCount = 0;
    this.lastTime = null;
    this.inFlight = false;
    this.failurePaused = false;
    this.requestCount = 0;
  }

  resetHold() {
    this.stableSince = null;
    this.anchor = null;
    this.stableCount = 0;
  }

  resetTracking() {
    this.resetHold();
    this.novelSince = null;
    this.novelCount = 0;
    this.previous = null;
    this.lastTime = null;
  }

  restoreSaved(signature, count) {
    if (count < 0 || this.inFlight) throw new Error("Cannot restore a shutter that is mid-capture.");
    this.savedCount = count;
    this.lastSaved = signature ? normalize(signature) : null;
    this.lastSavedPreview = null;
    this.latestPreview = null;
    this.pendingPreview = null;
    this.failurePaused = false;
    this.resetTracking();
  }

  pause() {
    this.resetTracking();
  }

  resume() {
    this.failurePaused = false;
    this.resetTracking();
  }

  beginManual(currentSavedCount) {
    if (currentSavedCount < 0) throw new Error("Saved count cannot be negative.");
    this.savedCount = Math.max(this.savedCount, currentSavedCount);
    if (this.inFlight || this.savedCount >= this.limit) return false;
    this.inFlight = true;
    this.requestCount = this.savedCount;
    this.pendingPreview = this.latestPreview ? this.latestPreview.slice() : null;
    this.resetHold();
    return true;
  }

  finish(success, actualSavedSignature = null) {
    if (!this.inFlight) return;
    this.inFlight = false;
    this.resetTracking();
    if (success) {
      this.savedCount = Math.max(this.savedCount, this.requestCount + 1);
      this.lastSaved = actualSavedSignature ? normalize(actualSavedSignature) : null;
      this.lastSavedPreview = this.pendingPreview ? this.pendingPreview.slice() : null;
      this.failurePaused = false;
    } else {
      this.failurePaused = true;
    }
    this.pendingPreview = null;
  }

  update(frame, timeMs, automatic, currentSavedCount) {
    if (currentSavedCount < 0) throw new Error("Saved count cannot be negative.");
    if (currentSavedCount > this.savedCount) {
      this.savedCount = currentSavedCount;
      this.lastSaved = null;
      this.lastSavedPreview = null;
      this.resetTracking();
    }
    const normalized = normalize(frame.signature);
    const gap = this.lastTime == null || timeMs <= this.lastTime || timeMs - this.lastTime > this.maxGapMs;
    if (gap) {
      this.resetHold();
      this.novelSince = null;
      this.novelCount = 0;
      this.previous = null;
    }
    this.lastTime = timeMs;
    const motion = normalized && this.previous ? difference(this.previous, normalized) : null;
    this.previous = normalized;
    this.latestPreview = normalized;
    if (this.inFlight) return { message: "Saving original…", holdProgress: 0, capture: false, motion };

    const invalid = !Number.isFinite(frame.mean) || frame.mean < 0 || frame.mean > 255
      || !Number.isFinite(frame.glare) || frame.glare < 0 || frame.glare > 1
      || !Number.isFinite(frame.detail) || frame.detail < 0;
    let quality = null;
    if (invalid) quality = "Preview quality is unavailable. Check the image and use the manual shutter.";
    else if (frame.mean < 45) quality = "Add diffuse light; the preview is too dark.";
    else if (frame.mean > 220) quality = "The preview is very bright. Reduce the light or exposure.";
    else if (frame.glare > 0.25) quality = "Strong highlights: reduce glare without moving the product.";
    else if (frame.detail < 65) quality = "The preview looks soft. Hold still and tap the product to focus.";
    else if (!normalized) quality = "Keep textured detail in view; automatic view comparison is unavailable.";
    else if (motion == null) quality = "Checking live view stability…";
    else if (motion > 0.1) quality = "Move more slowly, then pause for a photo.";

    if (this.savedCount >= this.limit) {
      this.resetHold();
      return { message: "Photo limit reached. Review the saved originals.", holdProgress: 0, capture: false, motion };
    }
    if (this.failurePaused) {
      this.resetHold();
      return { message: "Automatic paused after a save failure. Review the interrupted photo, then resume.", holdProgress: 0, capture: false, motion };
    }
    if (!automatic) {
      this.resetHold();
      this.novelSince = null;
      this.novelCount = 0;
      return { message: `Automatic paused. ${quality || "Use the manual shutter when ready."}`, holdProgress: 0, capture: false, motion };
    }
    if (this.savedCount > 0 && !this.lastSaved) {
      this.resetHold();
      return { message: "Saved-view comparison is unavailable. Take a manual photo to restore the reference.", holdProgress: 0, capture: false, motion };
    }
    if (quality || !normalized) {
      this.resetHold();
      this.novelSince = null;
      this.novelCount = 0;
      return { message: quality || "Check the preview.", holdProgress: 0, capture: false, motion };
    }

    if (this.lastSaved) {
      if (!this.lastSavedPreview) this.lastSavedPreview = normalized.slice();
      const previewGap = this.lastSavedPreview ? difference(this.lastSavedPreview, normalized) : Infinity;
      if (difference(this.lastSaved, normalized) < 0.22 || previewGap < 0.22) {
        this.resetHold();
        this.novelSince = null;
        this.novelCount = 0;
        return { message: "Move a small step to a new view; keep most of the previous view overlapping.", holdProgress: 0, capture: false, motion };
      }
      if (this.novelSince == null) this.novelSince = timeMs;
      this.novelCount += 1;
      if (timeMs - this.novelSince < this.noveltyMs || this.novelCount < 3) {
        this.resetHold();
        return { message: "Checking the changed view. Pause and hold still.", holdProgress: 0, capture: false, motion };
      }
    }

    if (this.anchor && difference(this.anchor, normalized) > 0.12) {
      this.resetHold();
      return { message: "The view is still drifting. Pause before the next photo.", holdProgress: 0, capture: false, motion };
    }
    if (this.stableSince == null) {
      this.stableSince = timeMs;
      this.anchor = normalized.slice();
      this.stableCount = 0;
    }
    this.stableCount += 1;
    const progress = Math.min(1, Math.max(0, (timeMs - this.stableSince) / this.holdMs));
    if (progress >= 1 && this.stableCount >= this.stableSamples) {
      this.inFlight = true;
      this.requestCount = this.savedCount;
      this.pendingPreview = normalized.slice();
      return { message: "Capturing this steady view…", holdProgress: 1, capture: true, motion };
    }
    return { message: "Pause for photo · hold this view steady", holdProgress: progress, capture: false, motion };
  }
}
