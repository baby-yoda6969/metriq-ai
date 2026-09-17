import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { sampleQr } from "./sampleQr.js";

describe("physical sample QR", () => {
  for (const id of ["SMP-065819DA", "SMP-FFFFFFFF", "SMP-00000000"]) {
    it(`decodes the rendered modules to ${id}`, () => {
      const { extent, path } = sampleQr(id);
      const scale = 4;
      const width = extent * scale;
      const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
      // Rasterize the exact SVG path used by the component, then use an independent decoder.
      for (const [, x, y] of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
        expect(Number(x)).toBeGreaterThanOrEqual(4);
        expect(Number(y)).toBeGreaterThanOrEqual(4);
        expect(Number(x)).toBeLessThan(extent - 4);
        expect(Number(y)).toBeLessThan(extent - 4);
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const offset = ((Number(y) * scale + dy) * width + Number(x) * scale + dx) * 4;
          pixels.fill(0, offset, offset + 3);
        }
      }
      expect(jsQR(pixels, width, width)?.data).toBe(id);
    });
  }
});
