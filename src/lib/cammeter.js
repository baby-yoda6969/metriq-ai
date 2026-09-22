/**
 * Browser adaptation of CamMeter (Hofmann, Seeland, Mader, IJCV 2018,
 * doi:10.1007/s11263-018-1093-3).
 *
 * Calibration (Eq. 1): ξ_calib = s_ref / x_pixels at the user's minimum
 * focus distance. Measurement: a second, pulled-back photo of the same
 * face, then iterative Harris + RootSIFT matching and scale change from
 * feature distance ratios (SChaFD, Eq. 2–3). ξ_measure = ξ_calib × s_c.
 *
 * The descriptor is a 128-d gradient histogram with RootSIFT normalization
 * (Arandjelović & Zisserman 2012), which is the descriptor family the paper
 * pairs with Harris. OpenCV SIFT is not available in this client.
 */

export const CARD_LONG_EDGE_MM = 85.6;
export const CALIBRATION_KEY = "metriq.cammeter.calibration";
const RT1 = 0.8;
const RT3 = 0.775;
const MAX_SIDE = 400;
const MAX_FEATURES = 160;

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function coefficientOfVariation(values) {
  if (!values || values.length < 2) return Infinity;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (!(mean > 0)) return Infinity;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

/** Eq. 1 — millimetres per pixel at the calibration distance. */
export function pixelScale(referenceMm, pixelSpan) {
  if (!(referenceMm > 0) || !(pixelSpan > 0)) {
    throw new Error("Reference length and pixel span must be positive.");
  }
  return referenceMm / pixelSpan;
}

export function summarizeCalibration(samples, referenceMm) {
  const xs = (samples || []).filter((v) => Number.isFinite(v) && v > 0);
  const cv = coefficientOfVariation(xs);
  return {
    xiCalib: median(xs),
    samples: xs,
    referenceMm,
    cv,
    accepted: xs.length >= 3 && cv < 0.05,
  };
}

export function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!(parsed?.xiCalib > 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCalibration(summary) {
  const payload = {
    xiCalib: summary.xiCalib,
    referenceMm: summary.referenceMm,
    cv: summary.cv,
    samples: summary.samples,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(payload));
  return payload;
}

export function clearCalibration() {
  localStorage.removeItem(CALIBRATION_KEY);
}

function rgbaToGray(image) {
  const { data, width, height } = image;
  const gray = new Float32Array(width * height);
  if (data.length === width * height) {
    gray.set(data);
    return { gray, width, height };
  }
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { gray, width, height };
}

function resizeGray(src, factor) {
  const width = Math.max(8, Math.round(src.width * factor));
  const height = Math.max(8, Math.round(src.height * factor));
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = (y + 0.5) * (src.height / height) - 0.5;
    const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(sy)));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < width; x++) {
      const sx = (x + 0.5) * (src.width / width) - 0.5;
      const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(sx)));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const i00 = src.gray[y0 * src.width + x0];
      const i10 = src.gray[y0 * src.width + x1];
      const i01 = src.gray[y1 * src.width + x0];
      const i11 = src.gray[y1 * src.width + x1];
      gray[y * width + x] = i00 * (1 - fx) * (1 - fy) + i10 * fx * (1 - fy) + i01 * (1 - fx) * fy + i11 * fx * fy;
    }
  }
  return { gray, width, height };
}

function blur3(src) {
  const { gray, width, height } = src;
  const tmp = new Float32Array(gray.length);
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      tmp[y * width + x] = (gray[y * width + xm] + 2 * gray[y * width + x] + gray[y * width + xp]) * 0.25;
    }
  }
  for (let y = 0; y < height; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      out[y * width + x] = (tmp[ym * width + x] + 2 * tmp[y * width + x] + tmp[yp * width + x]) * 0.25;
    }
  }
  return { gray: out, width, height };
}

