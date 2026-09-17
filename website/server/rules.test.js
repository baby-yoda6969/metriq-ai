import { describe, it, expect } from "vitest";
import { deriveFieldStatus, applyDeterministicRules } from "./rules.js";

// These exercise the actual deterministic-verdict claim (Phase 1 of the
// post-review fix pass): the same input must always produce the same
// output, grounded in the real Legal Metrology (Packaged Commodities)
// Rules, 2011 (see rule_engine_ref/).

describe("deriveFieldStatus", () => {
  it("marks a field missing when the value is empty/null-like", () => {
    expect(deriveFieldStatus("Net Quantity", null).status).toBe("missing");
    expect(deriveFieldStatus("Net Quantity", "").status).toBe("missing");
    expect(deriveFieldStatus("Net Quantity", "null").status).toBe("missing");
    expect(deriveFieldStatus("Net Quantity", "N/A").status).toBe("missing");
  });

  it("also recognizes the plain-English phrasings Gemini actually returns for an absent field", () => {
    // Real bug, caught live: Gemini reports an absent declaration as "Not
    // declared" / "Not found" / etc., not literally "null" or "n/a". Before
    // this fix those fell through to the field-specific checks below and
    // came back "non_compliant" with a misleading explanation (e.g. "MRP
    // doesn't state inclusive of all taxes") instead of "missing".
    const mrp = "Maximum Retail Price (incl. of all taxes)";
    const mfg = "Month & Year of Manufacture / Packing";
    expect(deriveFieldStatus(mrp, "Not declared").status).toBe("missing");
    expect(deriveFieldStatus(mfg, "Not declared").status).toBe("missing");
    expect(deriveFieldStatus(mrp, "Not found on the label").status).toBe("missing");
    expect(deriveFieldStatus("Consumer Care Details", "Not visible").status).toBe("missing");
    expect(deriveFieldStatus("Net Quantity", "Nil").status).toBe("missing");
  });

  it("requires a 6-digit PIN code in the manufacturer address (Rule 10(1))", () => {
    const field = "Manufacturer / Packer / Importer Name & Address";
    expect(deriveFieldStatus(field, "Acme Co, MG Road, Bengaluru - 560001").status).toBe("compliant");
    expect(deriveFieldStatus(field, "Acme Co, MG Road, Bengaluru").status).toBe("non_compliant");
  });

  it("also accepts a PIN code printed with the official mid-code space or hyphen", () => {
    // Real pack: a PIN split as "560 001" or "560-001" is still a valid PIN,
    // not a missing one — this used to require 6 contiguous digits.
    const field = "Manufacturer / Packer / Importer Name & Address";
    expect(deriveFieldStatus(field, "Acme Co, MG Road, Bengaluru - 560 001").status).toBe("compliant");
    expect(deriveFieldStatus(field, "Acme Co, MG Road, Bengaluru - 560-001").status).toBe("compliant");
  });

  it("parses net quantity into standard metric units (Rule 13)", () => {
    expect(deriveFieldStatus("Net Quantity", "52 g").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "1.5 kg").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "some amount").status).toBe("non_compliant");
  });

  it("also accepts common real-label unit abbreviations, not just bare kg/g/l/ml", () => {
    // Real packs, misread as non-compliant before this fix: these are all
    // still standard metric declarations under Rule 13.
    expect(deriveFieldStatus("Net Quantity", "200 Gm").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "200 Gms").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "2 Kgs").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "1 Ltr").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "1.5 Litres").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "500 mL").status).toBe("compliant");
  });

  it("rejects banned counting terms as a quantity declaration (Rule 13(4))", () => {
    expect(deriveFieldStatus("Net Quantity", "1 dozen").status).toBe("non_compliant");
    expect(deriveFieldStatus("Net Quantity", "2 gross").status).toBe("non_compliant");
    expect(deriveFieldStatus("Net Quantity", "1 score").status).toBe("non_compliant");
  });

  it("rejects mixed-unit notation instead of a decimal fraction of one unit (Rule 13(3))", () => {
    // Real violation, missed before this fix: it matched the first unit it
    // found ("kg") and called the whole declaration compliant.
    expect(deriveFieldStatus("Net Quantity", "1 kg 500 g").status).toBe("non_compliant");
    expect(deriveFieldStatus("Net Quantity", "1 l 250 ml").status).toBe("non_compliant");
    // The correctly-formatted equivalent must still pass.
    expect(deriveFieldStatus("Net Quantity", "1.5 kg").status).toBe("compliant");
  });

  it("accepts a count-based declaration for commodities legitimately sold by number (Rule 12(2))", () => {
    expect(deriveFieldStatus("Net Quantity", "N 4").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "6 pcs").status).toBe("compliant");
    expect(deriveFieldStatus("Net Quantity", "Pack of 4").status).toBe("compliant");
  });

  it("treats ≤10g/10ml as exempt (Rule 26(a))", () => {
    const result = deriveFieldStatus("Net Quantity", "8 g");
    expect(result.status).toBe("compliant");
    expect(result.explanation).toMatch(/exempt/i);
  });

  it("flags MRP shown as a range, and requires 'inclusive of all taxes' wording (Rule 6(1)(e))", () => {
    const field = "Maximum Retail Price (incl. of all taxes)";
    expect(deriveFieldStatus(field, "Rs. 99 (incl. of all taxes)").status).toBe("compliant");
    expect(deriveFieldStatus(field, "Rs. 99-129").status).toBe("non_compliant");
    expect(deriveFieldStatus(field, "Rs. 99").status).toBe("non_compliant");
  });

  it("also catches a range with the currency symbol repeated on both sides", () => {
    // Real violation, missed before this fix: repeating "Rs."/"₹" between
    // the two numbers meant no digit immediately followed the dash.
    const field = "Maximum Retail Price (incl. of all taxes)";
    expect(deriveFieldStatus(field, "Rs. 20 - Rs. 25 (incl. of all taxes)").status).toBe("non_compliant");
    expect(deriveFieldStatus(field, "₹20 to ₹25, incl. of all taxes").status).toBe("non_compliant");
  });

  it("requires a recognizable month/year declaration (Rule 6(1)(d))", () => {
    const field = "Month & Year of Manufacture / Packing";
    expect(deriveFieldStatus(field, "08/2026").status).toBe("compliant");
    expect(deriveFieldStatus(field, "Aug 2026").status).toBe("compliant");
    expect(deriveFieldStatus(field, "recently").status).toBe("non_compliant");
  });

  it("also accepts a full packing date, since it still names a month and year (Rule 6(1)(d))", () => {
    const field = "Month & Year of Manufacture / Packing";
    // Real pack, misread as non-compliant before this fix: a full DD/M/YY
    // packing date is a superset of "month & year", not a violation of it.
    expect(deriveFieldStatus(field, "PKD:18/6/20").status).toBe("compliant");
    expect(deriveFieldStatus(field, "18/06/2020").status).toBe("compliant");
    expect(deriveFieldStatus(field, "MFD: 07/07/26").status).toBe("compliant");
  });

  it("accepts a phone number as sufficient consumer care (Rule 6(2))", () => {
    const field = "Consumer Care Details";
    expect(deriveFieldStatus(field, "1800-419-6572").status).toBe("compliant");
  });

  it("only accepts e-mail alone when the active rule text allows the e-mail alternative", () => {
    const field = "Consumer Care Details";
    const withoutAmendment = deriveFieldStatus(field, "care@example.com", "Rule 6(2): phone and e-mail required.");
    expect(withoutAmendment.status).toBe("non_compliant");

    const withAmendment = deriveFieldStatus(field, "care@example.com", "A consumer-care e-mail address is an accepted alternative to a toll-free number.");
    expect(withAmendment.status).toBe("compliant");
  });

  it("returns null for a field name it doesn't recognize, leaving the caller's status alone", () => {
    expect(deriveFieldStatus("Some Unknown Field", "value")).toBeNull();
  });
});

describe("applyDeterministicRules", () => {
  it("recomputes overall_status from the corrected fields, not the model's own opinion", () => {
    const parsed = {
      fields: [
        { name: "Net Quantity", value: "52 g", status: "non_compliant", explanation: "model thought this was wrong" },
        { name: "Maximum Retail Price (incl. of all taxes)", value: "Rs. 20 (incl. of all taxes)", status: "compliant", explanation: "" },
      ],
      overall_status: "non_compliant",
    };
    const result = applyDeterministicRules(parsed, null);
    expect(result.fields[0].status).toBe("compliant"); // deterministic check overrides the model's wrong call
    expect(result.overall_status).toBe("compliant");
  });

  it("is a pure function — the same input always produces the same output", () => {
    const parsed = { fields: [{ name: "Net Quantity", value: "300 g" }] };
    const a = applyDeterministicRules(parsed, null);
    const b = applyDeterministicRules(parsed, null);
    expect(a).toEqual(b);
  });
});
