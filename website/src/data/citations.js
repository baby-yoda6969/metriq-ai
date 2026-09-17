// Statutory citations for each of the 5 mandatory declaration fields, and
// the general statutory basis paragraphs used in the PDF report. Shared by
// FieldRow (the inline citation shown under a field's verdict) and the PDF
// builder, so the two never drift apart.
export const RULE_CITATIONS = {
  "Manufacturer / Packer / Importer Name & Address": {
    rule: "Rule 6(1)(a)",
    act: "Legal Metrology (Packaged Commodities) Rules, 2011",
  },
  "Net Quantity": {
    rule: "Rule 6(1)(c) r/w Rule 5",
    act: "Legal Metrology (Packaged Commodities) Rules, 2011",
  },
  "Maximum Retail Price (incl. of all taxes)": {
    rule: "Rule 6(1)(e) r/w Rule 18",
    act: "Legal Metrology (Packaged Commodities) Rules, 2011",
  },
  "Month & Year of Manufacture / Packing": {
    rule: "Rule 6(1)(d)",
    act: "Legal Metrology (Packaged Commodities) Rules, 2011",
  },
  // Rule 6(2), not 6(1)(f): 6(1)(f) is actually the (unrelated) dimensions
  // declaration. Confirmed against rule_engine_ref/summarised_checklist.md
  // §2, row 9 ("Consumer care details | 6(2)"); server/rules.js's
  // deriveFieldStatus already cited 6(2) correctly, so this badge was
  // showing a different rule number than the explanation text right next
  // to it for the same field.
  "Consumer Care Details": {
    rule: "Rule 6(2)",
    act: "Legal Metrology (Packaged Commodities) Rules, 2011",
  },
};

export const STATUTORY_BASIS = [
  "Legal Metrology Act, 2009 (Act No. 1 of 2010), Section 18: Declarations on pre-packaged commodities.",
  "Legal Metrology (Packaged Commodities) Rules, 2011, Rule 6: Declarations to be made on every package.",
  "Contravention of the above is punishable under Section 36 of the Legal Metrology Act, 2009, with a fine that may extend to Rs. 25,000 for a first contravention, and enhanced fines and/or imprisonment for repeat offences.",
];