function harrisCorners(src, maxCorners = MAX_FEATURES) {
  const blurred = blur3(src);
  const { gray, width, height } = blurred;
  const response = new Float32Array(width * height);
  const window = 2;
  for (let y = window + 1; y < height - window - 1; y++) {
    for (let x = window + 1; x < width - window - 1; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let yy = -window; yy <= window; yy++) {
        for (let xx = -window; xx <= window; xx++) {
          const i = (y + yy) * width + (x + xx);
          const ix = gray[i + 1] - gray[i - 1];
          const iy = gray[i + width] - gray[i - width];
          a += ix * ix;
          b += ix * iy;
          c += iy * iy;
        }
      }
      const det = a * c - b * b;
      const trace = a + c;
      response[y * width + x] = det - 0.04 * trace * trace;
    }
  }
  let maxR = 0;
  for (let i = 0; i < response.length; i++) if (response[i] > maxR) maxR = response[i];
  const thresh = maxR * 0.01;
  const corners = [];
  const suppress = 8;
  for (let y = 12; y < height - 12; y++) {
    for (let x = 12; x < width - 12; x++) {
      const r = response[y * width + x];
      if (r < thresh) continue;
      let peak = true;
      for (let yy = -1; yy <= 1 && peak; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          if (xx === 0 && yy === 0) continue;
          if (response[(y + yy) * width + (x + xx)] > r) {
            peak = false;
            break;
          }
        }
      }
      if (!peak) continue;
      corners.push({ x, y, r });
    }
  }
  corners.sort((p, q) => q.r - p.r);
  const kept = [];
  for (const corner of corners) {
    if (kept.some((k) => (k.x - corner.x) ** 2 + (k.y - corner.y) ** 2 < suppress * suppress)) continue;
    kept.push(corner);
    if (kept.length >= maxCorners) break;
  }
  return kept;
}

function gradientAt(gray, width, height, x, y) {
  const xi = Math.max(1, Math.min(width - 2, Math.round(x)));
  const yi = Math.max(1, Math.min(height - 2, Math.round(y)));
  const i = yi * width + xi;
  const ix = gray[i + 1] - gray[i - 1];
  const iy = gray[i + width] - gray[i - width];
  return { mag: Math.hypot(ix, iy), ori: Math.atan2(iy, ix) };
}

function dominantOrientation(src, x, y) {
  const bins = new Float32Array(36);
  for (let yy = -8; yy <= 8; yy++) {
    for (let xx = -8; xx <= 8; xx++) {
      const g = gradientAt(src.gray, src.width, src.height, x + xx, y + yy);
      const bin = Math.round(((g.ori + Math.PI) / (2 * Math.PI)) * 36) % 36;
      const weight = Math.exp(-(xx * xx + yy * yy) / 32);
      bins[bin] += g.mag * weight;
    }
  }
  let best = 0;
  for (let i = 1; i < 36; i++) if (bins[i] > bins[best]) best = i;
  return (best / 36) * 2 * Math.PI - Math.PI;
}

function rootSift(src, x, y) {
  const angle = dominantOrientation(src, x, y);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const hist = new Float32Array(128);
  const cell = 4;
  for (let yy = -8; yy < 8; yy++) {
    for (let xx = -8; xx < 8; xx++) {
      const rx = cos * xx - sin * yy;
      const ry = sin * xx + cos * yy;
      const g = gradientAt(src.gray, src.width, src.height, x + rx, y + ry);
      const rel = g.ori - angle;
      const wrapped = Math.atan2(Math.sin(rel), Math.cos(rel));
      const obin = Math.floor(((wrapped + Math.PI) / (2 * Math.PI)) * 8) % 8;
      const cx = Math.floor((xx + 8) / cell);
      const cy = Math.floor((yy + 8) / cell);
      if (cx < 0 || cy < 0 || cx > 3 || cy > 3) continue;
      const weight = Math.exp(-(xx * xx + yy * yy) / 50);
      hist[(cy * 4 + cx) * 8 + obin] += g.mag * weight;
    }
  }
  let l1 = 0;
  for (let i = 0; i < hist.length; i++) l1 += hist[i];
  if (l1 < 1e-6) return hist;
  for (let i = 0; i < hist.length; i++) hist[i] = Math.sqrt(hist[i] / l1);
  return hist;
}

function describe(src, corners) {
  return corners.map((corner) => ({
    x: corner.x,
    y: corner.y,
    d: rootSift(src, corner.x, corner.y),
  }));
}

function descriptorDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function matchFeatures(left, right) {
  const matches = [];
  if (right.length < 2) return matches;
  for (let i = 0; i < left.length; i++) {
    let best = Infinity;
    let second = Infinity;
    let bestJ = -1;
    for (let j = 0; j < right.length; j++) {
      const dist = descriptorDistance(left[i].d, right[j].d);
      if (dist < best) {
        second = best;
        best = dist;
        bestJ = j;
      } else if (dist < second) {
        second = dist;
      }
    }
    if (bestJ < 0 || !(second > 0)) continue;
    const ratio = best / second;
    if (ratio < RT1) {
      matches.push({
        ix: i,
        iy: bestJ,
        ratio,
        ax: left[i].x,
        ay: left[i].y,
        bx: right[bestJ].x,
        by: right[bestJ].y,
      });
    }
  }
  return matches;
}

