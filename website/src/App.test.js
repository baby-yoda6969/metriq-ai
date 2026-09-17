import { describe, it, expect } from "vitest";
import {
  parseQuantity,
  isExemptQuantity,
  maxPermissibleError,
  computeOverallStatus,
  applyFieldCorrections,
} from "./lib/scanLogic.js";

describe("parseQuantity / isExemptQuantity", () => {
  it("parses grams, kilograms, and litres into a normalized {value, unit}", () => {
    expect(parseQuantity("52 g")).toEqual({ value: 52, unit: "g" });
    expect(parseQuantity("1.5 kg")).toEqual({ value: 1500, unit: "g" });
    expect(parseQuantity("2 l")).toEqual({ value: 2000, unit: "ml" });
  });

  it("returns null for unparseable strings", () => {
    expect(parseQuantity("a lot")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
  });

  it("treats ≤10g/10ml as the Rule 26(a) exemption threshold", () => {
    expect(isExemptQuantity(10)).toBe(true);
    expect(isExemptQuantity(10.1)).toBe(false);
  });
});

describe("maxPermissibleError (First Schedule, Table I)", () => {
  it("uses the real tiered table, not a flat percentage", () => {
    expect(maxPermissibleError(50)).toBeCloseTo(50 * 0.09); // up to 50g: 9%
    expect(maxPermissibleError(80)).toBeCloseTo(4.5); // 50-100g: 4.5g absolute
    expect(maxPermissibleError(150)).toBeCloseTo(150 * 0.045); // 100-200g: 4.5%
    expect(maxPermissibleError(250)).toBeCloseTo(9); // 200-300g: 9g absolute
    expect(maxPermissibleError(20000)).toBeCloseTo(20000 * 0.01); // >15000g: 1%
  });

  it("is not a flat 5% at any tier", () => {
    for (const qty of [30, 80, 150, 250, 400, 800, 5000, 12000, 20000]) {
      expect(maxPermissibleError(qty)).not.toBeCloseTo(qty * 0.05, 5);
    }
  });
});

describe("computeOverallStatus / applyFieldCorrections", () => {
  const fields = [
    { name: "Net Quantity", value: "52 g", status: "compliant", explanation: "" },
    { name: "Consumer Care Details", value: null, status: "missing", explanation: "" },
  ];

  it("is non_compliant if any field isn't compliant", () => {
    expect(computeOverallStatus(fields)).toBe("non_compliant");
  });

  it("is compliant once every field is compliant", () => {
    const allGood = fields.map((f) => ({ ...f, status: "compliant" }));
    expect(computeOverallStatus(allGood)).toBe("compliant");
  });

  it("folds a correction into the field itself — status flips to compliant", () => {
    const corrections = {
      "Consumer Care Details": { correctedValue: "1800-419-6572", originalValue: null },
    };
    const corrected = applyFieldCorrections(fields, corrections);
    const careField = corrected.find((f) => f.name === "Consumer Care Details");
    expect(careField.status).toBe("compliant");
    expect(careField.value).toBe("1800-419-6572");
    expect(computeOverallStatus(corrected)).toBe("compliant");
  });

  it("returns the same array reference when there are no corrections", () => {
    expect(applyFieldCorrections(fields, {})).toBe(fields);
  });
});
