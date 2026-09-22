import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  estimateScaleChange,
  pixelScale,
  reconcilePackSize,
  schafdScale,
  summarizeCalibration,
} from "./cammeter.js";

describe("CamMeter calibration", () => {
  it("computes millimetres per pixel from a known length", () => {
    expect(pixelScale(85.6, 200)).toBeCloseTo(0.428, 5);
  });

  it("accepts a calibration once three samples stay inside a 5% spread", () => {
    const tight = summarizeCalibration([0.05, 0.051, 0.049], 85.6);
    expect(tight.accepted).toBe(true);
    expect(tight.xiCalib).toBeCloseTo(0.05, 5);
    expect(coefficientOfVariation([0.05, 0.051, 0.049])).toBeLessThan(0.05);

    const loose = summarizeCalibration([0.04, 0.05, 0.07], 85.6);
    expect(loose.accepted).toBe(false);
  });
});

describe("SChaFD scale change", () => {
  it("takes the median pairwise distance ratio", () => {
    const close = [[0, 0], [40, 0], [0, 30], [40, 30]];
    const far = close.map(([x, y]) => [x * 0.5, y * 0.5]);
    expect(schafdScale(close, far)).toBeCloseTo(2, 5);
  });
});

describe("pack dimensions", () => {
  it("turns upright face measurements into width, height, and depth", () => {
    const size = reconcilePackSize([
      { face: "front", widthMm: 80, heightMm: 140 },
      { face: "back", widthMm: 82, heightMm: 138 },
      { face: "left", widthMm: 30, heightMm: 141 },
      { face: "right", widthMm: 32, heightMm: 139 },
      { face: "top", widthMm: 81, heightMm: 31 },
      { face: "bottom", widthMm: 79, heightMm: 29 },
    ]);
    expect(size.widthMm).toBeCloseTo(80.5, 1);
    expect(size.heightMm).toBeCloseTo(139.5, 1);
    expect(size.depthMm).toBeCloseTo(30.5, 1);
    expect(Math.max(...size.proportions)).toBeCloseTo(10, 5);
    expect(size.proportions[0] / size.proportions[1]).toBeCloseTo(size.widthMm / size.heightMm, 2);
    expect(size.depthEstimated).toBe(false);
  });
});

function stampMarker(gray, width, height, cx, cy, seed, cell) {
  let state = seed;
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 5; i++) {
      state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
      const on = state % 3 !== 0;
      const x0 = Math.round(cx + (i - 2.5) * cell);
      const y0 = Math.round(cy + (j - 2.5) * cell);
      for (let y = y0; y < y0 + cell; y++) {
        for (let x = x0; x < x0 + cell; x++) {
          if (x > 1 && y > 1 && x < width - 2 && y < height - 2) gray[y * width + x] = on ? 230 : 25;
        }
      }
    }
  }
}

function markerScene(size) {
  const gray = new Float32Array(size * size);
  gray.fill(48);
  const spots = [
    [0.24, 0.3, 11],
    [0.72, 0.26, 29],
    [0.28, 0.72, 47],
    [0.7, 0.68, 71],
    [0.5, 0.48, 97],
    [0.84, 0.5, 131],
  ];
  const cell = Math.round(size / 32);
  for (const [nx, ny, seed] of spots) stampMarker(gray, size, size, nx * size, ny * size, seed, cell);
  return { gray, width: size, height: size };
}

function scaleAboutCenter(src, factor) {
  const { gray, width, height } = src;
  const out = new Float32Array(gray.length);
  out.fill(48);
  for (let y = 0; y < height; y++) {
    const sy = (y - height / 2) / factor + height / 2;
    const y0 = Math.floor(sy);
    const y1 = y0 + 1;
    const fy = sy - y0;
    if (y0 < 0 || y1 >= height) continue;
    for (let x = 0; x < width; x++) {
      const sx = (x - width / 2) / factor + width / 2;
      const x0 = Math.floor(sx);
      const x1 = x0 + 1;
      const fx = sx - x0;
      if (x0 < 0 || x1 >= width) continue;
      const v =
        gray[y0 * width + x0] * (1 - fx) * (1 - fy) +
        gray[y0 * width + x1] * fx * (1 - fy) +
        gray[y1 * width + x0] * (1 - fx) * fy +
        gray[y1 * width + x1] * fx * fy;
      out[y * width + x] = v;
    }
  }
  return { gray: out, width, height };
}

describe("iterative Harris scale change", () => {
  it("recovers the pull-back scale between two views of the same markers", async () => {
    const close = markerScene(240);
    const far = scaleAboutCenter(close, 0.72);
    const result = await estimateScaleChange(close, far);
    expect(result.ok).toBe(true);
    expect(result.scaleChange).toBeGreaterThan(1.05);
    expect(result.scaleChange).toBeLessThan(1.9);
    expect(result.matchCount).toBeGreaterThanOrEqual(6);
  }, 20000);
});