function solveLinear(size, matrix) {
  const m = matrix.map((row) => row.slice());
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    const swap = m[col];
    m[col] = m[pivot];
    m[pivot] = swap;
    const div = m[col][col];
    for (let c = col; c <= size; c++) m[col][c] /= div;
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let c = col; c <= size; c++) m[row][c] -= factor * m[col][c];
    }
  }
  return m.map((row) => row[size]);
}

function homographyFrom(src, dst) {
  const rows = [];
  for (let i = 0; i < src.length; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    rows.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  if (src.length === 4) return solveLinear(8, rows);
  const ata = Array.from({ length: 8 }, () => new Array(9).fill(0));
  for (const row of rows) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 9; c++) ata[r][c] += row[r] * row[c];
    }
  }
  return solveLinear(8, ata);
}

function applyH(h, x, y) {
  const w = h[6] * x + h[7] * y + 1;
  if (Math.abs(w) < 1e-8) return null;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

function homographyInliers(matches, threshold) {
  if (matches.length < 4) return [];
  let best = [];
  const n = matches.length;
  const trials = Math.min(120, n * 6);
  for (let t = 0; t < trials; t++) {
    const picked = [];
    const used = new Set();
    while (picked.length < 4 && used.size < n) {
      const idx = Math.floor(Math.random() * n);
      if (used.has(idx)) continue;
      used.add(idx);
      picked.push(matches[idx]);
    }
    const h = homographyFrom(
      picked.map((m) => [m.ax, m.ay]),
      picked.map((m) => [m.bx, m.by])
    );
    if (!h) continue;
    const inliers = [];
    for (const m of matches) {
      const proj = applyH(h, m.ax, m.ay);
      if (!proj) continue;
      if (Math.hypot(proj[0] - m.bx, proj[1] - m.by) <= threshold) inliers.push(m);
    }
    if (inliers.length > best.length) best = inliers;
  }
  if (best.length >= 4) {
    const h = homographyFrom(
      best.map((m) => [m.ax, m.ay]),
      best.map((m) => [m.bx, m.by])
    );
    if (h) {
      const refined = best.filter((m) => {
        const proj = applyH(h, m.ax, m.ay);
        return proj && Math.hypot(proj[0] - m.bx, proj[1] - m.by) <= threshold;
      });
      if (refined.length >= 4) return refined;
    }
  }
  return best;
}

/** SChaFD: median of pairwise distance ratios D_calib ⊘ D_measure (Eq. 3). */
export function schafdScale(calibPts, measurePts) {
  const ratios = [];
  const n = Math.min(calibPts.length, measurePts.length);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dc = Math.hypot(calibPts[i][0] - calibPts[j][0], calibPts[i][1] - calibPts[j][1]);
      const dm = Math.hypot(measurePts[i][0] - measurePts[j][0], measurePts[i][1] - measurePts[j][1]);
      if (dc > 8 && dm > 8) ratios.push(dc / dm);
    }
  }
  return median(ratios);
}

function yieldTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Iterative Harris-SIFT-SChaFD. Both gray images must share the same
 * pixels-per-source-pixel scale. `resizeFactor` is an extra downscale of
 * the close image only, so the reported scale is corrected back.
 */
