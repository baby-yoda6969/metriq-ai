import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareFaceImage } from "./quickModel.js";

describe("prepareFaceImage", () => {
  it("crops a CamMeter face box out of the surrounding frame", async () => {
    const png = await sharp({
      create: {
        width: 200,
        height: 160,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer();
    const prepared = await prepareFaceImage(png, [
      [0.25, 0.2],
      [0.75, 0.2],
      [0.75, 0.8],
      [0.25, 0.8],
    ]);
    const meta = await sharp(prepared.jpeg).metadata();
    expect(prepared.cropped).toBe(true);
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(96);
    expect(prepared.corners).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it("leaves a full-frame photo uncropped", async () => {
    const png = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: { r: 200, g: 180, b: 40 },
      },
    })
      .png()
      .toBuffer();
    const prepared = await prepareFaceImage(png, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const meta = await sharp(prepared.jpeg).metadata();
    expect(prepared.cropped).toBe(false);
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(60);
  });
});
