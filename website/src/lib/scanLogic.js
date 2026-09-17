// Pure business logic for the scan/analyze flow: no React, no fetch, so
// it's cheap to unit test and safe to share between ScanView, the
// e-commerce monitor simulation, and the PDF report.

export function computeOverallStatus(fields) {
  return fields.some((f) => f.status !== "compliant") ? "non_compliant" : "compliant";
}

// A field correction used to be stored only in a side-map that FieldRow
// displayed but nothing else read: computeOverallStatus, the
// confirm-violation flagged list, and the saved case all kept using the
// original (possibly wrong) AI-read status/value, so a corrected field
// never actually stopped counting as a violation. This folds corrections
// into the fields array itself, so every consumer sees one consistent,
// corrected record.
export function applyFieldCorrections(fields, corrections) {
  if (!corrections || Object.keys(corrections).length === 0) return fields;
  return fields.map((f) => {
    const c = corrections[f.name];
    if (!c) return f;
    return {
      ...f,
      value: c.correctedValue,
      status: "compliant",
      explanation: "Corrected by inspector after evidence review; see audit trail.",
    };
  });
}

// Parses a declared/measured net-quantity string like "52 g" or "1.5 kg"
// into a normalized { value, unit } pair (grams or millilitres), for the
// scale comparison and the exemption check below. Returns null if
// unparseable.
//
// Bug fix: this used to take the FIRST number+unit match only. A real pack
// commonly declares a base-plus-offer breakdown ("110g+20g EXTRA=130g"), and
// the model doesn't transcribe it in a fixed order — the very same Parle-G
// sample photo came back as "110g+20g EXTRA= 130g" in one run and "130g
// (110g+20g EXTRA)" in another, live, within this session. Taking "the
// first number" silently used the 110g base as the declared quantity half
// the time, which would flag a correctly-filled 130g pack as a large,
// false overfill/shortfall against a certified scale reading. The true
// total in a base+extra breakdown is always the largest number printed,
// regardless of which one the transcription happens to lead with, so this
// now scans every number+unit match and keeps the largest.
export function parseQuantity(str) {
  if (!str) return null;
  const matches = [...String(str).matchAll(/([\d.]+)\s*(kg|g|l|ml)\b/gi)];
  if (matches.length === 0) return null;
  let best = null;
  for (const m of matches) {
    let value = parseFloat(m[1]);
    let unit = m[2].toLowerCase();
    if (unit === "kg") { value *= 1000; unit = "g"; }
    if (unit === "l") { value *= 1000; unit = "ml"; }
    if (!best || value > best.value) best = { value, unit };
  }
  return best;
}

// Commodity-exemption check per Rule 26(a): packages of 10g/10ml or less
// are exempt from most mandatory declarations. Threshold confirmed
// against the primary consolidated Rules text (rule_engine_ref/).
export function isExemptQuantity(value) {
  return value != null && value <= 10;
}

// First Schedule, Table I (Rule 22): the real maximum permissible error
// for a declared net quantity, tiered by quantity band. This is not a
// flat percentage (a flat percentage is wrong at both ends: too lenient
// for large packages, too strict for very small ones). Source:
// rule_engine_ref/official_govt_summary.pdf, First Schedule.
const WEIGHT_TOLERANCE_TABLE = [
  { upTo: 50, pct: 9 },
  { upTo: 100, abs: 4.5 },
  { upTo: 200, pct: 4.5 },
  { upTo: 300, abs: 9 },
  { upTo: 500, pct: 3 },
  { upTo: 1000, abs: 15 },
  { upTo: 10000, pct: 1.5 },
  { upTo: 15000, abs: 150 },
  { upTo: Infinity, pct: 1.0 },
];

export function maxPermissibleError(declaredValue) {
  if (declaredValue == null) return 0;
  const tier = WEIGHT_TOLERANCE_TABLE.find((t) => declaredValue <= t.upTo) || WEIGHT_TOLERANCE_TABLE[WEIGHT_TOLERANCE_TABLE.length - 1];
  return tier.abs != null ? tier.abs : declaredValue * (tier.pct / 100);
}

export function generateNonce() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// GPS coordinates stand-in per region, used to stamp a capture's location
// without needing real device geolocation for the demo.
export const GPS_BY_REGION = {
  Bengaluru: "12.9716° N, 77.5946° E",
  Chennai: "13.0827° N, 80.2707° E",
  Hyderabad: "17.3850° N, 78.4867° E",
  Mumbai: "19.0760° N, 72.8777° E",
};

// Centralized here so every consumer agrees on "currently active" instead
// of each re-deriving it with its own `.find`.
export function getActiveRuleVersion(ruleVersions) {
  return ruleVersions[0] || null;
}