export async function estimateScaleChange(closeGray, farGray) {
  const farPoints = harrisCorners(farGray);
  const farDesc = describe(farGray, farPoints);
  let resizeFactor = 1;
  let best = null;
  const diagonal = Math.hypot(farGray.width, farGray.height);
  const threshold = Math.max(3.5, diagonal * 0.012);

  for (let iter = 0; iter < 6; iter++) {
    await yieldTick();
    const closeWork = resizeFactor === 1 ? closeGray : resizeGray(closeGray, resizeFactor);
    const closeCorners = harrisCorners(closeWork);
    const closeDesc = describe(closeWork, closeCorners);
    const matches = matchFeatures(closeDesc, farDesc);
    const inliers = homographyInliers(matches, threshold).filter((m) => m.ratio < RT3);
    if (inliers.length < 6) {
      resizeFactor *= 0.8;
      if (resizeFactor < 0.04) break;
      continue;
    }
    const capped = inliers.slice(0, 36);
    const scMatched = schafdScale(
      capped.map((m) => [m.ax, m.ay]),
      capped.map((m) => [m.bx, m.by])
    );
    if (!(scMatched > 0)) {
      resizeFactor *= 0.8;
      if (resizeFactor < 0.04) break;
      continue;
    }
    const scaleChange = scMatched / resizeFactor;
    const candidate = {
      ok: scaleChange >= 0.75 && scaleChange <= 15,
      scaleChange,
      matchCount: inliers.length,
      farPoints: capped.map((m) => [m.bx, m.by]),
    };
    best = candidate;
    const next = Math.min(1, Math.max(0.04, 1 / scaleChange));
    if (Math.abs(next - resizeFactor) / resizeFactor < 0.08) break;
    resizeFactor = next;
  }

  if (!best) {
    return { ok: false, scaleChange: null, matchCount: 0, farPoints: [], reason: "Not enough shared texture between the close and full shots." };
  }
  if (!best.ok) {
    return {
      ...best,
      ok: false,
      reason: best.scaleChange < 0.75
        ? "The full-face photo looks closer than the sharp close-up. Shoot the close photo first, then pull back."
        : "The two photos are too different in scale to measure this face.",
    };
  }
  return best;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function maskBBox(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Feature-hull prior plus a short color iteration, standing in for the
 * paper's GrabCut initialization from the SChaFD convex hull (Sect. 3.2.3).
 * Returns an axis-aligned box on the original far image.
 */
export function segmentFace(image, farPoints) {
  if (!farPoints || farPoints.length < 3) return null;
  const hull = convexHull(farPoints);
  if (hull.length < 3) return null;
  const maxSide = 200;
  const fit = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(8, Math.round(image.width * fit));
  const height = Math.max(8, Math.round(image.height * fit));
  const rgb = new Uint8ClampedArray(width * height * 3);
  const src = image.data;
  const graySrc = src.length === image.width * image.height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
      const o = (y * width + x) * 3;
      if (graySrc) {
        const g = src[sy * image.width + sx];
        rgb[o] = rgb[o + 1] = rgb[o + 2] = g;
      } else {
        const i = (sy * image.width + sx) * 4;
        rgb[o] = src[i];
        rgb[o + 1] = src[i + 1];
        rgb[o + 2] = src[i + 2];
      }
    }
  }
  const poly = hull.map(([x, y]) => [x * fit, y * fit]);
  const fg = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pointInPoly(x, y, poly)) fg[y * width + x] = 1;
    }
  }
  const mean = (pred) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < fg.length; i++) {
      if (!pred(fg[i], i)) continue;
      r += rgb[i * 3];
      g += rgb[i * 3 + 1];
      b += rgb[i * 3 + 2];
      n++;
    }
    return n ? [r / n, g / n, b / n, n] : null;
  };
  for (let iter = 0; iter < 4; iter++) {
    const fgMean = mean((v) => v === 1);
    const bgMean = mean((v, i) => {
      if (v === 1) return false;
      const x = i % width;
      const y = Math.floor(i / width);
      const border = x < width * 0.06 || y < height * 0.06 || x > width * 0.94 || y > height * 0.94;
      return border || v === 0;
    });
    if (!fgMean || !bgMean) break;
    for (let i = 0; i < fg.length; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      if (x < 2 || y < 2 || x > width - 3 || y > height - 3) {
        fg[i] = 0;
        continue;
      }
      const dr = rgb[i * 3] - fgMean[0];
      const dg = rgb[i * 3 + 1] - fgMean[1];
      const db = rgb[i * 3 + 2] - fgMean[2];
      const br = rgb[i * 3] - bgMean[0];
      const bg = rgb[i * 3 + 1] - bgMean[1];
      const bb = rgb[i * 3 + 2] - bgMean[2];
      fg[i] = dr * dr + dg * dg + db * db <= (br * br + bg * bg + bb * bb) * 1.1 ? 1 : 0;
    }
  }
  const seen = new Uint8Array(fg.length);
  let bestCount = 0;
  let bestMask = null;
  const stack = [];
  for (let i = 0; i < fg.length; i++) {
    if (!fg[i] || seen[i] || !pointInPoly(i % width, Math.floor(i / width), poly)) continue;
    const mask = new Uint8Array(fg.length);
    let count = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      if (!fg[cur]) continue;
      mask[cur] = 1;
      count++;
      const x = cur % width;
      const y = Math.floor(cur / width);
      const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
      for (const n of neighbors) {
        if (n < 0 || n >= fg.length || seen[n] || !fg[n]) continue;
        const nx = n % width;
        if (Math.abs(nx - x) > 1) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestMask = mask;
    }
  }
  const box = bestMask ? maskBBox(bestMask, width, height) : null;
  const hullBox = (() => {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  })();
  const chosen = box && box.w > 4 && box.h > 4 ? box : hullBox;
  return {
    x: chosen.x / fit,
    y: chosen.y / fit,
    w: chosen.w / fit,
    h: chosen.h / fit,
  };
}

