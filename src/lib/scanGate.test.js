import { describe, expect, it } from "vitest";
import { ScanPhotoGate } from "./scanGate.js";

function textured(seed) {
  return {
    signature: Array.from({ length: 768 }, (_, i) => ((i * 13 + seed) % 90) + 30),
    mean: 120,
    glare: 0.02,
    detail: 180,
  };
}

describe("ScanPhotoGate", () => {
  it("refuses a dark preview", () => {
    const gate = new ScanPhotoGate();
    const advice = gate.update({ ...textured(1), mean: 10 }, 0, true, 0);
    expect(advice.capture).toBe(false);
    expect(advice.message).toMatch(/too dark/);
  });

  it("captures only after the view has been held steady", () => {
    const gate = new ScanPhotoGate();
    const frame = textured(4);
    let advice = null;
    for (let t = 0; t <= 2000; t += 100) {
      advice = gate.update(frame, t, true, 0);
      if (advice.capture) break;
    }
    expect(advice.capture).toBe(true);
    expect(advice.holdProgress).toBe(1);
    expect(gate.inFlight).toBe(true);
  });

  it("asks for a new view after a photo is saved", () => {
    const gate = new ScanPhotoGate();
    const first = textured(4);
    let advice = null;
    for (let t = 0; t <= 2000; t += 100) {
      advice = gate.update(first, t, true, 0);
      if (advice.capture) break;
    }
    gate.finish(true, first.signature);
    gate.update(first, 3000, true, gate.savedCount);
    const again = gate.update(first, 3100, true, gate.savedCount);
    expect(again.capture).toBe(false);
    expect(again.message).toMatch(/new view/);
  });
});