function normalizedCorners(bbox, width, height) {
  const x0 = Math.min(1, Math.max(0, bbox.x / width));
  const y0 = Math.min(1, Math.max(0, bbox.y / height));
  const x1 = Math.min(1, Math.max(0, (bbox.x + bbox.w) / width));
  const y1 = Math.min(1, Math.max(0, (bbox.y + bbox.h) / height));
  const area = Math.abs((x1 - x0) * (y1 - y0));
  if (area < 0.08 || area > 0.92) return null;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export async function measureFace(closeFrame, farFrame, xiCalib) {
  if (!(xiCalib > 0)) {
    return { ok: false, reason: "Calibrate the camera at minimum focus before measuring a face." };
  }
  const close = rgbaToGray(closeFrame);
  const far = rgbaToGray(farFrame);
  const baseFit = Math.min(1, MAX_SIDE / Math.max(close.width, close.height));
  const farFit = baseFit * (close.width / far.width);
  const closeWork = resizeGray(close, baseFit);
  const farWork = resizeGray(far, farFit);
  const scale = await estimateScaleChange(closeWork, farWork);
  if (!scale.ok) return scale;

  const xiMeasure = xiCalib * scale.scaleChange;
  const originalPoints = scale.farPoints.map(([x, y]) => [x / farFit, y / farFit]);
  const bbox = segmentFace(farFrame, originalPoints) || bboxFromPoints(originalPoints);
  if (!bbox || !(bbox.w > 1) || !(bbox.h > 1)) {
    return { ok: false, reason: "The face outline could not be separated from the background.", scaleChange: scale.scaleChange, matchCount: scale.matchCount };
  }
  const widthMm = bbox.w * xiMeasure;
  const heightMm = bbox.h * xiMeasure;
  return {
    ok: true,
    widthMm,
    heightMm,
    diameterMm: Math.hypot(widthMm, heightMm),
    scaleChange: scale.scaleChange,
    xiMeasure,
    matchCount: scale.matchCount,
    bbox,
    corners: normalizedCorners(bbox, farFrame.width, farFrame.height),
  };
}

function bboxFromPoints(points) {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

const AXIS = {
  front: ["width", "height"],
  back: ["width", "height"],
  left: ["depth", "height"],
  right: ["depth", "height"],
  top: ["width", "depth"],
  bottom: ["width", "depth"],
};

/**
 * Image width/height on each upright face become pack width, height, depth.
 * Proportions match six-face-box-v1: [width, height, depth].
 */
export function reconcilePackSize(faceMeasures) {
  const buckets = { width: [], height: [], depth: [] };
  const faces = [];
  for (const face of faceMeasures || []) {
    const axes = AXIS[face.face];
    if (!axes || !(face.widthMm > 0) || !(face.heightMm > 0)) continue;
    buckets[axes[0]].push(face.widthMm);
    buckets[axes[1]].push(face.heightMm);
    faces.push({
      face: face.face,
      widthMm: face.widthMm,
      heightMm: face.heightMm,
      diameterMm: face.diameterMm,
      scaleChange: face.scaleChange,
      matchCount: face.matchCount,
    });
  }
  const widthMm = median(buckets.width);
  const heightMm = median(buckets.height);
  const depthMm = median(buckets.depth);
  const w = widthMm || heightMm || 1;
  const h = heightMm || widthMm || 1;
  const d = depthMm || Math.min(w, h) * 0.35;
  let props = [w, h, d];
  const max = Math.max(...props);
  const minAllowed = max / 40;
  props = props.map((v) => Math.max(minAllowed, v));
  const peak = Math.max(...props);
  const proportions = props.map((v) => (v / peak) * 10);
  return {
    method: "iterative-harris-rootsift-schafd",
    paper: "Hofmann, Seeland, Mader. Efficiently Annotating Object Images with Absolute Size Information Using Mobile Devices. IJCV 2018. doi:10.1007/s11263-018-1093-3",
    widthMm,
    heightMm,
    depthMm,
    depthEstimated: !depthMm,
    proportions,
    faces,
    measuredAxes: {
      width: buckets.width.length,
      height: buckets.height.length,
      depth: buckets.depth.length,
    },
  };
}
